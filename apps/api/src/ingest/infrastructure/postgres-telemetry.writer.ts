import { Inject, Injectable } from '@nestjs/common';
import { sql, type Insertable, type Transaction } from 'kysely';
import {
  chunkRows,
  insertMany,
  toJson,
  toText,
} from '../../database/batch-insert.js';
import {
  KYSELY,
  type Database,
  type Db,
  type UsageTable,
} from '../../database/database.types.js';
import { PartitionManager, utcDay } from '../../database/partition-manager.js';
import { TelemetryWriter } from '../application/ports.js';
import type {
  ErrorOccurrence,
  TelemetryBatchRecord,
} from '../domain/telemetry.js';
import { UsageTally, upsertUsage } from './usage-tally.js';

interface ErrorGroupDelta {
  fingerprint: string;
  sample: ErrorOccurrence;
  count: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
  culprits: Map<string, number>;
}

/** `<table>.<column> + excluded.<column>`, to add a batch's counts to a rollup row. */
function added(table: string, column: string) {
  return sql<number>`${sql.ref(`${table}.${column}`)} + ${sql.ref(`excluded.${column}`)}`;
}

type LatencyRollupTable =
  'requests_1m' | 'jobs_1m' | 'users_1h' | 'span_stats_5m';

/** `excluded.<column>` when the incoming row holds the slower span, else the stored one. */
function ofSlowest<T>(column: string) {
  return sql<T>`case when excluded.max_ms > span_stats_5m.max_ms then ${sql.ref(`excluded.${column}`)} else ${sql.ref(`span_stats_5m.${column}`)} end`;
}

/** Merges min, max, histogram and last call time of a latency rollup row. */
function latencyMerge(table: LatencyRollupTable) {
  return {
    min_ms: sql<number>`least(${sql.ref(`${table}.min_ms`)}, excluded.min_ms)`,
    max_ms: sql<number>`greatest(${sql.ref(`${table}.max_ms`)}, excluded.max_ms)`,
    histogram: sql<
      number[]
    >`histogram_add(${sql.ref(`${table}.histogram`)}, excluded.histogram)`,
    last_called_at: sql<Date>`greatest(${sql.ref(`${table}.last_called_at`)}, excluded.last_called_at)`,
  };
}

/**
 * Writes a batch in one transaction with multi-row inserts.
 *
 * Append-only tables are written first. Upserts on hot rows (minute rollups, error
 * groups, culprits, services, version history, and the application's usage counters at
 * the very end) come last, in a deterministic key order, so row locks are held briefly
 * and concurrent batches cannot deadlock.
 */
@Injectable()
export class PostgresTelemetryWriter extends TelemetryWriter {
  constructor(
    @Inject(KYSELY) private readonly db: Db,
    private readonly partitions: PartitionManager,
  ) {
    super();
  }

  async write(batch: TelemetryBatchRecord): Promise<void> {
    await this.partitions.ensureDays(this.daysOf(batch));
    const usage = new UsageTally();
    await this.db.transaction().execute(async (trx) => {
      await this.insertExecutions(trx, batch, usage);
      await this.insertSignals(trx, batch, usage);
      await this.upsertRollups(trx, batch);
      await this.upsertErrors(trx, batch.applicationId, batch.errors, usage);
      await this.upsertService(trx, batch);
      await this.upsertVersion(trx, batch);
      await this.touchApplication(trx, batch);
      await upsertUsage(trx, usage.rowsOf(batch.applicationId));
    });
  }

  private daysOf(batch: TelemetryBatchRecord): Set<string> {
    const days = new Set<string>([utcDay(batch.service.seenAt)]);
    for (const r of batch.requests) days.add(utcDay(r.calledAt));
    for (const j of batch.jobs) days.add(utcDay(j.calledAt));
    for (const l of batch.logs) days.add(utcDay(l.timestamp));
    for (const m of batch.customMetrics) days.add(utcDay(m.recordedAt));
    return days;
  }

