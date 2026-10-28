import { Inject, Injectable } from '@nestjs/common';
import type {
  ErrorGroup,
  ErrorGroupDetail,
  Page,
} from '@selfhosted-observe/contracts';
import { KYSELY, type Db } from '../../database/database.types.js';
import { toPage, type KeysetCursor } from '../common/cursor.js';
import { bucketStart, countAll, p95 } from '../common/sql.js';
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
   * (the outer query is an index scan on (last_seen_at desc, id desc) with a LIMIT),
   * so the page costs one round trip.
   */
  private groups() {
    return this.db
      .selectFrom('error_groups as g')
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
    let query = this.groups()
      .where('g.last_seen_at', '>=', filter.window.from)
      .where('g.first_seen_at', '<', filter.window.to);
    if (filter.serviceId)
      query = query.where('g.service_id', '=', filter.serviceId);
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
    id: string,
    window: TimeWindow,
  ): Promise<ErrorGroupDetail | null> {
    const groupId = Number(id);
    const group = await this.groups()
      .where('g.id', '=', groupId)
      .executeTakeFirst();
    if (!group) return null;

    const step = bucketSeconds(window);
    const t = bucketStart('occurred_at', step);
    // Both queries use the (group_id, occurred_at desc) index on the pruned partitions.
    const [timeline, occurrences] = await Promise.all([
      this.db
        .selectFrom('error_occurrences')
        .select([t.as('t'), countAll.as('count'), p95('duration_ms').as('p95')])
        .where('group_id', '=', groupId)
        .where('occurred_at', '>=', window.from)
        .where('occurred_at', '<', window.to)
        .groupBy(t)
        .orderBy(t)
        .execute(),
      this.db
        .selectFrom('error_occurrences')
        .select([
          'execution_id',
          'source',
          'trace_id',
          'service_id',
          'occurred_at',
        ])
        .where('group_id', '=', groupId)
        .where('occurred_at', '>=', window.from)
        .where('occurred_at', '<', window.to)
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
        })),
      ),
      occurrences: occurrences.map((row) => ({
        executionId: row.execution_id,
        source: row.source === 'job' ? 'job' : 'request',
        traceId: row.trace_id,
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
