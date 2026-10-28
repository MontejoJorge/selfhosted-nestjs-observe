/**
 * Query API consumed by the dashboard. All routes are under `/api`.
 * Timestamps are ISO strings, durations are milliseconds.
 *
 * Telemetry is scoped by project and application (see `ScopeQuery`): every telemetry route
 * requires `project` (id or slug) and accepts `application` (id) and `instance` (the agent's
 * serviceId). Projects, applications and API keys are managed under `/api/projects`.
 * Defaults: `range=1h` when neither `range` nor `from`/`to` is given; `limit=50` (max 500).
 * Lists are newest first (time desc, id desc). `cursor` is opaque: pass `nextCursor` back
 * with the same filters. `count` on error groups is all-time (within retention).
 */

import type { LogLevel, Primitive, Protocol, WireError } from './wire.js';

export type TimeRange = '1h' | '24h' | '7d';

export interface TimeRangeQuery {
  /** Relative window ending now. Ignored when `from`/`to` are given. */
  range?: TimeRange;
  from?: string;
  to?: string;
}

/** Scope of every telemetry query. */
export interface ScopeQuery {
  /** Project id or slug (required). */
  project: string;
  /** Application id; must belong to the project. Omit for the whole project. */
  application?: string;
  /** The agent's `serviceId` (an instance of an application). */
  instance?: string;
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

// GET /api/instances  (serviceIds that sent telemetry, per application)
export interface InstanceSummary {
  applicationId: string;
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
  jobs: {
    count: number;
    /** failed runs */
    failed: number;
    failureRate: number;
    latency: Percentiles;
  };
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
  applicationId: string;
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
  applicationId: string;
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

// GET /api/errors  (filters: source ('request' | 'job'), q (substring of message or class)) -> Page<ErrorGroup>
export interface ErrorGroup {
  id: string;
  fingerprint: string;
  /** Error groups are per application. */
  applicationId: string;
  /** serviceId of the most recent occurrence. */
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
    applicationId: string;
    serviceId: string;
    occurredAt: string;
  }>;
}

// GET /api/logs  (filters: level, traceId, context, q (substring)) -> Page<LogItem>
export interface LogItem {
  id: string;
  applicationId: string;
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

// GET /api/metrics/runtime  (application required; instance optional) -> RuntimeMetrics
/**
 * Runtime samples per bucket. Gauges (cpuPercent, memory, heap, event loop) are averaged;
 * per-interval deltas (CPU ms, GC counts and durations) are summed, also across instances
 * when no instance is selected. Memory values are megabytes.
 */
export interface RuntimeSeriesPoint {
  t: string;
  cpuPercent: number | null;
  /** CPU time in user mode during the bucket (ms) */
  cpuUserMs: number | null;
  /** CPU time in kernel mode during the bucket (ms) */
  cpuSystemMs: number | null;
  /** RSS (MB) */
  memoryRss: number | null;
  /** RSS as percent of OS memory */
  memoryPercent: number | null;
  heapUsed: number | null;
  heapTotal: number | null;
  eventLoopLagMs: number | null;
  eventLoopUtilization: number | null;
  gcCount: number | null;
  gcDurationMs: number | null;
  gcMinorCount: number | null;
  gcMinorMs: number | null;
  gcMajorCount: number | null;
  gcMajorMs: number | null;
  gcIncrementalCount: number | null;
  gcIncrementalMs: number | null;
}

/** KPI values of a set of runtime samples. Memory values are megabytes. */
export interface RuntimeSnapshot {
  cpuPercent: number | null;
  memoryPercent: number | null;
  memoryRss: number | null;
  heapUsed: number | null;
  eventLoopLagMs: number | null;
  eventLoopUtilization: number | null;
}

export interface RuntimeMetrics {
  /** averages over the range */
  avg: RuntimeSnapshot;
  /** newest sample in the range (of any instance in scope), null when there is none */
  latest: (RuntimeSnapshot & { sampledAt: string; serviceId: string }) | null;
  series: RuntimeSeriesPoint[];
}

// GET /api/metrics/runtime/instances  (application required) -> RuntimeInstance[]
/** An instance (serviceId) that reported runtime samples in the range, with its newest sample. */
export interface RuntimeInstance extends RuntimeSnapshot {
  serviceId: string;
  serviceVersion: string | null;
  lastSeenAt: string;
}

// ---------------------------------------------------------------------------
// Projects, applications and API keys (management API)
// ---------------------------------------------------------------------------

/** Requests per timeline bucket, for sparklines. */
export interface ActivityBucket {
  /** bucket start */
  t: string;
  count: number;
  errors: number;
  /** mean duration (ms), null when the bucket has no requests */
  avgDurationMs: number | null;
}

// GET /api/projects/:project
export interface Project {
  id: string;
  /** URL-safe, unique, generated from the name at creation and never changed. */
  slug: string;
  name: string;
  description: string | null;
  createdAt: string;
  applicationCount: number;
}

// GET /api/projects -> Page<ProjectSummary>  (sorted by name)
export interface ProjectSummary extends Project {
  /** most recent telemetry from any of its applications */
  lastSeenAt: string | null;
  /** requests in the range */
  requestCount: number;
  avgDurationMs: number | null;
  activity: ActivityBucket[];
}

// POST /api/projects
export interface CreateProjectInput {
  name: string;
  description?: string | null;
}

// PATCH /api/projects/:project
export interface UpdateProjectInput {
  name?: string;
  description?: string | null;
}

// GET /api/projects/:project/applications/:applicationId
export interface Application {
  id: string;
  projectId: string;
  name: string;
  /** at most 3 */
  tags: string[];
  createdAt: string;
  lastSeenAt: string | null;
}

// GET /api/projects/:project/applications -> Page<ApplicationSummary>  (sorted by name)
export interface ApplicationSummary extends Application {
  /** requests in the range */
  requestCount: number;
  requestsPerSecond: number;
  /** ratio 0..1 of failed requests in the range */
  errorRate: number;
  avgDurationMs: number | null;
  /** from the latest runtime sample in the range (any instance) */
  cpuPercent: number | null;
  memoryPercent: number | null;
  /** RSS in megabytes */
  memoryRssMb: number | null;
  activity: ActivityBucket[];
}

export interface CreateApplicationInput {
  name: string;
  tags?: string[];
}

export interface UpdateApplicationInput {
  name?: string;
  tags?: string[];
}

export type ApiKeyStatus = 'active' | 'expired' | 'revoked';

// GET /api/projects/:project/keys -> Page<ApiKey>  (newest first)
export interface ApiKey {
  id: string;
  name: string;
  /** Public key id, sent by the agent as `x-api-key` (`appKey`). */
  keyId: string;
  applicationId: string;
  applicationName: string;
  status: ApiKeyStatus;
  lastUsedAt: string | null;
  /** null means no expiry */
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

// POST /api/projects/:project/keys
export interface CreateApiKeyInput {
  name: string;
  applicationId: string;
  expiresAt?: string | null;
}

/** Returned only by create: the secret is never shown again. */
export interface CreatedApiKey extends ApiKey {
  /** Sent by the agent as `x-api-secret` (`appSecret`). */
  secret: string;
}
