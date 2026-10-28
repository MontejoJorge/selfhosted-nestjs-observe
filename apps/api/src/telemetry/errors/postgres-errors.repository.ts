import { Inject, Injectable } from '@nestjs/common';
import type {
  ErrorGroup,
  ErrorGroupDetail,
  Page,
} from '@selfhosted-observe/contracts';
import { KYSELY, type Db } from '../../database/database.types.js';
import { toPage, type KeysetCursor } from '../common/cursor.js';
import { inApplications, type TelemetryScope } from '../common/scope.js';
import { avgOf, bucketStart, countAll, p95 } from '../common/sql.js';
import {
  bucketSeconds,
  fillTimeline,
  type TimeWindow,
} from '../common/time-window.js';
import { ErrorsRepository, type ErrorFilter } from './errors.repository.js';

/** Recent occurrences returned on the detail view. */
const OCCURRENCE_LIMIT = 50;

interface GroupRow {
  id: number;
  application_id: string;
  service_id: string;
  fingerprint: string;
  source: string;
  error_class: string | null;
  message: string;
  stack: string | null;
  count: number;
  first_seen_at: Date;
  last_seen_at: Date;
  culprit: string | null;
}

@Injectable()
export class PostgresErrorsRepository extends ErrorsRepository {
  constructor(@Inject(KYSELY) private readonly db: Db) {
    super();
  }

  /**
   * Error groups plus their top culprit. The lateral join runs once per returned row
   * (the outer query is an index scan on (application_id, last_seen_at desc, id desc)
   * with a LIMIT), so the page costs one round trip.
   */
  private groups(scope: TelemetryScope) {
    return this.db
      .selectFrom('error_groups as g')
      .where(inApplications('g.application_id', scope.applicationIds))
      .leftJoinLateral(
        (eb) =>
          eb
            .selectFrom('error_group_culprits as c')
            .select('c.culprit')
            .whereRef('c.group_id', '=', 'g.id')
            .orderBy('c.count', 'desc')
            .orderBy('c.culprit')
            .limit(1)
            .as('top'),
        (join) => join.onTrue(),
      )
      .select([
        'g.id',
        'g.application_id',
        'g.service_id',
        'g.fingerprint',
        'g.source',
        'g.error_class',
        'g.message',
        'g.stack',
        'g.count',
        'g.first_seen_at',
        'g.last_seen_at',
        'top.culprit',
      ]);
  }

  async list(
    filter: ErrorFilter,
    page: { limit: number; cursor: KeysetCursor | null },
  ): Promise<Page<ErrorGroup>> {
    const { window, scope } = filter;
    let query = this.groups(scope)
      .where('g.last_seen_at', '>=', window.from)
      .where('g.first_seen_at', '<', window.to);
    if (scope.instance) {
      const instance = scope.instance;
      query = query.where((eb) =>
        eb.exists(
          eb
            .selectFrom('error_occurrences as o')
            .select('o.group_id')
            .whereRef('o.group_id', '=', 'g.id')
            .where('o.occurred_at', '>=', window.from)
            .where('o.occurred_at', '<', window.to)
            .where('o.service_id', '=', instance),
        ),
      );
    }
    if (filter.source) query = query.where('g.source', '=', filter.source);
    const { cursor } = page;
    if (cursor) {
      query = query.where((eb) =>
        eb(
          eb.refTuple('g.last_seen_at', 'g.id'),
          '<',
          eb.tuple(cursor.t, Number(cursor.id)),
        ),
      );
    }
    const rows = await query
      .orderBy('g.last_seen_at', 'desc')
      .orderBy('g.id', 'desc')
      .limit(page.limit + 1)
      .execute();
    return toPage(
      rows,
      page.limit,
      (row) => ({ t: row.last_seen_at, id: String(row.id) }),
      toErrorGroup,
    );
  }

  async findById(
    scope: TelemetryScope,
    id: string,
    window: TimeWindow,
  ): Promise<ErrorGroupDetail | null> {
    const groupId = Number(id);
    const group = await this.groups(scope)
      .where('g.id', '=', groupId)
      .executeTakeFirst();
    if (!group) return null;

    const step = bucketSeconds(window);
    const t = bucketStart('occurred_at', step);
    const occurrencesOf = () => {
      const q = this.db
        .selectFrom('error_occurrences')
        .where('group_id', '=', groupId)
        .where('occurred_at', '>=', window.from)
        .where('occurred_at', '<', window.to);
      return scope.instance ? q.where('service_id', '=', scope.instance) : q;
    };
    // Both queries use the (group_id, occurred_at desc) index on the pruned partitions.
    const [timeline, occurrences] = await Promise.all([
      occurrencesOf()
        .select([
          t.as('t'),
          countAll.as('count'),
          p95('duration_ms').as('p95'),
          avgOf('duration_ms').as('avg'),
        ])
        .groupBy(t)
        .orderBy(t)
        .execute(),
      occurrencesOf()
        .select([
          'execution_id',
          'source',
          'trace_id',
          'application_id',
          'service_id',
          'occurred_at',
        ])
        .orderBy('occurred_at', 'desc')
        .limit(OCCURRENCE_LIMIT)
        .execute(),
    ]);

    return {
      ...toErrorGroup(group),
      stack: group.stack,
      timeline: fillTimeline(
        window,
        step,
        timeline.map((row) => ({
          t: row.t,
          count: row.count,
          errors: row.count,
          p95: row.p95,
          avg: row.avg,
        })),
      ),
      occurrences: occurrences.map((row) => ({
        executionId: row.execution_id,
        source: row.source === 'job' ? 'job' : 'request',
        traceId: row.trace_id,
        applicationId: row.application_id,
        serviceId: row.service_id,
        occurredAt: row.occurred_at.toISOString(),
      })),
    };
  }
}

function toErrorGroup(row: GroupRow): ErrorGroup {
  return {
    id: String(row.id),
    fingerprint: row.fingerprint,
    applicationId: row.application_id,
    serviceId: row.service_id,
    errorClass: row.error_class,
    message: row.message,
    source: row.source === 'job' ? 'job' : 'request',
    culprit: row.culprit,
    count: row.count,
    firstSeenAt: row.first_seen_at.toISOString(),
    lastSeenAt: row.last_seen_at.toISOString(),
  };
}
