/**
 * Query API consumed by the dashboard. All routes are under `/api`.
 * Timestamps are ISO strings, durations are milliseconds.
 *
 * Every list endpoint accepts `TimeRangeQuery` plus `service` (serviceId, optional).
 * Defaults: `range=1h` when neither `range` nor `from`/`to` is given; `limit=50` (max 500).
 * Lists are newest first (time desc, id desc). `cursor` is opaque: pass `nextCursor` back
 * with the same filters. `count` on error groups is all-time (within retention).
 */

import type { LogLevel, Primitive, Protocol, WireError } from './wire.js';

export type TimeRange = '15m' | '1h' | '6h' | '24h' | '7d' | '14d';

export interface TimeRangeQuery {
  /** Relative window ending now. Ignored when `from`/`to` are given. */
  range?: TimeRange;
  from?: string;
  to?: string;
}

export interface PageQuery {
  limit?: number;
  /** Opaque cursor returned by the previous page. */
  cursor?: string;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export interface Percentiles {
  p50: number;
  p95: number;
  p99: number;
  /** mean */
  avg: number;
}

export interface TimeBucket {
  /** bucket start */
  t: string;
  count: number;
  errors: number;
  p95: number;
  /** mean duration (ms) */
  avg: number;
  /** requests with statusCode 400-499 (always 0 for jobs and error occurrences) */
  status4xx: number;
  /** requests with statusCode >= 500 (always 0 for jobs and error occurrences) */
  status5xx: number;
}

// GET /api/services
export interface ServiceSummary {
  serviceId: string;
  serviceVersion: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
}

// GET /api/overview  (filters: operationId scopes `requests` and `timeline`; queue + name scope `jobs` and `jobsTimeline`)
export interface Overview {
  requests: {
    count: number;
    errorRate: number;
    latency: Percentiles;
    status4xx: number;
    status5xx: number;
  };
  jobs: { count: number; failureRate: number; latency: Percentiles };
  errors: { groups: number; events: number };
  /** requests per bucket */
  timeline: TimeBucket[];
  /** job runs per bucket (errors = failed runs), same buckets as `timeline` */
  jobsTimeline: TimeBucket[];
}

// GET /api/requests/operations  (aggregated per operationId)
export interface OperationStats {
  operationId: string;
  protocol: Protocol | string;
  method: string | null;
  count: number;
  errorCount: number;
  errorRate: number;
  latency: Percentiles;
  lastSeenAt: string;
}

// GET /api/requests  (filters: operationId, status ('ok' | 'error'), minDuration, traceId) -> Page<RequestListItem>
export interface RequestListItem {
  id: string;
  traceId: string;
  serviceId: string;
  operationId: string;
  protocol: Protocol | string;
  method: string | null;
  statusCode: number | null;
  url: string | null;
  durationMs: number;
  calledAt: string;
  userId: string | null;
  hasError: boolean;
}

// GET /api/requests/:id
export interface RequestDetail extends RequestListItem {
  serviceVersion: string | null;
  tags: Record<string, Primitive>;
  error: WireError | null;
  request: Record<string, unknown> | null;
  trace: TraceSpan[];
}

// GET /api/jobs/queues  (aggregated per queue + job name)
export interface JobStats {
  queue: string;
  name: string;
  count: number;
  failedCount: number;
  failureRate: number;
  latency: Percentiles;
  avgWaitMs: number;
  lastSeenAt: string;
}

// GET /api/jobs  (filters: queue, name, status ('completed' | 'failed'), traceId) -> Page<JobListItem>
export interface JobListItem {
  id: string;
  jobId: string;
  traceId: string;
  serviceId: string;
  queue: string;
  name: string;
  status: 'completed' | 'failed' | null;
  durationMs: number;
  waitMs: number | null;
  attemptsMade: number | null;
  maxAttempts: number | null;
  calledAt: string;
}

// GET /api/jobs/:id
export interface JobDetail extends JobListItem {
  enqueuedAt: string | null;
  tags: Record<string, Primitive>;
  error: WireError | null;
  trace: TraceSpan[];
}

// GET /api/errors  (filters: source ('request' | 'job')) -> Page<ErrorGroup>
export interface ErrorGroup {
  id: string;
  fingerprint: string;
  /** Error groups are per service. */
  serviceId: string;
  errorClass: string | null;
  message: string;
  source: 'request' | 'job';
  /** operationId or `queue/name` where it happens most */
  culprit: string | null;
  count: number;
  firstSeenAt: string;
  lastSeenAt: string;
}

// GET /api/errors/:id
export interface ErrorGroupDetail extends ErrorGroup {
  stack: string | null;
  timeline: TimeBucket[];
  /** most recent occurrences, linking to request/job detail */
  occurrences: Array<{
    executionId: string;
    source: 'request' | 'job';
    traceId: string;
    serviceId: string;
    occurredAt: string;
  }>;
}

// GET /api/logs  (filters: level, traceId, context, q (substring)) -> Page<LogItem>
export interface LogItem {
  id: string;
  serviceId: string;
  timestamp: string;
  level: LogLevel | null;
  context: string | null;
  text: string;
  traceId: string | null;
  spanId: string | null;
  attributes: Record<string, unknown> | null;
}

// GET /api/traces/:traceId  (the execution(s) sharing a trace id, plus its logs)
export interface TraceDetail {
  traceId: string;
  requests: RequestDetail[];
  jobs: JobDetail[];
  logs: LogItem[];
}

/** A decoded span node returned by detail endpoints. */
export interface TraceSpan {
  spanId: string | null;
  name: string | null;
  origin: 'manual' | 'auto';
  className: string;
  methodName: string;
  durationMs: number | null;
  startOffsetMs: number | null;
  tags: Record<string, Primitive>;
  error: WireError | boolean | null;
  children: TraceSpan[];
}

// GET /api/metrics/runtime  (requires service) -> RuntimeSeriesPoint[]
export interface RuntimeSeriesPoint {
  t: string;
  cpuPercent: number | null;
  memoryRss: number | null;
  heapUsed: number | null;
  heapTotal: number | null;
  eventLoopLagMs: number | null;
  eventLoopUtilization: number | null;
  gcCount: number | null;
  gcDurationMs: number | null;
}

// GET /api/metrics/custom  (latest value per metric in the range) -> CustomMetricSummary[]
export interface CustomMetricSummary {
  name: string;
  type: 'counter' | 'gauge' | 'summary';
  description: string | null;
  lastValue: number | null;
  lastSeenAt: string;
}
