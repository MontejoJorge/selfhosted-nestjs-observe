import { Inject, Injectable } from '@nestjs/common';
import { sql, type RawBuilder, type SqlBool } from 'kysely';
import { KYSELY, type Db } from '../../database/database.types.js';
import { FIVE_MINUTE_GRAIN, inRollupScope, sumOf } from '../common/rollups.js';
import { ratio } from '../common/sql.js';
import type {
  ExecutionSource,
  ServiceDto,
  ServicesDto,
  SlowSpanDto,
} from './services.dto.js';
import {
  ServicesRepository,
  type ServicesFilter,
  type SlowSpansFilter,
} from './services.repository.js';

/** Escapes LIKE wildcards so user input matches literally. */
function likeLiteral(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/**
 * Source and operation filter. `operation` is the operationId of a request or
 * `queue/name` of a job, so a queue or name alone matches a prefix or suffix.
 */
function operationFilter(filter: ServicesFilter): RawBuilder<SqlBool> {
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
 * Outbound calls (DB queries, HTTP requests) come with their kind as the class name,
 * in lowercase (`pg`, `http`); classes are PascalCase. Services only lists classes.
 */
const IS_CLASS = sql<SqlBool>`class_name ~ '^[^a-z]'`;

/**
 * Reads `span_stats_5m` (ADR 0004): one grouped query per class and method over the
 * 5-minute buckets of the window, folded into classes here. Spans of every origin
 * count together.
 */
@Injectable()
export class PostgresServicesRepository extends ServicesRepository {
  constructor(@Inject(KYSELY) private readonly db: Db) {
    super();
  }

  async services(filter: ServicesFilter): Promise<ServicesDto> {
    const rows = await this.db
      .selectFrom('span_stats_5m')
      .where(inRollupScope(filter.scope, filter.window, {}, FIVE_MINUTE_GRAIN))
      .where(operationFilter(filter))
      .where(IS_CLASS)
      .select([
        'class_name',
        'method_name',
        sumOf('calls').as('calls'),
        sumOf('errors').as('errors'),
        sumOf('total_ms').as('total_ms'),
        sumOf('self_ms').as('self_ms'),
      ])
      .groupBy(['class_name', 'method_name'])
      .orderBy('self_ms', 'desc')
      .orderBy('method_name')
      .execute();

    const byClass = new Map<string, ServiceDto>();
    let totalSelfMs = 0;
    for (const row of rows) {
      let service = byClass.get(row.class_name);
      if (!service) {
        service = {
          className: row.class_name,
          calls: 0,
          errorCount: 0,
          totalMs: 0,
          selfMs: 0,
          share: 0,
          methods: [],
        };
        byClass.set(row.class_name, service);
      }
      service.calls += row.calls;
      service.errorCount += row.errors;
      service.totalMs += row.total_ms;
      service.selfMs += row.self_ms;
      service.methods.push({
        methodName: row.method_name,
        calls: row.calls,
        errorCount: row.errors,
        totalMs: row.total_ms,
        selfMs: row.self_ms,
      });
      totalSelfMs += row.self_ms;
    }
    const services = [...byClass.values()].sort(
      (a, b) => b.selfMs - a.selfMs || a.className.localeCompare(b.className),
    );
    for (const service of services)
      service.share = ratio(service.selfMs, totalSelfMs);
    return { totalSelfMs, services };
  }

  /**
   * Each rollup row keeps its slowest span, so this reads the rollup rows of one class
   * method in the window, slowest first: no scan of `spans`.
   */
  async slowestSpans(filter: SlowSpansFilter): Promise<SlowSpanDto[]> {
    const rows = await this.db
      .selectFrom('span_stats_5m')
      .where(inRollupScope(filter.scope, filter.window, {}, FIVE_MINUTE_GRAIN))
      .where(operationFilter(filter))
      .where('class_name', '=', filter.className)
      .where('method_name', '=', filter.methodName)
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
