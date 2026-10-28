import type {
  LogLevel,
  WireCustomMetric,
  WireJobSnapshot,
  WireLogEntry,
  WireObjectiveDeclaration,
  WireRequestSnapshot,
  WireRuntimeMetrics,
  WireTelemetryBatch,
  WireTraceNode,
} from '@selfhosted-observe/contracts';
import { errorFingerprint } from './error-fingerprint.js';
import type {
  CustomMetricSample,
  ErrorOccurrence,
  JobExecution,
  LogRecord,
  ObjectiveRecord,
  RequestExecution,
  RuntimeSample,
  SpanRecord,
  TelemetryBatchRecord,
} from './telemetry.js';
import { flattenTrace } from './trace-flattener.js';
import { uuidV7 } from './uuid-v7.js';
import {
  asDate,
  asError,
  asNumber,
  asRecord,
  asString,
  asTags,
  isRecord,
} from './wire-readers.js';

/** Events outside this window are dropped (older than retention, or from a skewed clock). */
export interface AcceptanceWindow {
  notBefore: Date;
  notAfter: Date;
}

const LOG_LEVELS = new Set<LogLevel>([
  'fatal',
  'error',
  'warn',
  'log',
  'debug',
  'verbose',
]);
const METRIC_TYPES = new Set(['counter', 'gauge', 'summary']);

function inWindow(date: Date, window: AcceptanceWindow): boolean {
  return date >= window.notBefore && date <= window.notAfter;
}

function asTrace(value: unknown): WireTraceNode[] {
  return Array.isArray(value) ? (value as WireTraceNode[]) : [];
}

/** Maps a validated wire batch to domain records. Malformed items are skipped, not rejected. */
export function mapTelemetryBatch(
  applicationId: string,
  batch: WireTelemetryBatch,
  receivedAt: Date,
  window: AcceptanceWindow,
): TelemetryBatchRecord {
  const serviceId = batch.serviceId;
  const serviceVersion = asString(batch.serviceVersion);
  const spans: SpanRecord[] = [];
  const errors: ErrorOccurrence[] = [];

  const requests: RequestExecution[] = [];
  for (const snapshot of batch.snapshots ?? []) {
    const request = mapRequest(snapshot, serviceId, serviceVersion, receivedAt);
    if (!request || !inWindow(request.calledAt, window)) continue;
    requests.push(request);
    spans.push(
      ...flattenTrace(
        {
          executionId: request.id,
          calledAt: request.calledAt,
          source: 'request',
          serviceId,
          traceId: request.traceId,
        },
        request.trace,
      ),
    );
    if (request.error) {
      errors.push(
        occurrence('request', request, request.operationId, request.error),
      );
    }
  }

  const jobs: JobExecution[] = [];
  for (const snapshot of batch.jobs ?? []) {
    const job = mapJob(snapshot, serviceId, serviceVersion, receivedAt);
    if (!job || !inWindow(job.calledAt, window)) continue;
    jobs.push(job);
    spans.push(
      ...flattenTrace(
        {
          executionId: job.id,
          calledAt: job.calledAt,
          source: 'job',
          serviceId,
          traceId: job.traceId,
        },
        job.trace,
      ),
    );
    if (job.error)
      errors.push(
        occurrence('job', job, `${job.queue}/${job.name}`, job.error),
      );
  }

  const logs: LogRecord[] = [];
  for (const entry of batch.logs ?? []) {
    const log = mapLog(entry, serviceId);
    if (log && inWindow(log.timestamp, window)) logs.push(log);
  }

  const customMetrics: CustomMetricSample[] = [];
  for (const metric of batch.custom ?? []) {
    const sample = mapCustomMetric(metric, serviceId, receivedAt);
    if (sample && inWindow(sample.recordedAt, window))
      customMetrics.push(sample);
  }

  const objectives: ObjectiveRecord[] = [];
  for (const declaration of batch.objectives ?? []) {
    const objective = mapObjective(declaration, serviceId, receivedAt);
    if (objective) objectives.push(objective);
  }

  return {
    applicationId,
    service: { serviceId, serviceVersion, seenAt: receivedAt },
    requests,
    jobs,
    spans,
    errors,
    logs,
    runtime: isRecord(batch.runtime)
      ? mapRuntime(batch.runtime, serviceId, receivedAt)
      : null,
    customMetrics,
    objectives,
  };
}

