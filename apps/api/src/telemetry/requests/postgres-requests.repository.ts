import { Inject, Injectable } from '@nestjs/common';
import type { Selectable, SelectQueryBuilder } from 'kysely';
import {
  KYSELY,
  type Database,
  type Db,
  type RequestsTable,
} from '../../database/database.types.js';
import { toPage, type KeysetCursor, type Page } from '../common/cursor.js';
import { windowFromId } from '../common/id-window.js';
import {
  cellBucket,
  cellCount,
  histogramCells,
  histogramsByKey,
  inRollupScope,
  maxOf,
  minOf,
  nonEmptyCell,
  rollupPercentiles,
  sumOf,
} from '../common/rollups.js';
import { inApplications, type TelemetryScope } from '../common/scope.js';
import { ratio } from '../common/sql.js';
import { asTags, asWireError, decodeTrace } from '../common/trace-decoder.js';
import type {
  OperationStatsDto,
  RequestDetailDto,
  RequestListItemDto,
} from './requests.dto.js';
import {
  RequestsRepository,
  type RequestFilter,
} from './requests.repository.js';

const LIST_COLUMNS = [
  'id',
  'called_at',
  'trace_id',
  'application_id',
  'service_id',
  'operation_id',
  'protocol',
  'method',
  'status_code',
  'url',
  'duration_ms',
  'user_id',
  'has_error',
] as const;

const DETAIL_COLUMNS = [
  ...LIST_COLUMNS,
  'service_version',
  'tags',
  'error',
  'request',
  'trace',
] as const;

/** Max executions returned for one trace id. */
const TRACE_LIMIT = 200;

type Row = Selectable<RequestsTable>;
type ListRow = Pick<Row, (typeof LIST_COLUMNS)[number]>;
type DetailRow = Pick<Row, (typeof DETAIL_COLUMNS)[number]>;

@Injectable()
export class PostgresRequestsRepository extends RequestsRepository {
  constructor(@Inject(KYSELY) private readonly db: Db) {
    super();
  }

  /**
   * Every query filters on called_at, so only the partitions in the window are scanned,
   * and on application_id, the leading column of the scoped indexes.
   */
  private filtered<O>(
    query: SelectQueryBuilder<Database, 'requests', O>,
    filter: RequestFilter,
  ): SelectQueryBuilder<Database, 'requests', O> {
    let q = scoped(query, filter.scope)
      .where('called_at', '>=', filter.window.from)
      .where('called_at', '<', filter.window.to);
    if (filter.operationId)
      q = q.where('operation_id', '=', filter.operationId);
    if (filter.traceId) q = q.where('trace_id', '=', filter.traceId);
    if (filter.userId) q = q.where('user_id', '=', filter.userId);
    if (filter.status) q = q.where('has_error', '=', filter.status === 'error');
    if (filter.minDurationMs !== undefined)
      q = q.where('duration_ms', '>=', filter.minDurationMs);
    return q;
  }

  /** Per-operation stats from the per-minute rollups (see `common/rollups.ts`). */
  async operations(filter: RequestFilter): Promise<OperationStatsDto[]> {
    const inScope = inRollupScope(filter.scope, filter.window);
    const keys = ['operation_id', 'protocol', 'method'] as const;
    const [rows, cells] = await Promise.all([
      this.db
        .selectFrom('requests_1m')
        .where(inScope)
        .select((eb) => [
          ...keys,
          sumOf('count').as('count'),
          sumOf('errors').as('error_count'),
          sumOf('sum_ms').as('sum_ms'),
          minOf.as('min_ms'),
          maxOf.as('max_ms'),
          eb.fn.max('last_called_at').as('last_seen_at'),
        ])
        .groupBy([...keys])
        .orderBy('count', 'desc')
        .limit(1000)
        .execute(),
      this.db
        .selectFrom(['requests_1m', histogramCells])
        .where(inScope)
        .where(nonEmptyCell)
        .select([...keys, cellBucket.as('bucket'), cellCount.as('count')])
        .groupBy([...keys, cellBucket])
        .execute(),
    ]);
    const keyOf = (row: {
      operation_id: string;
      protocol: string;
      method: string;
    }) => JSON.stringify([row.operation_id, row.protocol, row.method]);
    const histograms = histogramsByKey(cells, keyOf);
    return rows.map((row) => ({
      operationId: row.operation_id,
      protocol: row.protocol,
      method: row.method || null,
      count: row.count,
      errorCount: row.error_count,
      errorRate: ratio(row.error_count, row.count),
      latency: rollupPercentiles(row, histograms.get(keyOf(row))),
      lastSeenAt: new Date(row.last_seen_at).toISOString(),
    }));
  }

  async list(
    filter: RequestFilter,
    page: { limit: number; cursor: KeysetCursor | null },
  ): Promise<Page<RequestListItemDto>> {
    let query = this.filtered(this.db.selectFrom('requests'), filter).select(
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

  async findById(
    scope: TelemetryScope,
    id: string,
  ): Promise<RequestDetailDto | null> {
    let query = scoped(this.db.selectFrom('requests'), scope)
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
  ): Promise<RequestDetailDto[]> {
    const rows = await scoped(this.db.selectFrom('requests'), scope)
      .select(DETAIL_COLUMNS)
      .where('trace_id', '=', traceId)
      .orderBy('called_at')
      .limit(TRACE_LIMIT)
      .execute();
    return rows.map(toDetail);
  }
}

function scoped<O>(
  query: SelectQueryBuilder<Database, 'requests', O>,
  scope: TelemetryScope,
): SelectQueryBuilder<Database, 'requests', O> {
  const q = query.where(inApplications('application_id', scope.applicationIds));
  return scope.instance ? q.where('service_id', '=', scope.instance) : q;
}

function toListItem(row: ListRow): RequestListItemDto {
  return {
    id: row.id,
    traceId: row.trace_id,
    applicationId: row.application_id,
    serviceId: row.service_id,
    operationId: row.operation_id,
    protocol: row.protocol,
    method: row.method,
    statusCode: row.status_code,
    url: row.url,
    durationMs: row.duration_ms,
    calledAt: row.called_at.toISOString(),
    userId: row.user_id,
    hasError: row.has_error,
  };
}

function toDetail(row: DetailRow): RequestDetailDto {
  return Object.assign(toListItem(row), {
    serviceVersion: row.service_version,
    tags: asTags(row.tags),
    error: asWireError(row.error),
    request: (row.request as Record<string, unknown> | null) ?? null,
    trace: decodeTrace(row.trace),
  });
}
