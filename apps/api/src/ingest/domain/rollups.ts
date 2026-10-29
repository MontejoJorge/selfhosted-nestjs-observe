import { record } from './latency-histogram.js';
import type {
  ExecutionSource,
  JobExecution,
  RequestExecution,
  SpanRecord,
} from './telemetry.js';

const MINUTE_MS = 60_000;
export const SPAN_BUCKET_MS = 5 * MINUTE_MS;
export const USER_BUCKET_MS = 60 * MINUTE_MS;
export const PRESENCE_BUCKET_MS = 15 * MINUTE_MS;

/** `UserRollup.userId` of the requests without a user id. */
export const ANONYMOUS_USER = '';

function floorTo(date: Date, stepMs: number): Date {
  return new Date(Math.floor(date.getTime() / stepMs) * stepMs);
}

/** Start of the UTC minute containing `date`. */
export function minuteOf(date: Date): Date {
  return floorTo(date, MINUTE_MS);
}

interface LatencyRollup {
  count: number;
  sumMs: number;
  minMs: number;
  maxMs: number;
  histogram: number[];
  lastCalledAt: Date;
}

/** Requests of one operation on one instance during one minute. */
export interface RequestRollup extends LatencyRollup {
  minute: Date;
  serviceId: string;
  operationId: string;
  protocol: string;
  method: string | null;
  errors: number;
  status4xx: number;
  status5xx: number;
}

/** Runs of one job on one instance during one minute. */
export interface JobRollup extends LatencyRollup {
  minute: Date;
  serviceId: string;
  queue: string;
  name: string;
  failed: number;
  waitSumMs: number;
  /** runs that reported a wait time */
  waitCount: number;
}

/** Requests of one user during one UTC hour; `ANONYMOUS_USER` for the requests without one. */
export interface UserRollup extends LatencyRollup {
  hour: Date;
  userId: string;
  errors: number;
  status4xx: number;
  status5xx: number;
  firstCalledAt: Date;
}

/**
 * Spans of one class method (or outbound call), in executions of one operation on one
 * instance, during one 5-minute bucket. Keeps a reference to the slowest span.
 */
export interface SpanRollup extends LatencyRollup {
  bucket: Date;
  serviceId: string;
  source: ExecutionSource;
  /** operationId for requests, `queue/name` for jobs */
  operation: string;
  origin: string;
  className: string;
  methodName: string;
  errors: number;
  selfSumMs: number;
  /** the span with the longest duration (`maxMs`) */
  slowest: {
    executionId: string;
    traceId: string;
    calledAt: Date;
    selfMs: number;
  };
}

function newLatency(calledAt: Date): LatencyRollup {
  return {
    count: 0,
    sumMs: 0,
    minMs: Infinity,
    maxMs: -Infinity,
    histogram: [],
    lastCalledAt: calledAt,
  };
}

function addLatency(
  rollup: LatencyRollup,
  durationMs: number,
  calledAt: Date,
): void {
  rollup.count++;
  rollup.sumMs += durationMs;
  rollup.minMs = Math.min(rollup.minMs, durationMs);
  rollup.maxMs = Math.max(rollup.maxMs, durationMs);
  record(rollup.histogram, durationMs);
  if (calledAt > rollup.lastCalledAt) rollup.lastCalledAt = calledAt;
}

/** Map values ordered by key, so concurrent batches upsert rows in the same order. */
function sortedValues<T>(byKey: Map<string, T>): T[] {
  return [...byKey.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([, value]) => value);
}

export function rollUpRequests(requests: RequestExecution[]): RequestRollup[] {
  const byKey = new Map<string, RequestRollup>();
  for (const r of requests) {
    const minute = minuteOf(r.calledAt);
    const key = JSON.stringify([
      minute.getTime(),
      r.serviceId,
      r.operationId,
      r.protocol,
      r.method,
    ]);
    let rollup = byKey.get(key);
    if (!rollup) {
      rollup = {
        ...newLatency(r.calledAt),
        minute,
        serviceId: r.serviceId,
        operationId: r.operationId,
        protocol: r.protocol,
        method: r.method,
        errors: 0,
        status4xx: 0,
        status5xx: 0,
      };
      byKey.set(key, rollup);
    }
    addLatency(rollup, r.durationMs, r.calledAt);
    if (r.hasError) rollup.errors++;
    const status = r.statusCode ?? 0;
    if (status >= 400 && status <= 499) rollup.status4xx++;
    else if (status >= 500) rollup.status5xx++;
  }
  return sortedValues(byKey);
}

