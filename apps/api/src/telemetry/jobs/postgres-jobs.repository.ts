import { Inject, Injectable } from '@nestjs/common';
import type {
  JobDetail,
  JobListItem,
  JobStats,
  Page,
} from '@selfhosted-observe/contracts';
import type { Selectable, SelectQueryBuilder } from 'kysely';
import {
  KYSELY,
  type Database,
  type Db,
  type JobsTable,
} from '../../database/database.types.js';
import { toPage, type KeysetCursor } from '../common/cursor.js';
import { windowFromId } from '../common/id-window.js';
import { inApplications, type TelemetryScope } from '../common/scope.js';
import {
  avgOf,
  countAll,
  countWhere,
  latencyPercentiles,
  ratio,
  toPercentiles,
} from '../common/sql.js';
import { asTags, asWireError, decodeTrace } from '../common/trace-decoder.js';
import { JobsRepository, type JobFilter } from './jobs.repository.js';

const LIST_COLUMNS = [
  'id',
  'called_at',
  'job_id',
  'trace_id',
  'application_id',
  'service_id',
  'queue',
  'name',
  'status',
  'duration_ms',
  'wait_ms',
  'attempts_made',
  'max_attempts',
] as const;

const DETAIL_COLUMNS = [
  ...LIST_COLUMNS,
  'enqueued_at',
  'tags',
  'error',
  'trace',
] as const;

const TRACE_LIMIT = 200;

type Row = Selectable<JobsTable>;
type ListRow = Pick<Row, (typeof LIST_COLUMNS)[number]>;
type DetailRow = Pick<Row, (typeof DETAIL_COLUMNS)[number]>;

@Injectable()
export class PostgresJobsRepository extends JobsRepository {
  constructor(@Inject(KYSELY) private readonly db: Db) {
    super();
  }

  private filtered<O>(
    query: SelectQueryBuilder<Database, 'jobs', O>,
    filter: JobFilter,
  ): SelectQueryBuilder<Database, 'jobs', O> {
    let q = scoped(query, filter.scope)
      .where('called_at', '>=', filter.window.from)
      .where('called_at', '<', filter.window.to);
    if (filter.queue) q = q.where('queue', '=', filter.queue);
    if (filter.name) q = q.where('name', '=', filter.name);
    if (filter.status) q = q.where('status', '=', filter.status);
    if (filter.traceId) q = q.where('trace_id', '=', filter.traceId);
    return q;
  }

  async queues(filter: JobFilter): Promise<JobStats[]> {
    const rows = await this.filtered(this.db.selectFrom('jobs'), filter)
      .select((eb) => [
        'queue',
        'name',
        countAll.as('count'),
        countWhere('has_error').as('failed_count'),
        latencyPercentiles('duration_ms').as('latency'),
        avgOf('duration_ms').as('avg_ms'),
        eb.fn.avg<number | null>('wait_ms').as('avg_wait_ms'),
        eb.fn.max('called_at').as('last_seen_at'),
      ])
      .groupBy(['queue', 'name'])
      .orderBy('count', 'desc')
      .limit(1000)
      .execute();
    return rows.map((row) => ({
      queue: row.queue,
      name: row.name,
      count: row.count,
      failedCount: row.failed_count,
      failureRate: ratio(row.failed_count, row.count),
      latency: toPercentiles(row.latency, row.avg_ms),
      avgWaitMs: row.avg_wait_ms ?? 0,
      lastSeenAt: new Date(row.last_seen_at).toISOString(),
    }));
  }

  async list(
    filter: JobFilter,
    page: { limit: number; cursor: KeysetCursor | null },
  ): Promise<Page<JobListItem>> {
    let query = this.filtered(this.db.selectFrom('jobs'), filter).select(
      LIST_COLUMNS,
    );
    const { cursor } = page;
    if (cursor) {
      query = query.where((eb) =>
        eb(eb.refTuple('called_at', 'id'), '<', eb.tuple(cursor.t, cursor.id)),
      );
    }
    const rows = await query
      .orderBy('called_at', 'desc')
      .orderBy('id', 'desc')
      .limit(page.limit + 1)
      .execute();
    return toPage(
      rows,
      page.limit,
      (row) => ({ t: row.called_at, id: row.id }),
      toListItem,
    );
  }

  async findById(scope: TelemetryScope, id: string): Promise<JobDetail | null> {
    let query = scoped(this.db.selectFrom('jobs'), scope)
      .select(DETAIL_COLUMNS)
      .where('id', '=', id);
    const window = windowFromId(id);
    if (window) {
      query = query
        .where('called_at', '>=', window.from)
        .where('called_at', '<', window.to);
    }
    const row = await query.limit(1).executeTakeFirst();
    return row ? toDetail(row) : null;
  }

  async findByTraceId(
    scope: TelemetryScope,
    traceId: string,
  ): Promise<JobDetail[]> {
    const rows = await scoped(this.db.selectFrom('jobs'), scope)
      .select(DETAIL_COLUMNS)
      .where('trace_id', '=', traceId)
      .orderBy('called_at')
      .limit(TRACE_LIMIT)
      .execute();
    return rows.map(toDetail);
  }
}

function scoped<O>(
  query: SelectQueryBuilder<Database, 'jobs', O>,
  scope: TelemetryScope,
): SelectQueryBuilder<Database, 'jobs', O> {
  const q = query.where(inApplications('application_id', scope.applicationIds));
  return scope.instance ? q.where('service_id', '=', scope.instance) : q;
}

function toListItem(row: ListRow): JobListItem {
  return {
    id: row.id,
    jobId: row.job_id,
    traceId: row.trace_id,
    applicationId: row.application_id,
    serviceId: row.service_id,
    queue: row.queue,
    name: row.name,
    status:
      row.status === 'completed' || row.status === 'failed' ? row.status : null,
    durationMs: row.duration_ms,
    waitMs: row.wait_ms,
    attemptsMade: row.attempts_made,
    maxAttempts: row.max_attempts,
    calledAt: row.called_at.toISOString(),
  };
}

function toDetail(row: DetailRow): JobDetail {
  return {
    ...toListItem(row),
    enqueuedAt: row.enqueued_at ? row.enqueued_at.toISOString() : null,
    tags: asTags(row.tags),
    error: asWireError(row.error),
    trace: decodeTrace(row.trace),
  };
}
