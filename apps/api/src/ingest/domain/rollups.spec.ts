import { describe, expect, it } from 'vitest';
import {
  ANONYMOUS_USER,
  minuteOf,
  rollUpJobs,
  rollUpRequests,
  rollUpSpans,
  rollUpUsers,
  userPresence,
} from './rollups.js';
import type {
  JobExecution,
  RequestExecution,
  SpanRecord,
} from './telemetry.js';

const at = (iso: string) => new Date(`2026-10-30T${iso}Z`);

function request(overrides: Partial<RequestExecution>): RequestExecution {
  return {
    id: 'id',
    calledAt: at('12:00:00'),
    serviceId: 'svc',
    serviceVersion: null,
    traceId: 't',
    operationId: 'GET /users',
    protocol: 'http',
    method: 'GET',
    statusCode: 200,
    url: null,
    durationMs: 10,
    userId: null,
    hasError: false,
    error: null,
    tags: null,
    request: null,
    trace: [],
    ...overrides,
  };
}

function job(overrides: Partial<JobExecution>): JobExecution {
  return {
    id: 'id',
    calledAt: at('12:00:00'),
    serviceId: 'svc',
    serviceVersion: null,
    jobId: '1',
    traceId: 't',
    queue: 'mail',
    name: 'send',
    status: 'completed',
    durationMs: 10,
    waitMs: null,
    attemptsMade: null,
    maxAttempts: null,
    enqueuedAt: null,
    hasError: false,
    error: null,
    tags: null,
    trace: [],
    ...overrides,
  };
}

function span(overrides: Partial<SpanRecord>): SpanRecord {
  return {
    executionId: 'e1',
    calledAt: at('12:00:00'),
    source: 'request',
    serviceId: 'svc',
    traceId: 't1',
    operation: 'GET /users',
    position: 0,
    parentPosition: null,
    depth: 0,
    spanId: null,
    parentSpanId: null,
    name: null,
    origin: 'auto',
    className: 'UsersService',
    methodName: 'find',
    durationMs: 10,
    selfMs: 10,
    startOffsetMs: null,
    hasError: false,
    tags: null,
    error: null,
    ...overrides,
  };
}

describe('minuteOf', () => {
  it('floors to the UTC minute', () => {
    expect(minuteOf(at('12:34:56.789')).toISOString()).toBe(
      '2026-10-30T12:34:00.000Z',
    );
  });
});

describe('rollUpRequests', () => {
  it('groups by minute, instance, operation, protocol and method', () => {
    const rollups = rollUpRequests([
      request({ calledAt: at('12:00:05'), durationMs: 10 }),
      request({ calledAt: at('12:00:55'), durationMs: 30 }),
      request({ calledAt: at('12:01:00') }),
      request({ method: 'POST' }),
      request({ serviceId: 'other' }),
      request({ operationId: 'GET /items' }),
    ]);
    expect(rollups).toHaveLength(5);
    const first = rollups.find(
      (r) =>
        r.minute.getTime() === at('12:00:00').getTime() &&
        r.method === 'GET' &&
        r.serviceId === 'svc' &&
        r.operationId === 'GET /users',
    );
    expect(first).toMatchObject({
      count: 2,
      sumMs: 40,
      minMs: 10,
      maxMs: 30,
      lastCalledAt: at('12:00:55'),
    });
    expect(first!.histogram.reduce((a, b) => a + b, 0)).toBe(2);
  });

  it('counts errors and 4xx/5xx statuses', () => {
    const [rollup] = rollUpRequests([
      request({ statusCode: 200 }),
      request({ statusCode: 404 }),
      request({ statusCode: 499 }),
      request({ statusCode: 503, hasError: true }),
      request({ statusCode: null, hasError: true }),
    ]);
    expect(rollup).toMatchObject({
      count: 5,
      errors: 2,
      status4xx: 2,
      status5xx: 1,
    });
  });

  it('returns rows in a stable key order whatever the input order', () => {
    const input = [
      request({ operationId: 'b' }),
      request({ operationId: 'a' }),
      request({ calledAt: at('11:59:00'), operationId: 'c' }),
    ];
    const keys = (rows: ReturnType<typeof rollUpRequests>) =>
      rows.map((r) => `${r.minute.toISOString()} ${r.operationId}`);
    expect(keys(rollUpRequests(input))).toEqual(
      keys(rollUpRequests(input.toReversed())),
    );
  });
});

