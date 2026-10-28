import { Inject, Injectable } from '@nestjs/common';
import { sql, type RawBuilder } from 'kysely';
import { KYSELY, type Db } from '../../database/database.types.js';
import { inApplications, type TelemetryScope } from '../common/scope.js';
import { bucketStart } from '../common/sql.js';
import { bucketSeconds, type TimeWindow } from '../common/time-window.js';
import type {
  RuntimeInstanceDto,
  RuntimeMetricsDto,
  RuntimeSnapshotDto,
} from './metrics.dto.js';
import { MetricsRepository } from './metrics.repository.js';

/** Upper bound on instances returned for one application. */
const INSTANCES_LIMIT = 500;

const avg = (column: string): RawBuilder<number | null> =>
  sql<number | null>`avg(${sql.ref(column)})::float8`;
const total = (column: string): RawBuilder<number | null> =>
  sql<number | null>`sum(${sql.ref(column)})::float8`;

const SNAPSHOT_COLUMNS = [
  'cpu_percent',
  'memory_percent',
  'memory_rss',
  'heap_used',
  'event_loop_lag_ms',
  'event_loop_utilization',
] as const;

interface SnapshotRow {
  cpu_percent: number | null;
  memory_percent: number | null;
  memory_rss: number | null;
  heap_used: number | null;
  event_loop_lag_ms: number | null;
  event_loop_utilization: number | null;
}

@Injectable()
export class PostgresMetricsRepository extends MetricsRepository {
  constructor(@Inject(KYSELY) private readonly db: Db) {
    super();
  }

  /**
   * Three queries in parallel over the pruned partitions, each one index range on
   * (application_id, sampled_at desc), or (application_id, service_id, sampled_at desc)
   * with an instance: the bucketed series, the averages, and the newest sample.
   */
  async runtime(
    scope: TelemetryScope,
    window: TimeWindow,
  ): Promise<RuntimeMetricsDto> {
    const samples = () => {
      const q = this.db
        .selectFrom('runtime_metrics')
        .where(inApplications('application_id', scope.applicationIds))
        .where('sampled_at', '>=', window.from)
        .where('sampled_at', '<', window.to);
      return scope.instance ? q.where('service_id', '=', scope.instance) : q;
    };
    const t = bucketStart('sampled_at', bucketSeconds(window));

    const [series, averages, latest] = await Promise.all([
      samples()
        .select([
          t.as('t'),
          avg('cpu_percent').as('cpu_percent'),
          total('cpu_user').as('cpu_user'),
          total('cpu_system').as('cpu_system'),
          avg('memory_rss').as('memory_rss'),
          avg('memory_percent').as('memory_percent'),
          avg('heap_used').as('heap_used'),
          avg('heap_total').as('heap_total'),
          avg('event_loop_lag_ms').as('event_loop_lag_ms'),
          avg('event_loop_utilization').as('event_loop_utilization'),
          total('gc_count').as('gc_count'),
          total('gc_duration_ms').as('gc_duration_ms'),
          total('gc_minor_count').as('gc_minor_count'),
          total('gc_minor_ms').as('gc_minor_ms'),
          total('gc_major_count').as('gc_major_count'),
          total('gc_major_ms').as('gc_major_ms'),
          total('gc_incremental_count').as('gc_incremental_count'),
          total('gc_incremental_ms').as('gc_incremental_ms'),
        ])
        .groupBy(t)
        .orderBy(t)
        .execute(),
      samples()
        .select(SNAPSHOT_COLUMNS.map((column) => avg(column).as(column)))
        .executeTakeFirstOrThrow(),
      samples()
        .select([...SNAPSHOT_COLUMNS, 'sampled_at', 'service_id'])
        .orderBy('sampled_at', 'desc')
        .limit(1)
        .executeTakeFirst(),
    ]);

    return {
      avg: toSnapshot(averages as SnapshotRow),
      latest: latest
        ? Object.assign(toSnapshot(latest), {
            sampledAt: latest.sampled_at.toISOString(),
            serviceId: latest.service_id,
          })
        : null,
      series: series.map((row) => ({
        t: row.t.toISOString(),
        cpuPercent: row.cpu_percent,
        cpuUserMs: row.cpu_user,
        cpuSystemMs: row.cpu_system,
        memoryRss: row.memory_rss,
        memoryPercent: row.memory_percent,
        heapUsed: row.heap_used,
        heapTotal: row.heap_total,
        eventLoopLagMs: row.event_loop_lag_ms,
        eventLoopUtilization: row.event_loop_utilization,
        gcCount: row.gc_count,
        gcDurationMs: row.gc_duration_ms,
        gcMinorCount: row.gc_minor_count,
        gcMinorMs: row.gc_minor_ms,
        gcMajorCount: row.gc_major_count,
        gcMajorMs: row.gc_major_ms,
        gcIncrementalCount: row.gc_incremental_count,
        gcIncrementalMs: row.gc_incremental_ms,
      })),
    };
  }

  /**
   * Candidate instances come from `services` (primary key on application_id, service_id),
   * then a LIMIT 1 lateral per instance reads its newest sample in the window from the
   * (application_id, service_id, sampled_at desc) index. Instances without samples in the
   * window are left out.
   */
  async instances(
    scope: TelemetryScope,
    window: TimeWindow,
  ): Promise<RuntimeInstanceDto[]> {
    const rows = await this.db
      .selectFrom('services as s')
      .innerJoinLateral(
        (eb) =>
          eb
            .selectFrom('runtime_metrics as m')
            .select([
              'm.sampled_at',
              'm.cpu_percent',
              'm.memory_percent',
              'm.memory_rss',
              'm.heap_used',
              'm.event_loop_lag_ms',
              'm.event_loop_utilization',
            ])
            .whereRef('m.application_id', '=', 's.application_id')
            .whereRef('m.service_id', '=', 's.service_id')
            .where('m.sampled_at', '>=', window.from)
            .where('m.sampled_at', '<', window.to)
            .orderBy('m.sampled_at', 'desc')
            .limit(1)
            .as('m'),
        (join) => join.onTrue(),
      )
      .select([
        's.service_id',
        's.service_version',
        'm.sampled_at',
        'm.cpu_percent',
        'm.memory_percent',
        'm.memory_rss',
        'm.heap_used',
        'm.event_loop_lag_ms',
        'm.event_loop_utilization',
      ])
      .where(inApplications('s.application_id', scope.applicationIds))
      .where('s.last_seen_at', '>=', window.from)
      .where('s.first_seen_at', '<', window.to)
      .orderBy('m.sampled_at', 'desc')
      .orderBy('s.service_id')
      .limit(INSTANCES_LIMIT)
      .execute();
    return rows.map((row) =>
      Object.assign(toSnapshot(row), {
        serviceId: row.service_id,
        serviceVersion: row.service_version,
        lastSeenAt: row.sampled_at.toISOString(),
      }),
    );
  }
}

function toSnapshot(row: SnapshotRow): RuntimeSnapshotDto {
  return {
    cpuPercent: row.cpu_percent,
    memoryPercent: row.memory_percent,
    memoryRss: row.memory_rss,
    heapUsed: row.heap_used,
    eventLoopLagMs: row.event_loop_lag_ms,
    eventLoopUtilization: row.event_loop_utilization,
  };
}
