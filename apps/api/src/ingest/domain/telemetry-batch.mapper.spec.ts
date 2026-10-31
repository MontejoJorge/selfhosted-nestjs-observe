import { describe, expect, it } from 'vitest';
import {
  mapTelemetryBatch,
  scalarMetricValue,
  USER_ID_MAX_LENGTH,
  type AcceptanceWindow,
} from './telemetry-batch.mapper.js';
import { uuidV7Timestamp } from './uuid-v7.js';
import type {
  WireCustomMetric,
  WireJobSnapshot,
  WireLogEntry,
  WireRequestSnapshot,
  WireTelemetryBatch,
} from './wire.js';

const APP = '0192b8c2-1a2b-7c3d-8e4f-123456789abc';
const receivedAt = new Date('2026-10-30T12:00:00Z');
const window: AcceptanceWindow = {
  notBefore: new Date('2026-10-16T12:00:00Z'),
  notAfter: new Date('2026-10-31T12:00:00Z'),
};

const map = (batch: Partial<WireTelemetryBatch>) =>
  mapTelemetryBatch(
    APP,
    { serviceId: 'svc-1', ...batch } as WireTelemetryBatch,
    receivedAt,
    window,
  );

const snapshot = (
  overrides: Partial<WireRequestSnapshot> = {},
): WireRequestSnapshot => ({
  ct: '2026-10-30T11:59:00.000Z',
  ti: 'trace-1',
  op: 'GET /users',
  d: 12,
  a: { m: 'GET', sc: 200, ou: '/users?page=2' },
  t: [{ o: 'auto', c: 'UsersController', m: 'list', d: 10 }],
  ...overrides,
});

const jobSnapshot = (
  overrides: Partial<WireJobSnapshot> = {},
): WireJobSnapshot => ({
  i: 'job-1',
  ti: 'trace-2',
  q: 'mail',
  n: 'send',
  s: 'completed',
  c: '2026-10-30T11:58:00.000Z',
  d: 40,
  t: [],
  ...overrides,
});