describe('rollUpJobs', () => {
  it('counts failures and wait times of the runs that reported one', () => {
    const [rollup] = rollUpJobs([
      job({ waitMs: 100 }),
      job({ waitMs: 50, hasError: true, status: 'failed' }),
      job({ waitMs: null }),
    ]);
    expect(rollup).toMatchObject({
      count: 3,
      failed: 1,
      waitSumMs: 150,
      waitCount: 2,
    });
  });

  it('splits by queue and name', () => {
    expect(
      rollUpJobs([job({}), job({ name: 'other' }), job({ queue: 'q2' })]),
    ).toHaveLength(3);
  });
});

describe('rollUpUsers', () => {
  it('groups by UTC hour and user, with anonymous requests under ""', () => {
    const rollups = rollUpUsers([
      request({ userId: 'u1', calledAt: at('12:10:00') }),
      request({ userId: 'u1', calledAt: at('12:50:00'), statusCode: 500 }),
      request({ userId: 'u1', calledAt: at('13:00:00') }),
      request({ userId: null }),
    ]);
    expect(rollups.map((r) => [r.hour.toISOString(), r.userId])).toEqual([
      ['2026-10-30T12:00:00.000Z', ANONYMOUS_USER],
      ['2026-10-30T12:00:00.000Z', 'u1'],
      ['2026-10-30T13:00:00.000Z', 'u1'],
    ]);
    expect(rollups[1]).toMatchObject({
      count: 2,
      status5xx: 1,
      firstCalledAt: at('12:10:00'),
      lastCalledAt: at('12:50:00'),
    });
  });

  it('tracks the first call regardless of input order', () => {
    const [rollup] = rollUpUsers([
      request({ userId: 'u', calledAt: at('12:30:00') }),
      request({ userId: 'u', calledAt: at('12:05:00') }),
    ]);
    expect(rollup.firstCalledAt).toEqual(at('12:05:00'));
    expect(rollup.lastCalledAt).toEqual(at('12:30:00'));
  });
});

describe('userPresence', () => {
  it('keeps one row per identified user and 15-minute bucket', () => {
    const presence = userPresence([
      request({ userId: 'u1', calledAt: at('12:01:00') }),
      request({ userId: 'u1', calledAt: at('12:14:59') }),
      request({ userId: 'u1', calledAt: at('12:15:00') }),
      request({ userId: null }),
    ]);
    expect(presence.map((p) => [p.bucket.toISOString(), p.userId])).toEqual([
      ['2026-10-30T12:00:00.000Z', 'u1'],
      ['2026-10-30T12:15:00.000Z', 'u1'],
    ]);
  });
});

describe('rollUpSpans', () => {
  it('leaves out spans without a duration', () => {
    expect(rollUpSpans([span({ durationMs: null, selfMs: null })])).toEqual([]);
  });

  it('groups by 5-minute bucket and keeps the slowest span', () => {
    const rollups = rollUpSpans([
      span({ executionId: 'e1', durationMs: 10, selfMs: 4 }),
      span({
        executionId: 'e2',
        traceId: 't2',
        calledAt: at('12:04:59'),
        durationMs: 50,
        selfMs: 20,
        hasError: true,
      }),
      span({ executionId: 'e3', durationMs: 30, selfMs: 30 }),
      span({ calledAt: at('12:05:00') }),
    ]);
    expect(rollups).toHaveLength(2);
    expect(rollups[0]).toMatchObject({
      bucket: at('12:00:00'),
      count: 3,
      sumMs: 90,
      selfSumMs: 54,
      maxMs: 50,
      errors: 1,
      slowest: {
        executionId: 'e2',
        traceId: 't2',
        calledAt: at('12:04:59'),
        selfMs: 20,
      },
    });
  });

  it('uses the duration as self time when it is unknown', () => {
    const [rollup] = rollUpSpans([span({ durationMs: 12, selfMs: null })]);
    expect(rollup.selfSumMs).toBe(12);
    expect(rollup.slowest.selfMs).toBe(12);
  });
});
