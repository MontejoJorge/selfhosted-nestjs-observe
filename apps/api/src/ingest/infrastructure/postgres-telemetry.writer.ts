import { Inject, Injectable } from '@nestjs/common';
import { sql, type Transaction } from 'kysely';
import { insertMany, toJson, toText } from '../../database/batch-insert.js';
import {
  KYSELY,
  type Database,
  type Db,
} from '../../database/database.types.js';
import { PartitionManager, utcDay } from '../../database/partition-manager.js';
import { TelemetryWriter } from '../application/ports.js';
import type {
  ErrorOccurrence,
  TelemetryBatchRecord,
} from '../domain/telemetry.js';

interface ErrorGroupDelta {
  fingerprint: string;
  sample: ErrorOccurrence;
  count: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
  culprits: Map<string, number>;
}

/**
 * Writes a batch in one transaction with multi-row inserts.
 *
 * Append-only tables are written first. Upserts on hot rows (objectives, error groups,
 * culprits, services) come last, in a deterministic key order, so row locks are held
 * briefly and concurrent batches cannot deadlock.
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
    await this.db.transaction().execute(async (trx) => {
      await this.insertExecutions(trx, batch);
      await this.insertSignals(trx, batch);
      await this.upsertObjectives(trx, batch);
      await this.upsertErrors(trx, batch.errors);
      await this.upsertService(trx, batch);
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
  ) {
    await insertMany(
      trx,
      'requests',
      batch.requests.map((r) => ({
        id: r.id,
        called_at: r.calledAt,
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

    await insertMany(
      trx,
      'jobs',
      batch.jobs.map((j) => ({
        id: j.id,
        called_at: j.calledAt,
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

    await insertMany(
      trx,
      'spans',
      batch.spans.map((s) => ({
        execution_id: s.executionId,
        called_at: s.calledAt,
        source: s.source,
        service_id: s.serviceId,
        trace_id: s.traceId,
        position: s.position,
        parent_position: s.parentPosition,
        depth: s.depth,
        span_id: s.spanId,
        parent_span_id: s.parentSpanId,
        name: s.name,
        origin: s.origin,
        class_name: s.className,
        method_name: s.methodName,
        duration_ms: s.durationMs,
        start_offset_ms: s.startOffsetMs,
        has_error: s.hasError,
        tags: toJson(s.tags),
        error: toJson(s.error),
      })),
    );
  }

  private async insertSignals(
    trx: Transaction<Database>,
    batch: TelemetryBatchRecord,
  ) {
    await insertMany(
      trx,
      'logs',
      batch.logs.map((l) => ({
        id: l.id,
        timestamp: l.timestamp,
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
      await insertMany(trx, 'runtime_metrics', [
        {
          sampled_at: r.sampledAt,
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
          gc_breakdown: toJson(r.gcBreakdown),
          event_loop_lag_ms: r.eventLoopLagMs,
          event_loop_utilization: r.eventLoopUtilization,
        },
      ]);
    }

    await insertMany(
      trx,
      'custom_metrics',
      batch.customMetrics.map((m) => ({
        recorded_at: m.recordedAt,
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

  private async upsertObjectives(
    trx: Transaction<Database>,
    batch: TelemetryBatchRecord,
  ) {
    // ON CONFLICT cannot touch the same row twice in one statement: dedupe, then sort.
    const byKey = new Map(
      batch.objectives.map(
        (o) => [`${o.operationId}\u0000${o.handler}`, o] as const,
      ),
    );
    const rows = [...byKey.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([, o]) => ({
        service_id: o.serviceId,
        operation_id: o.operationId,
        handler: o.handler,
        method: o.method,
        objectives: toJson(o.objectives) ?? '[]',
        updated_at: o.updatedAt,
      }));
    if (rows.length === 0) return;
    await trx
      .insertInto('objectives')
      .values(rows)
      .onConflict((oc) =>
        oc
          .columns(['service_id', 'operation_id', 'handler'])
          .doUpdateSet((eb) => ({
            method: eb.ref('excluded.method'),
            objectives: eb.ref('excluded.objectives'),
            updated_at: eb.ref('excluded.updated_at'),
          })),
      )
      .execute();
  }

  private async upsertErrors(
    trx: Transaction<Database>,
    errors: ErrorOccurrence[],
  ) {
    if (errors.length === 0) return;

    const deltas = new Map<string, ErrorGroupDelta>();
    for (const error of errors) {
      const key = `${error.serviceId}\u0000${error.fingerprint}`;
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
          service_id: d.sample.serviceId,
          fingerprint: d.fingerprint,
          source: d.sample.source,
          error_class: d.sample.errorClass,
          message: toText(d.sample.message),
          stack: toText(d.sample.stack),
          count: d.count,
          first_seen_at: d.firstSeenAt,
          last_seen_at: d.lastSeenAt,
        })),
      )
      .onConflict((oc) =>
        oc.columns(['service_id', 'fingerprint']).doUpdateSet((eb) => ({
          count: sql<number>`${eb.ref('error_groups.count')} + ${eb.ref('excluded.count')}`,
          first_seen_at: sql<Date>`least(${eb.ref('error_groups.first_seen_at')}, ${eb.ref('excluded.first_seen_at')})`,
          last_seen_at: sql<Date>`greatest(${eb.ref('error_groups.last_seen_at')}, ${eb.ref('excluded.last_seen_at')})`,
          // keep the most recent message and stack as the group's sample
          message: sql<string>`case when ${eb.ref('excluded.last_seen_at')} >= ${eb.ref('error_groups.last_seen_at')} then ${eb.ref('excluded.message')} else ${eb.ref('error_groups.message')} end`,
          stack: sql<
            string | null
          >`case when ${eb.ref('excluded.last_seen_at')} >= ${eb.ref('error_groups.last_seen_at')} then ${eb.ref('excluded.stack')} else ${eb.ref('error_groups.stack')} end`,
        })),
      )
      .returning(['id', 'service_id', 'fingerprint'])
      .execute();

    const groupIds = new Map(
      groups.map((g) => [`${g.service_id}\u0000${g.fingerprint}`, g.id]),
    );
    const idOf = (serviceId: string, fingerprint: string) => {
      const id = groupIds.get(`${serviceId}\u0000${fingerprint}`);
      if (id === undefined)
        throw new Error(`error group ${fingerprint} was not upserted`);
      return id;
    };

    const culprits = ordered
      .flatMap((d) =>
        [...d.culprits.entries()].map(([culprit, count]) => ({
          group_id: idOf(d.sample.serviceId, d.fingerprint),
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

    await insertMany(
      trx,
      'error_occurrences',
      errors.map((e) => ({
        group_id: idOf(e.serviceId, e.fingerprint),
        occurred_at: e.occurredAt,
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
        service_id: serviceId,
        service_version: serviceVersion,
        first_seen_at: seenAt,
        last_seen_at: seenAt,
      })
      .onConflict((oc) =>
        oc.column('service_id').doUpdateSet((eb) => ({
          service_version: sql<
            string | null
          >`coalesce(${eb.ref('excluded.service_version')}, ${eb.ref('services.service_version')})`,
          last_seen_at: sql<Date>`greatest(${eb.ref('services.last_seen_at')}, ${eb.ref('excluded.last_seen_at')})`,
        })),
      )
      .execute();
  }
}
