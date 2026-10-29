import { Inject, Injectable } from '@nestjs/common';
import { sql, type RawBuilder } from 'kysely';
import { KYSELY, type Db } from '../../database/database.types.js';
import { ANONYMOUS_USER } from '../../ingest/domain/rollups.js';
import {
  histogramBucketOf,
  histogramsByKey,
  inRollupScope,
  rollupPercentiles,
  summarizeTimeline,
} from '../common/rollups.js';
import { inApplications, type TelemetryScope } from '../common/scope.js';
import { bucketStart, likeContains, ratio } from '../common/sql.js';
import {
  bucketSeconds,
  bucketStarts,
  fillTimeline,
  type TimeWindow,
} from '../common/time-window.js';
import type {
  UserActivityBucketDto,
  UserDetailDto,
  UsersDto,
  UserStatsDto,
} from './users.dto.js';
import { UsersRepository, type UserFilter } from './users.repository.js';

const HOUR_MS = 3_600_000;
const QUARTER_MS = 900_000;

/** `users_1h.user_id` of the requests without a user id. */
const ANONYMOUS = ANONYMOUS_USER;

/** Which users a read covers. Anonymous requests match `userIds` containing `''` only. */
type UserMatch =
  { userId: string } | { search?: string } | { userIds: readonly string[] };

/**
 * The whole buckets of a window, read from a rollup, and the partial buckets at its
 * edges, read from `requests` (at most two buckets of raw rows).
 */
interface SplitWindow {
  whole: TimeWindow | null;
  edges: TimeWindow[];
}

function splitWindow(window: TimeWindow, stepMs: number): SplitWindow {
  const from = window.from.getTime();
  const to = window.to.getTime();
  const first = Math.ceil(from / stepMs) * stepMs;
  const last = Math.floor(to / stepMs) * stepMs;
  if (first >= last) return { whole: null, edges: [window] };
  const edges: TimeWindow[] = [];
  if (from < first) edges.push({ from: window.from, to: new Date(first) });
  if (last < to) edges.push({ from: new Date(last), to: window.to });
  return { whole: { from: new Date(first), to: new Date(last) }, edges };
}

const RAW_ONLY = (window: TimeWindow): SplitWindow => ({
  whole: null,
  edges: [window],
});

/** User filter on `users_1h.user_id`, where anonymous requests are `''`. */
function rollupUsers(match: UserMatch): RawBuilder<unknown> {
  if ('userId' in match) return sql`user_id = ${match.userId}`;
  if ('userIds' in match)
    return match.userIds.length === 0
      ? sql`false`
      : sql`user_id in (${sql.join(match.userIds)})`;
  if (match.search)
    return sql`user_id <> ${ANONYMOUS} and user_id ilike ${likeContains(match.search)}`;
  return sql`true`;
}

/** The same filter on `requests.user_id`, where anonymous requests are null. */
function rawUsers(match: UserMatch): RawBuilder<unknown> {
  if ('userId' in match) return sql`user_id = ${match.userId}`;
  if ('userIds' in match) {
    const ids = match.userIds.filter((id) => id !== ANONYMOUS);
    const named = ids.length ? sql`user_id in (${sql.join(ids)})` : sql`false`;
    return match.userIds.includes(ANONYMOUS)
      ? sql`(${named} or user_id is null)`
      : named;
  }
  if (match.search) return sql`user_id ilike ${likeContains(match.search)}`;
  return sql`true`;
}

/**
 * Per-row totals with the same columns from both sources: `t` is the hour of a rollup
 * row or the time of a raw request.
 */
function totalsSource(
  scope: TelemetryScope,
  split: SplitWindow,
  match: UserMatch,
): RawBuilder<unknown> {
  const apps = inApplications('application_id', scope.applicationIds);
  const parts: RawBuilder<unknown>[] = [];
  if (split.whole)
    parts.push(sql`
      select user_id, hour as t, count, errors, status_4xx, status_5xx, sum_ms, min_ms,
        max_ms, first_called_at, last_called_at
      from users_1h
      where ${apps} and hour >= ${split.whole.from} and hour < ${split.whole.to}
        and ${rollupUsers(match)}
    `);
  for (const edge of split.edges)
    parts.push(sql`
      select coalesce(user_id, ${ANONYMOUS}) as user_id, called_at as t, 1 as count,
        has_error::int4 as errors,
        (status_code between 400 and 499)::int4 as status_4xx,
        (status_code >= 500)::int4 as status_5xx,
        duration_ms as sum_ms, duration_ms as min_ms, duration_ms as max_ms,
        called_at as first_called_at, called_at as last_called_at
      from requests
      where ${apps} and called_at >= ${edge.from} and called_at < ${edge.to}
        and ${rawUsers(match)}
    `);
  return sql.join(parts, sql` union all `);
}

