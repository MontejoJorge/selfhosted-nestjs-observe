import { record } from './latency-histogram.js';
import type { JobExecution, RequestExecution } from './telemetry.js';

const MINUTE_MS = 60_000;

/** Start of the UTC minute containing `date`. */
export function minuteOf(date: Date): Date {
  return new Date(Math.floor(date.getTime() / MINUTE_MS) * MINUTE_MS);
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
