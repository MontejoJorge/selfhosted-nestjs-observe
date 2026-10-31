import { Inject, Injectable } from '@nestjs/common';
import { sql, type RawBuilder } from 'kysely';
import { KYSELY, type Db } from '../../database/database.types.js';
import type { Page } from '../common/cursor.js';
import { histogramsByKey, rollupPercentiles } from '../common/rollups.js';
import { inApplications, type TelemetryScope } from '../common/scope.js';
import { ratio } from '../common/sql.js';
import type { TimeWindow } from '../common/time-window.js';
import {
  ACTIVE_INSTANCE_MS,
  JOB_THRESHOLDS,
  REQUEST_THRESHOLDS,
  assess,
  combineVerdicts,
  sideWindows,
  windowMs,
  type ComparisonThresholds,
  type ReleaseWindow,
  type SideWindows,
} from './release-comparison.js';
import { encodeReleaseCursor } from './release-cursor.js';
import type {
  ComparisonDto,
  ExecutionStatsDto,
  JobImpactDto,
  OperationImpactDto,
  ReleaseDetailDto,
  ReleaseMarkerDto,
  ReleaseSummaryDto,
} from './releases.dto.js';
import {
  ReleasesRepository,
  type ReleaseListFilter,
} from './releases.repository.js';

const MARKERS_LIMIT = 500;
const TOP_IMPACT = 10;
const NEW_ERROR_GROUPS_LIMIT = 50;
const INSTANCES_LIMIT = 200;

/** The two minute rollups a release is compared on, and their group keys. */
const KINDS = {
  requests: {
    table: 'requests_1m',
    errors: 'errors',
    keys: ['operation_id', 'protocol', 'method'],
    thresholds: REQUEST_THRESHOLDS,
  },
  jobs: {
    table: 'jobs_1m',
    errors: 'failed',
    keys: ['queue', 'name'],
    thresholds: JOB_THRESHOLDS,
  },
} as const satisfies Record<
  string,
  {
    table: string;
    errors: string;
    keys: readonly string[];
    thresholds: ComparisonThresholds;
  }
>;
type Kind = keyof typeof KINDS;
type Side = 'b' | 'a';

interface ReleaseRow {
  application_id: string;
  application_name: string;
  service_version: string;
  first_seen_at: Date;
  last_seen_at: Date;
  instance_count: number;
  previous_version: string | null;
}

/** One release to compare: its index in the request and its windows. */
interface CompareKey {
  idx: number;
  applicationId: string;
  windows: SideWindows;
}

interface StatsRow {
  idx: number;
  side: Side;
  /** group key values, in `KINDS[kind].keys` order (empty without grouping) */
  group: string[];
  count: number;
  errors: number;
  sum_ms: number;
  min_ms: number | null;
  max_ms: number | null;
}

interface CellRow {
  idx: number;
  side: Side;
  group: string[];
  bucket: number;
  count: number;
}

const keyOf = (idx: number, side: Side, group: readonly string[]) =>
  JSON.stringify([idx, side, ...group]);

/**
 * Releases from `service_versions` (one row per application, instance and version, a few
 * per deploy) and comparisons from the minute rollups.
 *
 * A comparison joins a `values` list of (release, side, application, from, to) to the
 * rollup on `(application_id, minute)`, the leading columns of its primary key, inside a
 * global `[from, to)` on `minute` for partition pruning: one grouped query for the sums
 * and one for the histogram cells, for every release of a page at once.
 */
@Injectable()
export class PostgresReleasesRepository extends ReleasesRepository {
  constructor(@Inject(KYSELY) private readonly db: Db) {
    super();
  }