/** Histogram cells `(user_id, t, bucket, n)` from both sources. */
function cellsSource(
  scope: TelemetryScope,
  split: SplitWindow,
  match: UserMatch,
): RawBuilder<unknown> {
  const apps = inApplications('application_id', scope.applicationIds);
  const parts: RawBuilder<unknown>[] = [];
  if (split.whole)
    parts.push(sql`
      select user_id, hour as t, (cell.i - 1)::int4 as bucket, cell.n
      from users_1h, unnest(histogram) with ordinality as cell(n, i)
      where ${apps} and hour >= ${split.whole.from} and hour < ${split.whole.to}
        and ${rollupUsers(match)} and cell.n > 0
    `);
  for (const edge of split.edges)
    parts.push(sql`
      select coalesce(user_id, ${ANONYMOUS}) as user_id, called_at as t,
        ${histogramBucketOf('duration_ms')} as bucket, 1 as n
      from requests
      where ${apps} and called_at >= ${edge.from} and called_at < ${edge.to}
        and ${rawUsers(match)}
    `);
  return sql.join(parts, sql` union all `);
}

/**
 * `(user_id, t)` of the identified users active in the window: whole buckets from
 * `users_1h` (hours) or `user_presence_15m` (15 minutes), edges from `requests`.
 */
function presenceSource(
  scope: TelemetryScope,
  split: SplitWindow,
  grainMs: number,
): RawBuilder<unknown> {
  const apps = inApplications('application_id', scope.applicationIds);
  const parts: RawBuilder<unknown>[] = [];
  if (split.whole)
    parts.push(
      grainMs === HOUR_MS
        ? sql`
          select user_id, hour as t from users_1h
          where ${apps} and hour >= ${split.whole.from} and hour < ${split.whole.to}
            and user_id <> ${ANONYMOUS}
        `
        : sql`
          select user_id, bucket as t from user_presence_15m
          where ${apps} and bucket >= ${split.whole.from} and bucket < ${split.whole.to}
        `,
    );
  for (const edge of split.edges)
    parts.push(sql`
      select user_id, called_at as t from requests
      where ${apps} and called_at >= ${edge.from} and called_at < ${edge.to}
        and user_id is not null
    `);
  return sql.join(parts, sql` union all `);
}

interface TotalsRow {
  count: number;
  errors: number;
  sum_ms: number;
  min_ms: number | null;
  max_ms: number | null;
  first_called_at: Date;
  last_called_at: Date;
}

/**
 * Reads `users_1h` for the whole hours of the window and `requests` for the partial
 * hours at its edges, so the numbers are exact for any window (ADR 0004).
 */
@Injectable()
export class PostgresUsersRepository extends UsersRepository {
  constructor(@Inject(KYSELY) private readonly db: Db) {
    super();
  }

  /** The table, the distinct user count and the activity timeline, in parallel. */
  async list({
    scope,
    window,
    search,
    limit,
  }: UserFilter & { search?: string; limit: number }): Promise<UsersDto> {
    const [items, userCount, timeline] = await Promise.all([
      this.items(scope, window, search, limit),
      this.userCount(scope, window),
      this.activity(scope, window),
    ]);
    return { userCount, timeline, items };
  }

  /**
   * Two steps: totals per user (sorted and limited in SQL), then the histogram cells of
   * the returned users only. Unnesting every user's histograms would cost ~4x more.
   */
  private async items(
    scope: TelemetryScope,
    window: TimeWindow,
    search: string | undefined,
    limit: number,
  ): Promise<UserStatsDto[]> {
    const split = splitWindow(window, HOUR_MS);
    const { rows } = await sql<TotalsRow & { user_id: string }>`
      select user_id, sum(count)::int8 as count, sum(errors)::int8 as errors,
        coalesce(sum(sum_ms), 0)::float8 as sum_ms, min(min_ms) as min_ms,
        max(max_ms) as max_ms, min(first_called_at) as first_called_at,
        max(last_called_at) as last_called_at
      from (${totalsSource(scope, split, { search })}) source
      group by user_id
      order by count desc, user_id
      limit ${limit}
    `.execute(this.db);
    if (rows.length === 0) return [];

    const userIds = rows.map((row) => row.user_id);
    const { rows: cells } = await sql<{
      user_id: string;
      bucket: number;
      count: number;
    }>`
      select user_id, bucket, sum(n)::int8 as count
      from (${cellsSource(scope, split, { userIds })}) source
      group by user_id, bucket
    `.execute(this.db);
    const histograms = histogramsByKey(cells, (cell) => cell.user_id);

    return rows.map((row) =>
      toStats(
        row.user_id === ANONYMOUS ? null : row.user_id,
        row,
        histograms.get(row.user_id),
      ),
    );
  }

