import { Inject, Injectable } from '@nestjs/common';
import type {
  CustomMetricSummary,
  RuntimeSeriesPoint,
} from '@selfhosted-observe/contracts';
import { KYSELY, type Db } from '../../database/database.types.js';
import { bucketStart } from '../common/sql.js';
import { bucketSeconds, type TimeWindow } from '../common/time-window.js';
import { MetricsRepository } from './metrics.repository.js';

/** Upper bound on distinct custom metrics returned. */
const CUSTOM_METRICS_LIMIT = 1000;

@Injectable()
export class PostgresMetricsRepository extends MetricsRepository {
  constructor(@Inject(KYSELY) private readonly db: Db) {
    super();
  }

  /** Uses the (service_id, sampled_at) index on the pruned partitions. */
  async runtime(
    serviceId: string,
    window: TimeWindow,
  ): Promise<RuntimeSeriesPoint[]> {
    const t = bucketStart('sampled_at', bucketSeconds(window));
    const rows = await this.db
      .selectFrom('runtime_metrics')
      .select((eb) => [
        t.as('t'),
        eb.fn.avg<number | null>('cpu_percent').as('cpu_percent'),
        eb.fn.avg<number | null>('memory_rss').as('memory_rss'),
        eb.fn.avg<number | null>('heap_used').as('heap_used'),
        eb.fn.avg<number | null>('heap_total').as('heap_total'),
        eb.fn.avg<number | null>('event_loop_lag_ms').as('event_loop_lag_ms'),
        eb.fn
          .avg<number | null>('event_loop_utilization')
          .as('event_loop_utilization'),
        eb.fn.sum<number | null>('gc_count').as('gc_count'),
        eb.fn.sum<number | null>('gc_duration_ms').as('gc_duration_ms'),
      ])
      .where('service_id', '=', serviceId)
      .where('sampled_at', '>=', window.from)
      .where('sampled_at', '<', window.to)
      .groupBy(t)
      .orderBy(t)
      .execute();
    return rows.map((row) => ({
      t: row.t.toISOString(),
      cpuPercent: row.cpu_percent,
      memoryRss: row.memory_rss,
      heapUsed: row.heap_used,
      heapTotal: row.heap_total,
      eventLoopLagMs: row.event_loop_lag_ms,
      eventLoopUtilization: row.event_loop_utilization,
      gcCount: row.gc_count,
      gcDurationMs: row.gc_duration_ms,
    }));
  }

  /** DISTINCT ON keeps the newest sample per (name, type) within the pruned window. */
  async custom(
    window: TimeWindow,
    serviceId?: string,
  ): Promise<CustomMetricSummary[]> {
    let query = this.db
      .selectFrom('custom_metrics')
      .select(['name', 'type', 'description', 'value', 'recorded_at'])
      .distinctOn(['name', 'type'])
      .where('recorded_at', '>=', window.from)
      .where('recorded_at', '<', window.to);
    if (serviceId) query = query.where('service_id', '=', serviceId);
    const rows = await query
      .orderBy('name')
      .orderBy('type')
      .orderBy('recorded_at', 'desc')
      .limit(CUSTOM_METRICS_LIMIT)
      .execute();
    return rows.map((row) => ({
      name: row.name,
      type: row.type as CustomMetricSummary['type'],
      description: row.description,
      lastValue: row.value,
      lastSeenAt: row.recorded_at.toISOString(),
    }));
  }
}