describe('mapTelemetryBatch', () => {
  it('maps an empty batch to the service sighting only', () => {
    const record = map({});
    expect(record).toMatchObject({
      applicationId: APP,
      service: { serviceId: 'svc-1', serviceVersion: null, seenAt: receivedAt },
      version: null,
      requests: [],
      jobs: [],
      logs: [],
      customMetrics: [],
      errors: [],
      runtime: null,
      requestRollups: [],
      spanRollups: [],
    });
  });

  describe('requests', () => {
    it('maps the wire fields', () => {
      const [request] = map({
        snapshots: [snapshot({ u: 'user-7', tg: { tenant: 'acme' } })],
      }).requests;
      expect(request).toMatchObject({
        calledAt: new Date('2026-10-30T11:59:00.000Z'),
        serviceId: 'svc-1',
        traceId: 'trace-1',
        operationId: 'GET /users',
        protocol: 'http',
        method: 'GET',
        statusCode: 200,
        url: '/users?page=2',
        durationMs: 12,
        userId: 'user-7',
        hasError: false,
        error: null,
        tags: { tenant: 'acme' },
      });
      expect(uuidV7Timestamp(request.id)).toBe(request.calledAt.getTime());
    });

    it('skips snapshots without a trace id or operation id', () => {
      const { requests } = map({
        snapshots: [
          snapshot({ ti: '' }),
          snapshot({ op: undefined as unknown as string }),
          'junk' as unknown as WireRequestSnapshot,
          snapshot(),
        ],
      });
      expect(requests).toHaveLength(1);
    });

    it('defaults the time, protocol and duration', () => {
      const [request] = map({
        snapshots: [snapshot({ ct: 'garbage', p: undefined, d: undefined })],
      }).requests;
      expect(request.calledAt).toEqual(receivedAt);
      expect(request.protocol).toBe('http');
      expect(request.durationMs).toBe(0);
    });

    it('flags 5xx responses as errors even without an error object', () => {
      const requests = map({
        snapshots: [
          snapshot({ a: { sc: 503 } }),
          snapshot({ a: { sc: 404 } }),
          snapshot({ a: { sc: 201.9 } }),
        ],
      }).requests;
      expect(requests.map((r) => [r.statusCode, r.hasError])).toEqual([
        [503, true],
        [404, false],
        [201, false],
      ]);
    });

    it('truncates long user ids', () => {
      const [request] = map({
        snapshots: [snapshot({ u: 'x'.repeat(USER_ID_MAX_LENGTH + 50) })],
      }).requests;
      expect(request.userId).toHaveLength(USER_ID_MAX_LENGTH);
    });

    it('records an error occurrence culprit by operation', () => {
      const { requests, errors } = map({
        snapshots: [
          snapshot({
            e: {
              cls: 'NotFoundException',
              message: 'User 42 not found',
              stack: 'Error\n    at UsersService.find (/app/u.js:1:2)',
            },
          }),
        ],
      });
      expect(requests[0].hasError).toBe(true);
      expect(errors).toEqual([
        expect.objectContaining({
          source: 'request',
          serviceId: 'svc-1',
          errorClass: 'NotFoundException',
          message: 'User 42 not found',
          culprit: 'GET /users',
          executionId: requests[0].id,
          traceId: 'trace-1',
          occurredAt: requests[0].calledAt,
          durationMs: 12,
        }),
      ]);
      expect(errors[0].fingerprint).toMatch(/^[0-9a-f]{40}$/);
    });

    it('flattens traces into span rollups', () => {
      const { spanRollups } = map({ snapshots: [snapshot()] });
      expect(spanRollups).toEqual([
        expect.objectContaining({
          source: 'request',
          operation: 'GET /users',
          className: 'UsersController',
          methodName: 'list',
          count: 1,
          sumMs: 10,
        }),
      ]);
    });

    it('builds the request, user and presence rollups', () => {
      const record = map({
        snapshots: [snapshot({ u: 'u1' }), snapshot({ u: 'u1' })],
      });
      expect(record.requestRollups).toHaveLength(1);
      expect(record.requestRollups[0].count).toBe(2);
      expect(record.userRollups).toHaveLength(1);
      expect(record.userPresence).toHaveLength(1);
    });
  });

  describe('acceptance window', () => {
    it('drops events older than retention or too far in the future', () => {
      const { requests } = map({
        snapshots: [
          snapshot({ ct: '2026-10-01T00:00:00Z' }),
          snapshot({ ct: '2026-11-05T00:00:00Z' }),
          snapshot({ ct: window.notBefore.toISOString() }),
          snapshot({ ct: window.notAfter.toISOString() }),
        ],
      });
      expect(requests.map((r) => r.calledAt)).toEqual([
        window.notBefore,
        window.notAfter,
      ]);
    });

    it('applies to jobs, logs and custom metrics too', () => {
      const old = Date.parse('2026-10-01T00:00:00Z');
      const record = map({
        jobs: [jobSnapshot({ c: new Date(old).toISOString() })],
        logs: [{ timestamp: old, text: 'old' }],
        custom: [{ n: 'm', t: 'counter', v: 1, lu: old }],
      });
      expect(record.jobs).toEqual([]);
      expect(record.logs).toEqual([]);
      expect(record.customMetrics).toEqual([]);
    });

    // uuidV7 throws past 2^48 ms (year 10889): such an event is dropped, the batch is kept.
    it('drops a request dated beyond year 10889 instead of throwing', () => {
      const { requests } = map({
        snapshots: [snapshot({ ct: '+100000-01-01T00:00:00Z' }), snapshot()],
      });
      expect(requests).toHaveLength(1);
    });

    it('drops a job dated beyond year 10889 instead of throwing', () => {
      const { jobs } = map({
        jobs: [jobSnapshot({ c: '+100000-01-01T00:00:00Z' }), jobSnapshot()],
      });
      expect(jobs).toHaveLength(1);
    });

    it('drops a log with an absurd timestamp instead of throwing', () => {
      const { logs } = map({
        logs: [
          { timestamp: 1e15, text: 'far future' },
          { timestamp: receivedAt.getTime(), text: 'ok' },
        ],
      });
      expect(logs.map((l) => l.text)).toEqual(['ok']);
    });
  });

  describe('jobs', () => {
    it('maps the wire fields with defaults', () => {
      const [job] = map({
        jobs: [
          jobSnapshot({
            i: 77 as unknown as string,
            q: undefined,
            n: undefined,
            s: 'weird' as WireJobSnapshot['s'],
            wd: 15,
            am: 2.7,
            ma: 3,
          }),
        ],
      }).jobs;
      expect(job).toMatchObject({
        jobId: '77',
        queue: 'default',
        name: 'unknown',
        status: null,
        durationMs: 40,
        waitMs: 15,
        attemptsMade: 2,
        maxAttempts: 3,
        enqueuedAt: null,
        hasError: false,
      });
    });

    it('falls back to the run time for an unparseable enqueue time', () => {
      const [job] = map({ jobs: [jobSnapshot({ ea: 'nope' })] }).jobs;
      expect(job.enqueuedAt).toEqual(job.calledAt);
    });

    it('skips jobs without a trace id or job id', () => {
      const { jobs } = map({
        jobs: [jobSnapshot({ ti: '' }), jobSnapshot({ i: '' }), jobSnapshot()],
      });
      expect(jobs).toHaveLength(1);
    });

    it('treats failed runs as errors, culprit by queue/name', () => {
      const { jobs, errors, jobRollups } = map({
        jobs: [
          jobSnapshot({ s: 'failed' }),
          jobSnapshot({ e: { message: 'SMTP down' } }),
        ],
      });
      expect(jobs.map((j) => j.hasError)).toEqual([true, true]);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatchObject({
        source: 'job',
        culprit: 'mail/send',
        message: 'SMTP down',
        errorClass: null,
        stack: null,
      });
      expect(jobRollups[0]).toMatchObject({ count: 2, failed: 2 });
    });
  });

  describe('logs', () => {
    it('keeps known levels and drops malformed entries', () => {
      const t = receivedAt.getTime();
      const { logs } = map({
        logs: [
          { timestamp: t, text: 'hello', level: 'warn', context: 'Boot' },
          { timestamp: t, text: 'odd', level: 'loud' as WireLogEntry['level'] },
          { timestamp: t, text: 42 as unknown as string },
          { timestamp: 'now' as unknown as number, text: 'bad time' },
        ],
      });
      expect(logs.map((l) => [l.text, l.level, l.context])).toEqual([
        ['hello', 'warn', 'Boot'],
        ['odd', null, null],
      ]);
      expect(uuidV7Timestamp(logs[0].id)).toBe(t);
    });
  });

  describe('custom metrics', () => {
    it('maps samples and skips unnamed or unknown types', () => {
      const lu = Date.parse('2026-10-30T11:00:00Z');
      const { customMetrics } = map({
        custom: [
          { n: 'orders', t: 'counter', v: { a: 2, b: 3 }, lu, d: 'Orders' },
          { n: '', t: 'counter', v: 1 },
          { n: 'x', t: 'histogram' as WireCustomMetric['t'], v: 1 },
          { n: 'temp', t: 'gauge', v: 21.5 },
        ],
      });
      expect(customMetrics).toHaveLength(2);
      expect(customMetrics[0]).toMatchObject({
        name: 'orders',
        type: 'counter',
        value: 5,
        description: 'Orders',
        recordedAt: new Date(lu),
        data: { v: { a: 2, b: 3 }, lu, d: 'Orders' },
      });
      expect(customMetrics[0].data).not.toHaveProperty('n');
      expect(customMetrics[1].recordedAt).toEqual(receivedAt);
    });
  });

  describe('runtime', () => {
    it('maps the nested runtime sample', () => {
      const { runtime } = map({
        runtime: {
          c: { u: 1, s: 2, p: 37.5 },
          m: { r: 120, ht: 80, hu: 60, e: 4, ab: 1, p: 12 },
          g: { c: 3, td: 9, b: { m: { count: 2, duration: 4 } } },
          e: { l: 1.2, u: 0.3 },
        },
      });
      expect(runtime).toMatchObject({
        sampledAt: receivedAt,
        serviceId: 'svc-1',
        cpuPercent: 37.5,
        memoryRss: 120,
        heapUsed: 60,
        gcCount: 3,
        gcMinorCount: 2,
        gcMinorMs: 4,
        gcMajorCount: null,
        eventLoopLagMs: 1.2,
        eventLoopUtilization: 0.3,
      });
    });

    it('is null when the batch has none', () => {
      expect(map({ runtime: undefined }).runtime).toBeNull();
    });
  });

  describe('version sighting', () => {
    it('spans the calledAt of the accepted executions', () => {
      const { version } = map({
        serviceVersion: '1.4.0',
        snapshots: [
          snapshot({ ct: '2026-10-30T11:50:00Z' }),
          snapshot({ ct: '2026-10-01T00:00:00Z' }), // dropped, out of window
        ],
        jobs: [jobSnapshot({ c: '2026-10-30T11:55:00Z' })],
      });
      expect(version).toEqual({
        serviceId: 'svc-1',
        serviceVersion: '1.4.0',
        firstSeenAt: new Date('2026-10-30T11:50:00Z'),
        lastSeenAt: new Date('2026-10-30T11:55:00Z'),
      });
    });

    it('uses the receive time without executions', () => {
      const { version } = map({ serviceVersion: '1.4.0' });
      expect(version).toMatchObject({
        firstSeenAt: receivedAt,
        lastSeenAt: receivedAt,
      });
    });

    it('is null without a version (or with an empty one)', () => {
      expect(map({ serviceVersion: '' }).version).toBeNull();
    });
  });
});