  private async insertExecutions(
    trx: Transaction<Database>,
    batch: TelemetryBatchRecord,
    usage: UsageTally,
  ) {
    const application_id = batch.applicationId;
    await this.insertCounted(
      trx,
      usage,
      'requests',
      batch.requests.map((r) => ({
        id: r.id,
        called_at: r.calledAt,
        application_id,
        service_id: r.serviceId,
        service_version: r.serviceVersion,
        trace_id: r.traceId,
        operation_id: r.operationId,
        protocol: r.protocol,
        method: r.method,
        status_code: r.statusCode,
        url: r.url,
        duration_ms: r.durationMs,
        user_id: r.userId,
        has_error: r.hasError,
        error: toJson(r.error),
        tags: toJson(r.tags),
        request: toJson(r.request),
        trace: toJson(r.trace) ?? '[]',
      })),
    );

    await this.insertCounted(
      trx,
      usage,
      'jobs',
      batch.jobs.map((j) => ({
        id: j.id,
        called_at: j.calledAt,
        application_id,
        service_id: j.serviceId,
        service_version: j.serviceVersion,
        job_id: j.jobId,
        trace_id: j.traceId,
        queue: j.queue,
        name: j.name,
        status: j.status,
        duration_ms: j.durationMs,
        wait_ms: j.waitMs,
        attempts_made: j.attemptsMade,
        max_attempts: j.maxAttempts,
        enqueued_at: j.enqueuedAt,
        has_error: j.hasError,
        error: toJson(j.error),
        tags: toJson(j.tags),
        trace: toJson(j.trace) ?? '[]',
      })),
    );
  }

  private async insertSignals(
    trx: Transaction<Database>,
    batch: TelemetryBatchRecord,
    usage: UsageTally,
  ) {
    const application_id = batch.applicationId;
    await this.insertCounted(
      trx,
      usage,
      'logs',
      batch.logs.map((l) => ({
        id: l.id,
        timestamp: l.timestamp,
        application_id,
        service_id: l.serviceId,
        level: l.level,
        context: l.context,
        text: toText(l.text),
        trace_id: l.traceId,
        span_id: l.spanId,
        attributes: toJson(l.attributes),
      })),
    );

    if (batch.runtime) {
      const r = batch.runtime;
      await this.insertCounted(trx, usage, 'runtime_metrics', [
        {
          sampled_at: r.sampledAt,
          application_id,
          service_id: r.serviceId,
          cpu_user: r.cpuUser,
          cpu_system: r.cpuSystem,
          cpu_percent: r.cpuPercent,
          memory_rss: r.memoryRss,
          heap_total: r.heapTotal,
          heap_used: r.heapUsed,
          memory_external: r.memoryExternal,
          array_buffers: r.arrayBuffers,
          memory_percent: r.memoryPercent,
          gc_count: r.gcCount,
          gc_duration_ms: r.gcDurationMs,
          gc_minor_count: r.gcMinorCount,
          gc_minor_ms: r.gcMinorMs,
          gc_major_count: r.gcMajorCount,
          gc_major_ms: r.gcMajorMs,
          gc_incremental_count: r.gcIncrementalCount,
          gc_incremental_ms: r.gcIncrementalMs,
          event_loop_lag_ms: r.eventLoopLagMs,
          event_loop_utilization: r.eventLoopUtilization,
        },
      ]);
    }

    await this.insertCounted(
      trx,
      usage,
      'custom_metrics',
      batch.customMetrics.map((m) => ({
        recorded_at: m.recordedAt,
        application_id,
        service_id: m.serviceId,
        name: m.name,
        type: m.type,
        kind: m.kind,
        description: m.description,
        value: m.value,
        data: toJson(m.data) ?? '{}',
      })),
    );
  }

  /** Inserts rows into a raw table and counts them for `application_usage`. */
  private async insertCounted<T extends UsageTable>(
    trx: Transaction<Database>,
    usage: UsageTally,
    table: T,
    rows: Insertable<Database[T]>[],
  ) {
    usage.add(table, rows);
    await insertMany(trx, table, rows);
  }