  private async userCount(
    scope: TelemetryScope,
    window: TimeWindow,
  ): Promise<number> {
    const { rows } = await sql<{ users: number }>`
      select count(*)::int8 as users
      from (
        select user_id
        from (${presenceSource(scope, splitWindow(window, HOUR_MS), HOUR_MS)}) source
        group by user_id
      ) users
    `.execute(this.db);
    return rows[0]?.users ?? 0;
  }

  /**
   * Distinct users per timeline bucket can't be summed from finer buckets, so each
   * bucket width reads the grain that divides it: hourly rows for 3 h buckets (7d),
   * 15-minute presence rows for 15 min buckets (24h), raw requests for 1 min buckets
   * (1h). Request counts come from `requests_1m`. Distinct counts group by
   * `(bucket, user)` first: a hash aggregate, 5-15x faster than `count(distinct)`.
   */
  private async activity(
    scope: TelemetryScope,
    window: TimeWindow,
  ): Promise<UserActivityBucketDto[]> {
    const step = bucketSeconds(window);
    const grainMs =
      (step * 1000) % HOUR_MS === 0
        ? HOUR_MS
        : (step * 1000) % QUARTER_MS === 0
          ? QUARTER_MS
          : null;
    const split = grainMs ? splitWindow(window, grainMs) : RAW_ONLY(window);
    const t = bucketStart('t', step);
    const minute = bucketStart('minute', step);

    const [{ rows: users }, requests] = await Promise.all([
      sql<{ t: Date; users: number }>`
        select t, count(*)::int8 as users
        from (
          select ${t} as t, user_id
          from (${presenceSource(scope, split, grainMs ?? HOUR_MS)}) source
          group by 1, 2
        ) presence
        group by t
      `.execute(this.db),
      this.db
        .selectFrom('requests_1m')
        .where(inRollupScope(scope, window))
        .select([minute.as('t'), sql<number>`sum(count)::int8`.as('requests')])
        .groupBy(minute)
        .execute(),
    ]);

    const usersAt = new Map(users.map((row) => [row.t.getTime(), row.users]));
    const requestsAt = new Map(
      requests.map((row) => [row.t.getTime(), row.requests]),
    );
    return bucketStarts(window, step).map((start) => ({
      t: new Date(start).toISOString(),
      users: usersAt.get(start) ?? 0,
      requests: requestsAt.get(start) ?? 0,
    }));
  }

  /**
   * Timeline buckets of 3 h or more are whole hours, so they read the rollup plus the
   * edges; finer ones (1h and 24h ranges) read the user's raw requests, one range of
   * the `(application_id, user_id, called_at)` index per partition.
   */
  async findById(
    { scope, window }: UserFilter,
    userId: string,
  ): Promise<UserDetailDto | null> {
    const step = bucketSeconds(window);
    const split =
      step % 3600 === 0 ? splitWindow(window, HOUR_MS) : RAW_ONLY(window);
    const match = { userId };
    const t = bucketStart('t', step);

    const [{ rows }, { rows: cells }] = await Promise.all([
      sql<TotalsRow & { t: Date; status4xx: number; status5xx: number }>`
        select ${t} as t, sum(count)::int8 as count, sum(errors)::int8 as errors,
          sum(status_4xx)::int8 as "status4xx", sum(status_5xx)::int8 as "status5xx",
          coalesce(sum(sum_ms), 0)::float8 as sum_ms, min(min_ms) as min_ms,
          max(max_ms) as max_ms, min(first_called_at) as first_called_at,
          max(last_called_at) as last_called_at
        from (${totalsSource(scope, split, match)}) source
        group by 1
      `.execute(this.db),
      sql<{ t: Date; bucket: number; count: number }>`
        select ${t} as t, bucket, sum(n)::int8 as count
        from (${cellsSource(scope, split, match)}) source
        group by 1, 2
      `.execute(this.db),
    ]);
    if (rows.length === 0) return null;

    const summary = summarizeTimeline(rows, cells);
    const firstSeen = Math.min(...rows.map((r) => r.first_called_at.getTime()));
    const lastSeen = Math.max(...rows.map((r) => r.last_called_at.getTime()));
    return {
      userId,
      requestCount: summary.totals.count,
      errorCount: summary.totals.errors,
      errorRate: ratio(summary.totals.errors, summary.totals.count),
      latency: summary.latency,
      firstSeenAt: new Date(firstSeen).toISOString(),
      lastSeenAt: new Date(lastSeen).toISOString(),
      timeline: fillTimeline(window, step, summary.buckets),
    };
  }
}

function toStats(
  userId: string | null,
  row: TotalsRow,
  histogram: number[] | undefined,
): UserStatsDto {
  return {
    userId,
    requestCount: row.count,
    errorCount: row.errors,
    errorRate: ratio(row.errors, row.count),
    latency: rollupPercentiles(row, histogram),
    firstSeenAt: row.first_called_at.toISOString(),
    lastSeenAt: row.last_called_at.toISOString(),
  };
}
