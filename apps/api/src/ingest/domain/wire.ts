/**
 * The batch format @nestjs/observe POSTs to `/applications/telemetry`.
 * Single-letter keys mirror the agent's encoders. See docs/protocol.md.
 */

export type Primitive = string | number | boolean;
export type Tags = Record<string, Primitive>;

export interface WireError {
  cls?: string;
  message: string;
  stack?: string;
  tags?: Tags;
}

export interface WireTraceNode {
  /** spanId */
  s?: string;
  /** name */
  n?: string;
  /** origin */
  o: 'manual' | 'auto';
  /** className */
  c: string;
  /** methodKey */
  m: string;
  /** duration in ms */
  d?: number;
  /** start offset from the operation start, in ms */
  so?: number;
  /** tags */
  t?: Tags;
  /** error, or `true` when details were not captured */
  e?: WireError | boolean;
  /** children */
  ch?: WireTraceNode[];
}

export type Protocol = 'http' | 'rpc' | 'grpc' | 'graphql' | 'ws';

export interface WireRequestSnapshot {
  /** calledAt (ISO) */
  ct?: string;
  /** traceId */
  ti: string;
  /** duration in ms */
  d?: number;
  /** protocol */
  p?: Protocol | (string & {});
  /** operationId */
  op: string;
  /** userId */
  u?: string;
  /** tags */
  tg?: Tags;
  /** error */
  e?: WireError;
  /** captured request (redacted headers / body) */
  rq?: Record<string, unknown>;
  /** attributes */
  a?: {
    /** method */
    m?: string;
    /** statusCode */
    sc?: number;
    /** originalUrl */
    ou?: string;
    /** defaultOperationId */
    dop?: string;
  };
  /** trace tree */
  t: WireTraceNode[];
}

export interface WireJobSnapshot {
  /** job id */
  i: string;
  /** traceId */
  ti: string;
  /** name */
  n?: string;
  /** queueName */
  q?: string;
  /** status */
  s?: 'completed' | 'failed';
  /** calledAt (ISO) */
  c?: string;
  /** duration in ms */
  d?: number;
  /** enqueuedAt (ISO) */
  ea?: string;
  /** waitDuration in ms */
  wd?: number;
  /** attemptsMade */
  am?: number;
  /** maxAttempts */
  ma?: number;
  tg?: Tags;
  e?: WireError;
  t: WireTraceNode[];
}

export interface WireGcCollections {
  count?: number;
  duration?: number;
}

export interface WireRuntimeMetrics {
  /** cpu: user, system, percentageUsed */
  c?: { u?: number; s?: number; p?: number };
  /** memory: rss, heapTotal, heapUsed, external, arrayBuffers, percentageUsed */
  m?: {
    r?: number;
    ht?: number;
    hu?: number;
    e?: number;
    ab?: number;
    p?: number;
  };
  /** gc: count, totalDuration, breakdown (minor, major, incremental) */
  g?: {
    c?: number;
    td?: number;
    b?: { m?: WireGcCollections; j?: WireGcCollections; i?: WireGcCollections };
  };
  /** event loop: lag, utilization */
  e?: { l?: number; u?: number };
}

export interface WireCustomMetric {
  n: string;
  t: 'counter' | 'gauge' | 'summary';
  v?: Record<string, number> | number;
  tg?: Tags;
  d?: string;
  l?: string[];
  lu?: number;
  k?: 'additive' | 'ratio' | 'peak';
  iv?: Record<string, number>;
  q50?: Record<string, number>;
  q95?: Record<string, number>;
  q99?: Record<string, number>;
  ct?: Record<string, number>;
  sm?: Record<string, number>;
  mx?: Record<string, number>;
}

export type LogLevel = 'fatal' | 'error' | 'warn' | 'log' | 'debug' | 'verbose';

export interface WireLogEntry {
  /** epoch ms */
  timestamp: number;
  text: string;
  traceId?: string;
  spanId?: string;
  level?: LogLevel;
  context?: string;
  attributes?: Record<string, unknown>;
}

export interface WireObjective {
  availability?: number;
  latency?: { underMs: number; target: number };
  windowDays?: 7 | 14 | 28 | 30;
  name?: string;
}

export interface WireObjectiveDeclaration {
  handler: string;
  operationId: string;
  method?: string;
  objectives: WireObjective[];
}

export interface WireTelemetryBatch {
  serviceId: string;
  serviceVersion?: string;
  truncatedSpans?: number;
  forwardLogs?: boolean;
  snapshots?: WireRequestSnapshot[];
  jobs?: WireJobSnapshot[];
  runtime?: WireRuntimeMetrics;
  custom?: WireCustomMetric[];
  logs?: WireLogEntry[];
  /** SLO declarations: accepted and ignored (not stored). */
  objectives?: WireObjectiveDeclaration[];
}

/** Optional 2xx reply body. A self-hosted collector answers `{ degraded: false }`. */
export interface WireIngestReply {
  degraded: boolean;
  trimmed?: boolean;
  paced?: boolean;
  errorsOnly?: boolean;
  reason?: 'spike' | 'budget';
}