  /**
   * Adds the batch's rollups (already in key order) to `requests_1m`, `jobs_1m`,
   * `users_1h`, `user_presence_15m` and `span_stats_5m`.
   */
  private async upsertRollups(
    trx: Transaction<Database>,
    batch: TelemetryBatchRecord,
  ) {
    const application_id = batch.applicationId;
    const requestRows = batch.requestRollups.map((r) => ({
      application_id,
      minute: r.minute,
      service_id: r.serviceId,
      operation_id: r.operationId,
      protocol: r.protocol,
      method: r.method ?? '',
      count: r.count,
      errors: r.errors,
      status_4xx: r.status4xx,
      status_5xx: r.status5xx,
      sum_ms: r.sumMs,
      min_ms: r.minMs,
      max_ms: r.maxMs,
      histogram: r.histogram,
      last_called_at: r.lastCalledAt,
    }));
    for (const chunk of chunkRows(requestRows, 15)) {
      await trx
        .insertInto('requests_1m')
        .values(chunk)
        .onConflict((oc) =>
          oc
            .columns([
              'application_id',
              'minute',
              'service_id',
              'operation_id',
              'protocol',
              'method',
            ])
            .doUpdateSet({
              ...latencyMerge('requests_1m'),
              count: added('requests_1m', 'count'),
              sum_ms: added('requests_1m', 'sum_ms'),
              errors: added('requests_1m', 'errors'),
              status_4xx: added('requests_1m', 'status_4xx'),
              status_5xx: added('requests_1m', 'status_5xx'),
            }),
        )
        .execute();
    }

    const jobRows = batch.jobRollups.map((j) => ({
      application_id,
      minute: j.minute,
      service_id: j.serviceId,
      queue: j.queue,
      name: j.name,
      count: j.count,
      failed: j.failed,
      sum_ms: j.sumMs,
      min_ms: j.minMs,
      max_ms: j.maxMs,
      histogram: j.histogram,
      wait_sum_ms: j.waitSumMs,
      wait_count: j.waitCount,
      last_called_at: j.lastCalledAt,
    }));
    for (const chunk of chunkRows(jobRows, 14)) {
      await trx
        .insertInto('jobs_1m')
        .values(chunk)
        .onConflict((oc) =>
          oc
            .columns([
              'application_id',
              'minute',
              'service_id',
              'queue',
              'name',
            ])
            .doUpdateSet({
              ...latencyMerge('jobs_1m'),
              count: added('jobs_1m', 'count'),
              sum_ms: added('jobs_1m', 'sum_ms'),
              failed: added('jobs_1m', 'failed'),
              wait_sum_ms: added('jobs_1m', 'wait_sum_ms'),
              wait_count: added('jobs_1m', 'wait_count'),
            }),
        )
        .execute();
    }

    const userRows = batch.userRollups.map((u) => ({
      application_id,
      hour: u.hour,
      user_id: u.userId,
      count: u.count,
      errors: u.errors,
      status_4xx: u.status4xx,
      status_5xx: u.status5xx,
      sum_ms: u.sumMs,
      min_ms: u.minMs,
      max_ms: u.maxMs,
      histogram: u.histogram,
      first_called_at: u.firstCalledAt,
      last_called_at: u.lastCalledAt,
    }));
    for (const chunk of chunkRows(userRows, 13)) {
      await trx
        .insertInto('users_1h')
        .values(chunk)
        .onConflict((oc) =>
          oc.columns(['application_id', 'hour', 'user_id']).doUpdateSet({
            ...latencyMerge('users_1h'),
            count: added('users_1h', 'count'),
            sum_ms: added('users_1h', 'sum_ms'),
            errors: added('users_1h', 'errors'),
            status_4xx: added('users_1h', 'status_4xx'),
            status_5xx: added('users_1h', 'status_5xx'),
            first_called_at: sql<Date>`least(users_1h.first_called_at, excluded.first_called_at)`,
          }),
        )
        .execute();
    }

    const presenceRows = batch.userPresence.map((p) => ({
      application_id,
      bucket: p.bucket,
      user_id: p.userId,
    }));
    for (const chunk of chunkRows(presenceRows, 3)) {
      await trx
        .insertInto('user_presence_15m')
        .values(chunk)
        .onConflict((oc) => oc.doNothing())
        .execute();
    }

    const spanRows = batch.spanRollups.map((s) => ({
      application_id,
      bucket: s.bucket,
      service_id: s.serviceId,
      source: s.source,
      operation: s.operation,
      origin: s.origin,
      class_name: s.className,
      method_name: s.methodName,
      calls: s.count,
      errors: s.errors,
      total_ms: s.sumMs,
      self_ms: s.selfSumMs,
      min_ms: s.minMs,
      max_ms: s.maxMs,
      histogram: s.histogram,
      max_execution_id: s.slowest.executionId,
      max_trace_id: s.slowest.traceId,
      max_called_at: s.slowest.calledAt,
      max_self_ms: s.slowest.selfMs,
      last_called_at: s.lastCalledAt,
    }));
    for (const chunk of chunkRows(spanRows, 20)) {
      await trx
        .insertInto('span_stats_5m')
        .values(chunk)
        .onConflict((oc) =>
          oc
            .columns([
              'application_id',
              'bucket',
              'service_id',
              'source',
              'operation',
              'origin',
              'class_name',
              'method_name',
            ])
            .doUpdateSet({
              // every expression reads the stored row as it was, so the slowest-span
              // columns compare against the old max_ms
              max_execution_id: ofSlowest<string>('max_execution_id'),
              max_trace_id: ofSlowest<string>('max_trace_id'),
              max_called_at: ofSlowest<Date>('max_called_at'),
              max_self_ms: ofSlowest<number>('max_self_ms'),
              ...latencyMerge('span_stats_5m'),
              calls: added('span_stats_5m', 'calls'),
              errors: added('span_stats_5m', 'errors'),
              total_ms: added('span_stats_5m', 'total_ms'),
              self_ms: added('span_stats_5m', 'self_ms'),
            }),
        )
        .execute();
    }
  }

