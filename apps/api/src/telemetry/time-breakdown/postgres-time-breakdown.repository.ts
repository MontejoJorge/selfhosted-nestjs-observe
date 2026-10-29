import { Inject, Injectable } from '@nestjs/common';
import { sql, type RawBuilder, type SqlBool } from 'kysely';
import { KYSELY, type Db } from '../../database/database.types.js';
import {
  cellBucket,
  cellCount,
  FIVE_MINUTE_GRAIN,
  histogramCells,
  histogramsByKey,
  inRollupScope,
  maxOf,
  minOf,
  nonEmptyCell,
  rollupPercentiles,
  sumOf,
} from '../common/rollups.js';
import { ratio } from '../common/sql.js';
import {
  MAX_BREAKDOWN_ITEMS,
  type ExecutionSource,
  type SlowSpanDto,
  type TimeBreakdownDto,
} from './time-breakdown.dto.js';
import {
  TimeBreakdownRepository,
  type SlowSpansFilter,
  type TimeBreakdownFilter,
} from './time-breakdown.repository.js';

const KEYS = ['origin', 'class_name', 'method_name'] as const;

/** Escapes LIKE wildcards so user input matches literally. */
function likeLiteral(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/**
 * Source and operation filter. `operation` is the operationId of a request or
 * `queue/name` of a job, so a queue or name alone matches a prefix or suffix.
 */
function operationFilter(filter: TimeBreakdownFilter): RawBuilder<SqlBool> {
  const conditions: RawBuilder<unknown>[] = [];
  let source: ExecutionSource | undefined = filter.source;
  if (filter.operationId !== undefined) {
    source = 'request';
    conditions.push(sql`operation = ${filter.operationId}`);
  }
  if (filter.queue !== undefined || filter.name !== undefined) {
    if (source === 'request' && filter.operationId !== undefined)
      return sql<SqlBool>`false`;
    source = 'job';
    if (filter.queue !== undefined && filter.name !== undefined)
      conditions.push(sql`operation = ${`${filter.queue}/${filter.name}`}`);
    else if (filter.queue !== undefined)
      conditions.push(sql`operation like ${`${likeLiteral(filter.queue)}/%`}`);
    else
      conditions.push(sql`operation like ${`%/${likeLiteral(filter.name!)}`}`);
  }
  if (filter.source !== undefined && filter.source !== source)
    return sql<SqlBool>`false`;
  if (source) conditions.push(sql`source = ${source}`);
  if (conditions.length === 0) return sql<SqlBool>`true`;
  return sql<SqlBool>`${sql.join(conditions, sql` and `)}`;
}

/**
 * Reads `span_stats_5m` (ADR 0004): one grouped query for sums, min and max per class
 * method, one for its histogram cells, both over the 5-minute buckets of the window.
 */
@Injectable()
export class PostgresTimeBreakdownRepository extends TimeBreakdownRepository {
  constructor(@Inject(KYSELY) private readonly db: Db) {
    super();
  }

  async breakdown(filter: TimeBreakdownFilter): Promise<TimeBreakdownDto> {
    const inScope = inRollupScope(
      filter.scope,
      filter.window,
      {},
      FIVE_MINUTE_GRAIN,
    );
    const operations = operationFilter(filter);
    const selfMs = sumOf('self_ms');
    const [rows, cells] = await Promise.all([
      this.db
        .selectFrom('span_stats_5m')
        .where(inScope)
        .where(operations)
        .select([
          ...KEYS,
          sumOf('calls').as('count'),
          sumOf('errors').as('errors'),
          sumOf('total_ms').as('sum_ms'),
          selfMs.as('self_ms'),
          minOf.as('min_ms'),
          maxOf.as('max_ms'),
          sql<number>`sum(sum(self_ms)) over ()`.as('total_self_ms'),
        ])
        .groupBy([...KEYS])
        .orderBy(selfMs, 'desc')
        .orderBy('class_name')
        .orderBy('method_name')
        .limit(MAX_BREAKDOWN_ITEMS)
        .execute(),
      this.db
        .selectFrom(['span_stats_5m', histogramCells])
        .where(inScope)
        .where(operations)
        .where(nonEmptyCell)
        .select([...KEYS, cellBucket.as('bucket'), cellCount.as('count')])
        .groupBy([...KEYS, cellBucket])
        .execute(),
    ]);

    const keyOf = (row: {
      origin: string;
      class_name: string;
      method_name: string;
    }) => JSON.stringify([row.origin, row.class_name, row.method_name]);
    const histograms = histogramsByKey(cells, keyOf);
    const totalSelfMs = rows[0]?.total_self_ms ?? 0;
    return {
      totalSelfMs,
      items: rows.map((row) => {
        const latency = rollupPercentiles(row, histograms.get(keyOf(row)));
        return {
          origin: row.origin,
          className: row.class_name,
          methodName: row.method_name,
          calls: row.count,
          errorCount: row.errors,
          totalMs: row.sum_ms,
          selfMs: row.self_ms,
          share: ratio(row.self_ms, totalSelfMs),
          avgMs: latency.avg,
          p95Ms: latency.p95,
        };
      }),
    };
  }

  /**
   * Each rollup row keeps its slowest span, so this reads the rollup rows of one class
   * method in the window, slowest first: no scan of `spans`.
   */
  async slowestSpans(filter: SlowSpansFilter): Promise<SlowSpanDto[]> {
    let query = this.db
      .selectFrom('span_stats_5m')
      .where(inRollupScope(filter.scope, filter.window, {}, FIVE_MINUTE_GRAIN))
      .where(operationFilter(filter))
      .where('class_name', '=', filter.className)
      .where('method_name', '=', filter.methodName);
    if (filter.origin !== undefined)
      query = query.where('origin', '=', filter.origin);
    const rows = await query
      .select([
        'max_execution_id',
        'source',
        'max_trace_id',
        'operation',
        'service_id',
        'max_ms',
        'max_self_ms',
        'max_called_at',
      ])
      .orderBy('max_ms', 'desc')
      .orderBy('max_called_at', 'desc')
      .limit(filter.limit)
      .execute();
    return rows.map((row) => ({
      executionId: row.max_execution_id,
      source: row.source as ExecutionSource,
      traceId: row.max_trace_id,
      operationId: row.operation,
      serviceId: row.service_id,
      durationMs: row.max_ms,
      selfMs: row.max_self_ms,
      calledAt: row.max_called_at.toISOString(),
    }));
  }
}