describe('scalarMetricValue', () => {
  const metric = (m: Partial<WireCustomMetric>): WireCustomMetric => ({
    n: 'm',
    t: 'gauge',
    ...m,
  });

  it('sums additive values across label sets', () => {
    expect(scalarMetricValue(metric({ t: 'counter', v: { a: 1, b: 2 } }))).toBe(
      3,
    );
    expect(scalarMetricValue(metric({ v: 7 }))).toBe(7);
  });

  it('takes the max of peak gauges and the mean of ratio gauges', () => {
    expect(scalarMetricValue(metric({ k: 'peak', v: { a: 4, b: 9 } }))).toBe(9);
    expect(
      scalarMetricValue(metric({ k: 'ratio', v: { a: 0.2, b: 0.4 } })),
    ).toBe(0.30000000000000004);
  });

  it('gives the mean of summaries', () => {
    expect(
      scalarMetricValue(
        metric({ t: 'summary', ct: { a: 2, b: 2 }, sm: { a: 10, b: 30 } }),
      ),
    ).toBe(10);
    expect(
      scalarMetricValue(metric({ t: 'summary', ct: { a: 0 }, sm: { a: 5 } })),
    ).toBeNull();
  });

  it('ignores non-finite values and is null without any', () => {
    expect(
      scalarMetricValue(
        metric({ v: { a: 1, b: Number.NaN } as Record<string, number> }),
      ),
    ).toBe(1);
    expect(scalarMetricValue(metric({ v: Infinity }))).toBeNull();
    expect(scalarMetricValue(metric({}))).toBeNull();
  });
});