  private async upsertErrors(
    trx: Transaction<Database>,
    applicationId: string,
    errors: ErrorOccurrence[],
    usage: UsageTally,
  ) {
    if (errors.length === 0) return;

    const deltas = new Map<string, ErrorGroupDelta>();
    for (const error of errors) {
      const key = error.fingerprint;
      const delta = deltas.get(key);
      if (!delta) {
        deltas.set(key, {
          fingerprint: error.fingerprint,
          sample: error,
          count: 1,
          firstSeenAt: error.occurredAt,
          lastSeenAt: error.occurredAt,
          culprits: new Map([[error.culprit, 1]]),
        });
        continue;
      }
      delta.count++;
      if (error.occurredAt < delta.firstSeenAt)
        delta.firstSeenAt = error.occurredAt;
      if (error.occurredAt > delta.lastSeenAt) {
        delta.lastSeenAt = error.occurredAt;
        delta.sample = error;
      }
      delta.culprits.set(
        error.culprit,
        (delta.culprits.get(error.culprit) ?? 0) + 1,
      );
    }
    const ordered = [...deltas.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([, delta]) => delta);

    const groups = await trx
      .insertInto('error_groups')
      .values(
        ordered.map((d) => ({
          application_id: applicationId,
          fingerprint: d.fingerprint,
          source: d.sample.source,
          service_id: d.sample.serviceId,
          error_class: d.sample.errorClass,
          message: toText(d.sample.message),
          stack: toText(d.sample.stack),
          count: d.count,
          first_seen_at: d.firstSeenAt,
          last_seen_at: d.lastSeenAt,
        })),
      )
      .onConflict((oc) =>
        oc.columns(['application_id', 'fingerprint']).doUpdateSet((eb) => ({
          count: sql<number>`${eb.ref('error_groups.count')} + ${eb.ref('excluded.count')}`,
          first_seen_at: sql<Date>`least(${eb.ref('error_groups.first_seen_at')}, ${eb.ref('excluded.first_seen_at')})`,
          last_seen_at: sql<Date>`greatest(${eb.ref('error_groups.last_seen_at')}, ${eb.ref('excluded.last_seen_at')})`,
          // keep the most recent message and stack as the group's sample
          message: sql<string>`case when ${eb.ref('excluded.last_seen_at')} >= ${eb.ref('error_groups.last_seen_at')} then ${eb.ref('excluded.message')} else ${eb.ref('error_groups.message')} end`,
          stack: sql<
            string | null
          >`case when ${eb.ref('excluded.last_seen_at')} >= ${eb.ref('error_groups.last_seen_at')} then ${eb.ref('excluded.stack')} else ${eb.ref('error_groups.stack')} end`,
          service_id: sql<string>`case when ${eb.ref('excluded.last_seen_at')} >= ${eb.ref('error_groups.last_seen_at')} then ${eb.ref('excluded.service_id')} else ${eb.ref('error_groups.service_id')} end`,
        })),
      )
      .returning(['id', 'fingerprint'])
      .execute();

    const groupIds = new Map(groups.map((g) => [g.fingerprint, g.id]));
    const idOf = (fingerprint: string) => {
      const id = groupIds.get(fingerprint);
      if (id === undefined)
        throw new Error(`error group ${fingerprint} was not upserted`);
      return id;
    };

    const culprits = ordered
      .flatMap((d) =>
        [...d.culprits.entries()].map(([culprit, count]) => ({
          group_id: idOf(d.fingerprint),
          culprit: toText(culprit),
          count,
        })),
      )
      .sort((a, b) =>
        a.group_id !== b.group_id
          ? Number(a.group_id) - Number(b.group_id)
          : a.culprit < b.culprit
            ? -1
            : a.culprit > b.culprit
              ? 1
              : 0,
      );
    await trx
      .insertInto('error_group_culprits')
      .values(culprits)
      .onConflict((oc) =>
        oc.columns(['group_id', 'culprit']).doUpdateSet((eb) => ({
          count: sql<number>`${eb.ref('error_group_culprits.count')} + ${eb.ref('excluded.count')}`,
        })),
      )
      .execute();

    await this.insertCounted(
      trx,
      usage,
      'error_occurrences',
      errors.map((e) => ({
        group_id: idOf(e.fingerprint),
        occurred_at: e.occurredAt,
        application_id: applicationId,
        execution_id: e.executionId,
        source: e.source,
        service_id: e.serviceId,
        trace_id: e.traceId,
        duration_ms: e.durationMs,
      })),
    );
  }