function occurrence(
  source: 'request' | 'job',
  execution: RequestExecution | JobExecution,
  culprit: string,
  error: NonNullable<RequestExecution['error']>,
): ErrorOccurrence {
  const errorClass = asString(error.cls);
  const stack = asString(error.stack);
  return {
    fingerprint: errorFingerprint(source, errorClass, error.message, stack),
    source,
    serviceId: execution.serviceId,
    errorClass,
    message: error.message,
    stack,
    culprit,
    executionId: execution.id,
    traceId: execution.traceId,
    occurredAt: execution.calledAt,
    durationMs: execution.durationMs,
  };
}

function mapRequest(
  snapshot: WireRequestSnapshot,
  serviceId: string,
  serviceVersion: string | null,
  receivedAt: Date,
): RequestExecution | null {
  if (!isRecord(snapshot)) return null;
  const traceId = asString(snapshot.ti);
  const operationId = asString(snapshot.op);
  if (!traceId || !operationId) return null;

  const calledAt = asDate(snapshot.ct, receivedAt);
  const attributes = asRecord(snapshot.a) ?? {};
  const statusCode = asNumber(attributes.sc);
  const error = asError(snapshot.e);
  return {
    id: uuidV7(calledAt.getTime()),
    calledAt,
    serviceId,
    serviceVersion,
    traceId,
    operationId,
    protocol: asString(snapshot.p) ?? 'http',
    method: asString(attributes.m),
    statusCode: statusCode === null ? null : Math.trunc(statusCode),
    url: asString(attributes.ou),
    durationMs: asNumber(snapshot.d) ?? 0,
    userId: asString(snapshot.u),
    hasError: error !== null || (statusCode !== null && statusCode >= 500),
    error,
    tags: asTags(snapshot.tg),
    request: asRecord(snapshot.rq),
    trace: asTrace(snapshot.t),
  };
}

function mapJob(
  snapshot: WireJobSnapshot,
  serviceId: string,
  serviceVersion: string | null,
  receivedAt: Date,
): JobExecution | null {
  if (!isRecord(snapshot)) return null;
  const traceId = asString(snapshot.ti);
  const jobId =
    asString(snapshot.i) ??
    (typeof snapshot.i === 'number' ? String(snapshot.i) : null);
  if (!traceId || !jobId) return null;

  const calledAt = asDate(snapshot.c, receivedAt);
  const status =
    snapshot.s === 'completed' || snapshot.s === 'failed' ? snapshot.s : null;
  const error = asError(snapshot.e);
  const enqueuedAt =
    snapshot.ea === undefined ? null : asDate(snapshot.ea, calledAt);
  return {
    id: uuidV7(calledAt.getTime()),
    calledAt,
    serviceId,
    serviceVersion,
    jobId,
    traceId,
    queue: asString(snapshot.q) ?? 'default',
    name: asString(snapshot.n) ?? 'unknown',
    status,
    durationMs: asNumber(snapshot.d) ?? 0,
    waitMs: asNumber(snapshot.wd),
    attemptsMade: asInteger(snapshot.am),
    maxAttempts: asInteger(snapshot.ma),
    enqueuedAt,
    hasError: error !== null || status === 'failed',
    error,
    tags: asTags(snapshot.tg),
    trace: asTrace(snapshot.t),
  };
}

function asInteger(value: unknown): number | null {
  const number = asNumber(value);
  return number === null ? null : Math.trunc(number);
}

function mapLog(entry: WireLogEntry, serviceId: string): LogRecord | null {
  if (!isRecord(entry) || typeof entry.text !== 'string') return null;
  const timestampMs = asNumber(entry.timestamp);
  if (timestampMs === null) return null;
  const timestamp = new Date(timestampMs);
  return {
    id: uuidV7(timestampMs),
    timestamp,
    serviceId,
    level: LOG_LEVELS.has(entry.level as LogLevel)
      ? (entry.level as LogLevel)
      : null,
    context: asString(entry.context),
    text: entry.text,
    traceId: asString(entry.traceId),
    spanId: asString(entry.spanId),
    attributes: asRecord(entry.attributes),
  };
}