export function rollUpJobs(jobs: JobExecution[]): JobRollup[] {
  const byKey = new Map<string, JobRollup>();
  for (const j of jobs) {
    const minute = minuteOf(j.calledAt);
    const key = JSON.stringify([
      minute.getTime(),
      j.serviceId,
      j.queue,
      j.name,
    ]);
    let rollup = byKey.get(key);
    if (!rollup) {
      rollup = {
        ...newLatency(j.calledAt),
        minute,
        serviceId: j.serviceId,
        queue: j.queue,
        name: j.name,
        failed: 0,
        waitSumMs: 0,
        waitCount: 0,
      };
      byKey.set(key, rollup);
    }
    addLatency(rollup, j.durationMs, j.calledAt);
    if (j.hasError) rollup.failed++;
    if (j.waitMs !== null) {
      rollup.waitSumMs += j.waitMs;
      rollup.waitCount++;
    }
  }
  return sortedValues(byKey);
}

export function rollUpUsers(requests: RequestExecution[]): UserRollup[] {
  const byKey = new Map<string, UserRollup>();
  for (const r of requests) {
    const userId = r.userId ?? ANONYMOUS_USER;
    const hour = floorTo(r.calledAt, USER_BUCKET_MS);
    const key = JSON.stringify([hour.getTime(), userId]);
    let rollup = byKey.get(key);
    if (!rollup) {
      rollup = {
        ...newLatency(r.calledAt),
        hour,
        userId,
        errors: 0,
        status4xx: 0,
        status5xx: 0,
        firstCalledAt: r.calledAt,
      };
      byKey.set(key, rollup);
    }
    addLatency(rollup, r.durationMs, r.calledAt);
    if (r.calledAt < rollup.firstCalledAt) rollup.firstCalledAt = r.calledAt;
    if (r.hasError) rollup.errors++;
    const status = r.statusCode ?? 0;
    if (status >= 400 && status <= 499) rollup.status4xx++;
    else if (status >= 500) rollup.status5xx++;
  }
  return sortedValues(byKey);
}

/** Identified users active in a 15-minute bucket. */
export interface UserPresence {
  bucket: Date;
  userId: string;
}

export function userPresence(requests: RequestExecution[]): UserPresence[] {
  const byKey = new Map<string, UserPresence>();
  for (const r of requests) {
    if (r.userId === null) continue;
    const bucket = floorTo(r.calledAt, PRESENCE_BUCKET_MS);
    byKey.set(JSON.stringify([bucket.getTime(), r.userId]), {
      bucket,
      userId: r.userId,
    });
  }
  return sortedValues(byKey);
}

/** Spans without a duration carry no timing and are left out. */
export function rollUpSpans(spans: SpanRecord[]): SpanRollup[] {
  const byKey = new Map<string, SpanRollup>();
  for (const s of spans) {
    if (s.durationMs === null) continue;
    const selfMs = s.selfMs ?? s.durationMs;
    const bucket = floorTo(s.calledAt, SPAN_BUCKET_MS);
    const key = JSON.stringify([
      bucket.getTime(),
      s.serviceId,
      s.source,
      s.operation,
      s.origin,
      s.className,
      s.methodName,
    ]);
    let rollup = byKey.get(key);
    if (!rollup) {
      rollup = {
        ...newLatency(s.calledAt),
        bucket,
        serviceId: s.serviceId,
        source: s.source,
        operation: s.operation,
        origin: s.origin,
        className: s.className,
        methodName: s.methodName,
        errors: 0,
        selfSumMs: 0,
        slowest: {
          executionId: s.executionId,
          traceId: s.traceId,
          calledAt: s.calledAt,
          selfMs,
        },
      };
      byKey.set(key, rollup);
    }
    if (s.durationMs > rollup.maxMs)
      rollup.slowest = {
        executionId: s.executionId,
        traceId: s.traceId,
        calledAt: s.calledAt,
        selfMs,
      };
    addLatency(rollup, s.durationMs, s.calledAt);
    rollup.selfSumMs += selfMs;
    if (s.hasError) rollup.errors++;
  }
  return sortedValues(byKey);
}
