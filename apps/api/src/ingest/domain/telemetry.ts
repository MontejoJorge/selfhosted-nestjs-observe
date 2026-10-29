import type {
  JobRollup,
  RequestRollup,
  SpanRollup,
  UserPresence,
  UserRollup,
} from './rollups.js';
import type { LogLevel, Tags, WireError, WireTraceNode } from './wire.js';

/**
 * Domain records produced from one telemetry batch. They are storage-agnostic:
 * the persistence adapter maps them to rows.
 */

export type ExecutionSource = 'request' | 'job';

export interface ServiceSighting {
  serviceId: string;
  serviceVersion: string | null;
  seenAt: Date;
}

export interface RequestExecution {
  id: string;
  calledAt: Date;
  serviceId: string;
  serviceVersion: string | null;
  traceId: string;
  operationId: string;
  protocol: string;
  method: string | null;
  statusCode: number | null;
  url: string | null;
  durationMs: number;
  userId: string | null;
  hasError: boolean;
  error: WireError | null;
  tags: Tags | null;
  request: Record<string, unknown> | null;
  trace: WireTraceNode[];
}

export interface JobExecution {
  id: string;
  calledAt: Date;
  serviceId: string;
  serviceVersion: string | null;
  jobId: string;
  traceId: string;
  queue: string;
  name: string;
  status: 'completed' | 'failed' | null;
  durationMs: number;
  waitMs: number | null;
  attemptsMade: number | null;
  maxAttempts: number | null;
  enqueuedAt: Date | null;
  hasError: boolean;
  error: WireError | null;
  tags: Tags | null;
  trace: WireTraceNode[];
}

/** One node of an execution's span tree, flattened in depth-first order. */
export interface SpanRecord {
  executionId: string;
  calledAt: Date;
  source: ExecutionSource;
  serviceId: string;
  traceId: string;
  /** operationId for requests, `queue/name` for jobs */
  operation: string;
  /** depth-first index within the execution, starting at 0 */
  position: number;
  parentPosition: number | null;
  depth: number;
  spanId: string | null;
  parentSpanId: string | null;
  name: string | null;
  origin: string;
  className: string;
  methodName: string;
  durationMs: number | null;
  /** duration minus the direct children's durations, at least 0; null without a duration */
  selfMs: number | null;
  startOffsetMs: number | null;
  hasError: boolean;
  tags: Tags | null;
  error: WireError | boolean | null;
}

export interface ErrorOccurrence {
  fingerprint: string;
  source: ExecutionSource;
  serviceId: string;
  errorClass: string | null;
  message: string;
  stack: string | null;
  /** operationId for requests, `queue/name` for jobs */
  culprit: string;
  executionId: string;
  traceId: string;
  occurredAt: Date;
  durationMs: number;
}

export interface LogRecord {
  id: string;
  timestamp: Date;
  serviceId: string;
  level: LogLevel | null;
  context: string | null;
  text: string;
  traceId: string | null;
  spanId: string | null;
  attributes: Record<string, unknown> | null;
}

export interface RuntimeSample {
  sampledAt: Date;
  serviceId: string;
  cpuUser: number | null;
  cpuSystem: number | null;
  cpuPercent: number | null;
  memoryRss: number | null;
  heapTotal: number | null;
  heapUsed: number | null;
  memoryExternal: number | null;
  arrayBuffers: number | null;
  memoryPercent: number | null;
  gcCount: number | null;
  gcDurationMs: number | null;
  gcMinorCount: number | null;
  gcMinorMs: number | null;
  gcMajorCount: number | null;
  gcMajorMs: number | null;
  gcIncrementalCount: number | null;
  gcIncrementalMs: number | null;
  eventLoopLagMs: number | null;
  eventLoopUtilization: number | null;
}

export interface CustomMetricSample {
  recordedAt: Date;
  serviceId: string;
  name: string;
  type: 'counter' | 'gauge' | 'summary';
  kind: string | null;
  description: string | null;
  /** scalar used by the dashboard, derived from the possibly per-label value */
  value: number | null;
  /** the wire metric, minus name/type */
  data: Record<string, unknown>;
}

export interface TelemetryBatchRecord {
  /** Application the batch was authenticated for; stamped on every stored row. */
  applicationId: string;
  service: ServiceSighting;
  requests: RequestExecution[];
  jobs: JobExecution[];
  /** `requests` and `jobs` summed per minute, ordered by key */
  requestRollups: RequestRollup[];
  jobRollups: JobRollup[];
  /** requests summed per hour and user (anonymous ones under `''`), ordered by key */
  userRollups: UserRollup[];
  /** identified users per 15-minute bucket, ordered by key */
  userPresence: UserPresence[];
  /** spans summed per 5 minutes, instance, operation and class method, ordered by key */
  spanRollups: SpanRollup[];
  spans: SpanRecord[];
  errors: ErrorOccurrence[];
  logs: LogRecord[];
  runtime: RuntimeSample | null;
  customMetrics: CustomMetricSample[];
}

export interface ProfileUpload {
  applicationId: string;
  receivedAt: Date;
  serviceNode: string | null;
  sampleRateHz: number | null;
  windows: unknown[];
}