  async list(filter: ReleaseListFilter): Promise<Page<ReleaseSummaryDto>> {
    const { scope, range, cursor, limit } = filter;
    const conditions: RawBuilder<unknown>[] = [
      sql`p.first_seen_at >= ${range.from}`,
      sql`p.first_seen_at < ${range.to}`,
    ];
    if (cursor)
      conditions.push(
        sql`(p.first_seen_at, p.application_id, p.service_version) < (${cursor.at}, ${cursor.applicationId}::uuid, ${cursor.version})`,
      );
    const rows = await this.releases(
      scope.applicationIds,
      sql.join(conditions, sql` and `),
      limit + 1,
    );
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const items = await this.summarize(page, filter.window, new Date());
    const last = page[page.length - 1];
    return {
      items,
      nextCursor:
        hasMore && last
          ? encodeReleaseCursor({
              at: last.first_seen_at,
              applicationId: last.application_id,
              version: last.service_version,
            })
          : null,
    };
  }

  async markers(
    scope: TelemetryScope,
    range: TimeWindow,
  ): Promise<ReleaseMarkerDto[]> {
    if (scope.instance) {
      // (application_id, first_seen_at) index
      const rows = await this.db
        .selectFrom('service_versions')
        .select(['application_id', 'service_version', 'first_seen_at'])
        .where(inApplications('application_id', scope.applicationIds))
        .where('service_id', '=', scope.instance)
        .where('first_seen_at', '>=', range.from)
        .where('first_seen_at', '<', range.to)
        .orderBy('first_seen_at')
        .limit(MARKERS_LIMIT)
        .execute();
      return rows.map((row) => ({
        applicationId: row.application_id,
        version: row.service_version,
        at: row.first_seen_at.toISOString(),
        serviceId: scope.instance ?? null,
      }));
    }
    const { rows } = await sql<{
      application_id: string;
      service_version: string;
      at: Date;
    }>`
      select application_id, service_version, min(first_seen_at) as at
      from service_versions
      where ${inApplications('application_id', scope.applicationIds)}
      group by application_id, service_version
      having min(first_seen_at) >= ${range.from} and min(first_seen_at) < ${range.to}
      order by at
      limit ${MARKERS_LIMIT}
    `.execute(this.db);
    return rows.map((row) => ({
      applicationId: row.application_id,
      version: row.service_version,
      at: row.at.toISOString(),
      serviceId: null,
    }));
  }

  async applicationsWith(
    scope: TelemetryScope,
    version: string,
  ): Promise<string[]> {
    const rows = await this.db
      .selectFrom('service_versions')
      .select('application_id')
      .distinct()
      .where(inApplications('application_id', scope.applicationIds))
      .where('service_version', '=', version)
      .execute();
    return rows.map((row) => row.application_id);
  }