function mapRuntime(
  runtime: WireRuntimeMetrics,
  serviceId: string,
  sampledAt: Date,
): RuntimeSample {
  const cpu = asRecord(runtime.c) ?? {};
  const memory = asRecord(runtime.m) ?? {};
  const gc = asRecord(runtime.g) ?? {};
  const eventLoop = asRecord(runtime.e) ?? {};
  const breakdown = asRecord(gc.b) ?? {};
  const minor = asRecord(breakdown.m) ?? {};
  const major = asRecord(breakdown.j) ?? {};
  const incremental = asRecord(breakdown.i) ?? {};
  return {
    sampledAt,
    serviceId,
    cpuUser: asNumber(cpu.u),
    cpuSystem: asNumber(cpu.s),
    cpuPercent: asNumber(cpu.p),
    memoryRss: asNumber(memory.r),
    heapTotal: asNumber(memory.ht),
    heapUsed: asNumber(memory.hu),
    memoryExternal: asNumber(memory.e),
    arrayBuffers: asNumber(memory.ab),
    memoryPercent: asNumber(memory.p),
    gcCount: asNumber(gc.c),
    gcDurationMs: asNumber(gc.td),
    gcMinorCount: asNumber(minor.count),
    gcMinorMs: asNumber(minor.duration),
    gcMajorCount: asNumber(major.count),
    gcMajorMs: asNumber(major.duration),
    gcIncrementalCount: asNumber(incremental.count),
    gcIncrementalMs: asNumber(incremental.duration),
    eventLoopLagMs: asNumber(eventLoop.l),
    eventLoopUtilization: asNumber(eventLoop.u),
  };
}

function numericValues(value: unknown): number[] {
  if (typeof value === 'number') return Number.isFinite(value) ? [value] : [];
  if (!isRecord(value)) return [];
  return Object.values(value).filter(
    (v): v is number => typeof v === 'number' && Number.isFinite(v),
  );
}

const sum = (values: number[]) => values.reduce((total, v) => total + v, 0);

/**
 * Collapses a metric whose values may be keyed by label set into one scalar:
 * summaries give the mean (sum / count), peak gauges the max, ratio gauges the mean,
 * and everything else the sum.
 */
export function scalarMetricValue(metric: WireCustomMetric): number | null {
  if (metric.t === 'summary') {
    const count = sum(numericValues(metric.ct));
    return count > 0 ? sum(numericValues(metric.sm)) / count : null;
  }
  const values = numericValues(metric.v);
  if (values.length === 0) return null;
  if (metric.k === 'peak') return Math.max(...values);
  if (metric.k === 'ratio') return sum(values) / values.length;
  return sum(values);
}

function mapCustomMetric(
  metric: WireCustomMetric,
  serviceId: string,
  receivedAt: Date,
): CustomMetricSample | null {
  if (!isRecord(metric)) return null;
  const name = asString(metric.n);
  if (!name || !METRIC_TYPES.has(metric.t)) return null;
  const { n: _name, t: _type, ...data } = metric;
  return {
    recordedAt:
      asNumber(metric.lu) === null ? receivedAt : asDate(metric.lu, receivedAt),
    serviceId,
    name,
    type: metric.t,
    kind: asString(metric.k),
    description: asString(metric.d),
    value: scalarMetricValue(metric),
    data,
  };
}

function mapObjective(
  declaration: WireObjectiveDeclaration,
  serviceId: string,
  receivedAt: Date,
): ObjectiveRecord | null {
  if (!isRecord(declaration)) return null;
  const operationId = asString(declaration.operationId);
  if (!operationId) return null;
  return {
    serviceId,
    operationId,
    handler: asString(declaration.handler) ?? '',
    method: asString(declaration.method),
    objectives: Array.isArray(declaration.objectives)
      ? declaration.objectives
      : [],
    updatedAt: receivedAt,
  };
}