  private async upsertService(
    trx: Transaction<Database>,
    batch: TelemetryBatchRecord,
  ) {
    const { serviceId, serviceVersion, seenAt } = batch.service;
    await trx
      .insertInto('services')
      .values({
        application_id: batch.applicationId,
        service_id: serviceId,
        service_version: serviceVersion,
        first_seen_at: seenAt,
        last_seen_at: seenAt,
      })
      .onConflict((oc) =>
        oc.columns(['application_id', 'service_id']).doUpdateSet((eb) => ({
          service_version: sql<
            string | null
          >`coalesce(${eb.ref('excluded.service_version')}, ${eb.ref('services.service_version')})`,
          last_seen_at: sql<Date>`greatest(${eb.ref('services.last_seen_at')}, ${eb.ref('excluded.last_seen_at')})`,
        })),
      )
      .execute();
  }

  /** One row per batch (one instance and version), after `services` in key order. */
  private async upsertVersion(
    trx: Transaction<Database>,
    batch: TelemetryBatchRecord,
  ) {
    if (!batch.version) return;
    const { serviceId, serviceVersion, firstSeenAt, lastSeenAt } =
      batch.version;
    await trx
      .insertInto('service_versions')
      .values({
        application_id: batch.applicationId,
        service_id: serviceId,
        service_version: serviceVersion,
        first_seen_at: firstSeenAt,
        last_seen_at: lastSeenAt,
      })
      .onConflict((oc) =>
        oc
          .columns(['application_id', 'service_id', 'service_version'])
          .doUpdateSet((eb) => ({
            first_seen_at: sql<Date>`least(${eb.ref('service_versions.first_seen_at')}, ${eb.ref('excluded.first_seen_at')})`,
            last_seen_at: sql<Date>`greatest(${eb.ref('service_versions.last_seen_at')}, ${eb.ref('excluded.last_seen_at')})`,
          })),
      )
      .execute();
  }

  /**
   * Advances `applications.last_seen_at`, at most every 30 s: the condition skips the
   * write (and the row lock) for most batches of a busy application.
   */
  private async touchApplication(
    trx: Transaction<Database>,
    batch: TelemetryBatchRecord,
  ) {
    const { seenAt } = batch.service;
    await trx
      .updateTable('applications')
      .set({ last_seen_at: seenAt })
      .where('id', '=', batch.applicationId)
      .where((eb) =>
        eb.or([
          eb('last_seen_at', 'is', null),
          eb('last_seen_at', '<', new Date(seenAt.getTime() - 30_000)),
        ]),
      )
      .execute();
  }
}