  async detail(
    applicationId: string,
    version: string,
    window: ReleaseWindow,
  ): Promise<ReleaseDetailDto | null> {
    const [release] = await this.releases(
      [applicationId],
      sql`p.service_version = ${version}`,
      1,
    );
    if (!release) return null;

    const now = new Date();
    const windows = sideWindows(release.first_seen_at, window, now);
    const key: CompareKey = { idx: 0, applicationId, windows };
    const activeSince = new Date(now.getTime() - ACTIVE_INSTANCE_MS);
    const boundary = release.first_seen_at;

    const [[summary], operationStats, jobStats, errorGroups, instances] =
      await Promise.all([
        this.summarize([release], window, now),
        this.stats('requests', [key], true),
        this.stats('jobs', [key], true),
        this.db
          .selectFrom('error_groups')
          .select([
            'id',
            'source',
            'error_class',
            'message',
            'count',
            'first_seen_at',
            'last_seen_at',
          ])
          .where('application_id', '=', applicationId)
          .where('first_seen_at', '>=', boundary)
          .where(
            'first_seen_at',
            '<',
            new Date(boundary.getTime() + windowMs(window)),
          )
          .orderBy('first_seen_at')
          .orderBy('id')
          .limit(NEW_ERROR_GROUPS_LIMIT)
          .execute(),
        this.db
          .selectFrom('service_versions as v')
          .leftJoin('services as s', (join) =>
            join
              .onRef('s.application_id', '=', 'v.application_id')
              .onRef('s.service_id', '=', 'v.service_id'),
          )
          .select([
            'v.service_id',
            'v.first_seen_at',
            'v.last_seen_at',
            sql<boolean>`coalesce(s.service_version = v.service_version and s.last_seen_at >= ${activeSince}, false)`.as(
              'active',
            ),
          ])
          .where('v.application_id', '=', applicationId)
          .where('v.service_version', '=', version)
          .orderBy('active', 'desc')
          .orderBy('v.last_seen_at', 'desc')
          .orderBy('v.service_id')
          .limit(INSTANCES_LIMIT)
          .execute(),
      ]);

    const [operations, jobImpact] = await Promise.all([
      this.impact('requests', key, operationStats),
      this.impact('jobs', key, jobStats),
    ]);

    return Object.assign(summary, {
      operations: operations.map(
        ([group, before, after]): OperationImpactDto => ({
          operationId: group[0],
          protocol: group[1],
          method: group[2] || null,
          before,
          after,
        }),
      ),
      jobImpact: jobImpact.map(([group, before, after]): JobImpactDto => ({
        queue: group[0],
        name: group[1],
        before,
        after,
      })),
      newErrorGroups: errorGroups.map((row) => ({
        id: String(row.id),
        source: row.source as 'request' | 'job',
        errorClass: row.error_class,
        message: row.message,
        count: row.count,
        firstSeenAt: row.first_seen_at.toISOString(),
        lastSeenAt: row.last_seen_at.toISOString(),
      })),
      instances: instances.map((row) => ({
        serviceId: row.service_id,
        firstSeenAt: row.first_seen_at.toISOString(),
        lastSeenAt: row.last_seen_at.toISOString(),
        active: row.active,
      })),
    });
  }

  /**
   * Releases of the applications (boundary, last sighting, instances, previous version),
   * filtered by `where` on `p`, newest boundary first. Aggregates the applications'
   * `service_versions` rows through the primary key; the table is small (rows per
   * instance and version, pruned with the rollups).
   */
  private async releases(
    applicationIds: readonly string[],
    where: RawBuilder<unknown>,
    limit: number,
  ): Promise<ReleaseRow[]> {
    const { rows } = await sql<ReleaseRow>`
      with r as (
        select application_id, service_version,
          min(first_seen_at) as first_seen_at,
          max(last_seen_at) as last_seen_at,
          count(*)::int8 as instance_count
        from service_versions
        where ${inApplications('application_id', applicationIds)}
        group by application_id, service_version
      ), p as (
        select r.*,
          lag(service_version) over (
            partition by application_id order by first_seen_at, service_version
          ) as previous_version
        from r
      )
      select p.application_id, a.name as application_name, p.service_version,
        p.first_seen_at, p.last_seen_at, p.instance_count, p.previous_version
      from p
      join applications a on a.id = p.application_id
      where ${where}
      order by p.first_seen_at desc, p.application_id desc, p.service_version desc
      limit ${limit}
    `.execute(this.db);
    return rows;
  }

  /** Summary rows (comparisons and active instances) for releases, in a fixed number of queries. */
  private async summarize(
    releases: ReleaseRow[],
    window: ReleaseWindow,
    now: Date,
  ): Promise<ReleaseSummaryDto[]> {
    if (releases.length === 0) return [];
    const keys: CompareKey[] = releases.map((release, idx) => ({
      idx,
      applicationId: release.application_id,
      windows: sideWindows(release.first_seen_at, window, now),
    }));
    const [requests, jobs, active] = await Promise.all([
      this.compare('requests', keys),
      this.compare('jobs', keys),
      this.activeInstances(
        [...new Set(releases.map((release) => release.application_id))],
        now,
      ),
    ]);
    return releases.map((release, idx) => {
      const { before, after, complete } = keys[idx].windows;
      const requestComparison = requests[idx];
      const jobComparison = jobs[idx];
      return {
        applicationId: release.application_id,
        applicationName: release.application_name,
        version: release.service_version,
        firstSeenAt: release.first_seen_at.toISOString(),
        lastSeenAt: release.last_seen_at.toISOString(),
        previousVersion: release.previous_version,
        instanceCount: release.instance_count,
        activeInstances:
          active.get(
            JSON.stringify([release.application_id, release.service_version]),
          ) ?? 0,
        window,
        before: span(before),
        after: span(after),
        complete,
        requests: requestComparison,
        jobs: jobComparison,
        verdict: combineVerdicts([
          requestComparison.verdict,
          jobComparison.verdict,
        ]),
      };
    });
  }

  /** Instances per (application, version) whose latest version it is, seen recently. */
  private async activeInstances(
    applicationIds: string[],
    now: Date,
  ): Promise<Map<string, number>> {
    const rows = await this.db
      .selectFrom('services')
      .select((eb) => [
        'application_id',
        'service_version',
        eb.fn.countAll<number>().as('count'),
      ])
      .where(inApplications('application_id', applicationIds))
      .where('service_version', 'is not', null)
      .where('last_seen_at', '>=', new Date(now.getTime() - ACTIVE_INSTANCE_MS))
      .groupBy(['application_id', 'service_version'])
      .execute();
    return new Map(
      rows.map((row) => [
        JSON.stringify([row.application_id, row.service_version]),
        Number(row.count),
      ]),
    );
  }

  /** Whole-application comparison of each release, in key order. */
  private async compare(
    kind: Kind,
    keys: CompareKey[],
  ): Promise<ComparisonDto[]> {
    const [rows, cells] = await Promise.all([
      this.stats(kind, keys, false),
      this.cells(kind, keys, false),
    ]);
    const totals = new Map(
      rows.map((row) => [keyOf(row.idx, row.side, row.group), row]),
    );
    const histograms = histogramsByKey(cells, (cell) =>
      keyOf(cell.idx, cell.side, cell.group),
    );
    return keys.map(({ idx }) => {
      const before = toStats(
        totals.get(keyOf(idx, 'b', [])),
        histograms.get(keyOf(idx, 'b', [])),
      );
      const after = toStats(
        totals.get(keyOf(idx, 'a', [])),
        histograms.get(keyOf(idx, 'a', [])),
      );
      return {
        before,
        after,
        ...assess(before, after, KINDS[kind].thresholds),
      };
    });
  }

  /**
   * Before and after of the top groups (operations or jobs) by executions on both sides,
   * with the cells of those groups only.
   */
  private async impact(
    kind: Kind,
    key: CompareKey,
    rows: StatsRow[],
  ): Promise<Array<[string[], ExecutionStatsDto, ExecutionStatsDto]>> {
    const byGroup = new Map<
      string,
      { group: string[]; total: number; b?: StatsRow; a?: StatsRow }
    >();
    for (const row of rows) {
      const id = JSON.stringify(row.group);
      let entry = byGroup.get(id);
      if (!entry) byGroup.set(id, (entry = { group: row.group, total: 0 }));
      entry.total += row.count;
      entry[row.side] = row;
    }
    const top = [...byGroup.values()]
      .sort((x, y) => y.total - x.total)
      .slice(0, TOP_IMPACT);
    if (top.length === 0) return [];
    const cells = await this.cells(
      kind,
      [key],
      true,
      top.map((entry) => entry.group),
    );
    const histograms = histogramsByKey(cells, (cell) =>
      keyOf(cell.idx, cell.side, cell.group),
    );
    return top.map((entry) => [
      entry.group,
      toStats(entry.b, histograms.get(keyOf(key.idx, 'b', entry.group))),
      toStats(entry.a, histograms.get(keyOf(key.idx, 'a', entry.group))),
    ]);
  }

  /** Sums per release and side, and per group key when `grouped`. */
  private async stats(
    kind: Kind,
    keys: CompareKey[],
    grouped: boolean,
  ): Promise<StatsRow[]> {
    const { table, errors } = KINDS[kind];
    const group = this.groupColumns(kind, grouped);
    const { rows } = await sql<Omit<StatsRow, 'group'> & { g: string[] }>`
      select k.idx, k.side, ${group.select} as g,
        coalesce(sum(m.count), 0)::float8 as count,
        coalesce(sum(${sql.ref(`m.${errors}`)}), 0)::float8 as errors,
        coalesce(sum(m.sum_ms), 0)::float8 as sum_ms,
        min(m.min_ms) as min_ms,
        max(m.max_ms) as max_ms
      from ${this.compareFrom(table, keys)}
      group by k.idx, k.side${group.groupBy}
    `.execute(this.db);
    return rows.map(({ g, ...row }) => ({ ...row, group: g }));
  }

  /** Histogram cells per release and side (and group), optionally of some groups only. */
  private async cells(
    kind: Kind,
    keys: CompareKey[],
    grouped: boolean,
    only?: string[][],
  ): Promise<CellRow[]> {
    const { table } = KINDS[kind];
    const group = this.groupColumns(kind, grouped);
    const restrict =
      only && only.length > 0
        ? sql` and (${sql.join(KINDS[kind].keys.map((c) => sql.ref(`m.${c}`)))}) in (${sql.join(
            only.map((values) => sql`(${sql.join(values)})`),
          )})`
        : sql``;
    const { rows } = await sql<Omit<CellRow, 'group'> & { g: string[] }>`
      select k.idx, k.side, ${group.select} as g,
        (cell.i - 1)::int4 as bucket, sum(cell.n)::int8 as count
      from ${this.compareFrom(table, keys)}
      cross join lateral unnest(m.histogram) with ordinality as cell(n, i)
      where cell.n > 0${restrict}
      group by k.idx, k.side${group.groupBy}, cell.i
    `.execute(this.db);
    return rows.map(({ g, ...row }) => ({ ...row, group: g }));
  }

  private groupColumns(kind: Kind, grouped: boolean) {
    const columns = grouped ? KINDS[kind].keys.map((c) => `m.${c}`) : [];
    return {
      select:
        columns.length > 0
          ? sql`array[${sql.join(columns.map((c) => sql.ref(c)))}]::text[]`
          : sql`'{}'::text[]`,
      groupBy:
        columns.length > 0
          ? sql`, ${sql.join(columns.map((c) => sql.ref(c)))}`
          : sql``,
    };
  }

  /**
   * `(values ...) k join <rollup> m` on the application and each side's window, within
   * the overall window so only its partitions are scanned.
   */
  private compareFrom(table: string, keys: CompareKey[]): RawBuilder<unknown> {
    const values = keys.flatMap(({ idx, applicationId, windows }) =>
      (['b', 'a'] as const).map((side) => {
        const w = side === 'b' ? windows.before : windows.after;
        return sql`(${idx}::int4, ${side}::text, ${applicationId}::uuid, ${w.from}::timestamptz, ${w.to}::timestamptz)`;
      }),
    );
    const from = new Date(
      Math.min(...keys.map((k) => k.windows.before.from.getTime())),
    );
    const to = new Date(
      Math.max(...keys.map((k) => k.windows.after.to.getTime())),
    );
    return sql`(values ${sql.join(values)}) as k(idx, side, application_id, f, t)
      join ${sql.table(table)} as m
        on m.application_id = k.application_id and m.minute >= k.f and m.minute < k.t
        and m.minute >= ${from} and m.minute < ${to}`;
  }
}

function span(window: TimeWindow) {
  return { from: window.from.toISOString(), to: window.to.toISOString() };
}

function toStats(
  row: StatsRow | undefined,
  histogram: number[] | undefined,
): ExecutionStatsDto {
  const totals = {
    count: row?.count ?? 0,
    sum_ms: row?.sum_ms ?? 0,
    min_ms: row?.min_ms ?? null,
    max_ms: row?.max_ms ?? null,
  };
  const errors = row?.errors ?? 0;
  const latency = rollupPercentiles(totals, histogram);
  return {
    count: totals.count,
    errors,
    errorRate: ratio(errors, totals.count),
    avgMs: latency.avg,
    p95Ms: latency.p95,
  };
}
