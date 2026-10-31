/** Read-only telemetry endpoints: overview, requests, jobs, errors, logs, traces, users, services, metrics. */

import type {
  ErrorGroupDetailDto,
  ErrorGroupDto,
  InstanceSummaryDto,
  JobDetailDto,
  JobListItemDto,
  JobStatsDto,
  LogItemDto,
  OperationStatsDto,
  OverviewDto,
  RequestDetailDto,
  RequestListItemDto,
  RuntimeInstanceDto,
  RuntimeMetricsDto,
  RuntimeSeriesPointDto,
  ServiceDto,
  ServicesDto,
  SlowSpanDto,
  TraceDetailDto,
  UserDetailDto,
  UsersDto,
} from '@/lib/api/generated/api';
import { HttpResponse, http } from 'msw';
import {
  ApiError,
  bucketMs,
  bucketize,
  errorResponse,
  iso,
  page,
  percentiles,
  scopeApps,
  timeBucket,
  windowOf,
  within,
  type Window,
} from '../query';
import {
  appDef,
  catchUp,
  dataStart,
  errorById,
  errorByKey,
  errorGroupIds,
  jobs,
  logs,
  occurrences,
  requests,
  runtimeSample,
  spanTimes,
  spansOf,
  wireError,
  type JobEvent,
  type LogEvent,
  type OccurrenceEvent,
  type RequestEvent,
  type RuntimeSample,
} from '../store';
import { APPLICATIONS, ERRORS, TIME, type SpanTemplate } from '../world';

type Params = URLSearchParams;

/** Wraps a handler: parses the query string and turns ApiError into an HTTP error. */
function get<T>(
  path: string,
  handle: (params: Params, pathParams: Record<string, string>) => T,
) {
  return http.get(`*/api/${path}`, ({ request, params }) => {
    try {
      return HttpResponse.json(
        handle(
          new URL(request.url).searchParams,
          params as Record<string, string>,
        ) as never,
      );
    } catch (error) {
      return errorResponse(error);
    }
  });
}

const reqExec = (r: RequestEvent) => ({
  durationMs: r.durationMs,
  failed: r.hasError,
  statusCode: r.statusCode,
});
const jobExec = (j: JobEvent) => ({
  durationMs: j.durationMs,
  failed: j.failed,
});
const jobKey = (j: { queue: string; name: string }) => `${j.queue}/${j.name}`;

function scopedRequests(params: Params, window: Window): RequestEvent[] {
  const apps = scopeApps(params);
  const instance = params.get('instance');
  return within(requests, window).filter(
    (r) => apps.has(r.appId) && (!instance || r.serviceId === instance),
  );
}

function scopedJobs(params: Params, window: Window): JobEvent[] {
  const apps = scopeApps(params);
  const instance = params.get('instance');
  return within(jobs, window).filter(
    (j) => apps.has(j.appId) && (!instance || j.serviceId === instance),
  );
}

function scopedOccurrences(params: Params, window: Window): OccurrenceEvent[] {
  const apps = scopeApps(params);
  const instance = params.get('instance');
  return within(occurrences, window).filter(
    (o) => apps.has(o.appId) && (!instance || o.serviceId === instance),
  );
}

const newestFirst = <T>(items: T[]) => items.slice().reverse();

function requestItem(r: RequestEvent): RequestListItemDto {
  return {
    id: r.id,
    applicationId: r.appId,
    calledAt: iso(r.t),
    durationMs: r.durationMs,
    hasError: r.hasError,
    method: r.op.method,
    operationId: r.op.operationId,
    protocol: 'http',
    serviceId: r.serviceId,
    statusCode: r.statusCode,
    traceId: r.traceId,
    url: r.url,
    userId: r.userId,
  };
}

function requestDetail(r: RequestEvent): RequestDetailDto {
  const error = wireError(r.errorKey);
  const [path, query] = r.url.split('?');
  return {
    ...requestItem(r),
    error,
    serviceVersion: r.version,
    tags: { region: 'eu-west-1' },
    trace: spansOf(r.op.spans, r.durationMs, r.seed, error),
    request: {
      method: r.op.method,
      path,
      query: Object.fromEntries(new URLSearchParams(query ?? '')),
      headers: {
        host: `${appDef(r.appId)?.name ?? 'app'}.internal`,
        'user-agent': 'k6/0.52.0 (https://k6.io/)',
        accept: 'application/json',
        authorization: '[REDACTED]',
        ...(r.userId ? { 'x-user-id': r.userId } : {}),
      },
      ...(r.op.method === 'POST'
        ? { body: { quantity: 1 + (r.seed % 4) } }
        : {}),
    },
  };
}

function jobItem(j: JobEvent): JobListItemDto {
  return {
    id: j.id,
    applicationId: j.appId,
    attemptsMade: j.attemptsMade,
    calledAt: iso(j.t),
    durationMs: j.durationMs,
    jobId: j.jobId,
    maxAttempts: j.job.maxAttempts,
    name: j.job.name,
    queue: j.job.queue,
    serviceId: j.serviceId,
    status: j.failed ? 'failed' : 'completed',
    traceId: j.traceId,
    waitMs: j.waitMs,
  };
}

function jobDetail(j: JobEvent): JobDetailDto {
  const error = wireError(j.errorKey);
  return {
    ...jobItem(j),
    enqueuedAt: j.waitMs === null ? null : iso(j.t - j.waitMs),
    error,
    serviceVersion: j.version,
    tags:
      j.job.everyMinuteAt === null
        ? { attempt: j.attemptsMade ?? 1 }
        : { schedule: '* * * * *' },
    trace: spansOf(j.job.spans, j.durationMs, j.seed, error),
  };
}

function logItem(l: LogEvent): LogItemDto {
  return {
    id: l.id,
    applicationId: l.appId,
    attributes: l.attributes,
    context: l.context,
    level: l.level,
    serviceId: l.serviceId,
    spanId: l.spanId,
    text: l.text,
    timestamp: iso(l.t),
    traceId: l.traceId,
  };
}

function errorGroup(key: string, apps: Set<string>): ErrorGroupDto | null {
  const def = errorByKey.get(key)!;
  if (!apps.has(def.appId)) return null;
  const all = occurrences.filter((o) => o.key === key);
  if (all.length === 0) return null;
  const last = all[all.length - 1]!;
  return {
    id: errorGroupIds.get(key)!,
    applicationId: def.appId,
    count: all.length,
    culprit: def.culprit,
    errorClass: def.errorClass,
    fingerprint: def.fingerprint,
    firstSeenAt: iso(all[0]!.t),
    lastSeenAt: iso(last.t),
    message: def.message,
    serviceId: last.serviceId,
    source: def.source,
  };
}

/** Bucketed runtime samples averaged over the instances (null before the data starts). */
function runtimeSeries(
  appId: string,
  instance: string | null,
  window: Window,
): RuntimeSeriesPointDto[] {
  const app = appDef(appId);
  const step = bucketMs(window);
  return bucketize(window, [], step).map(({ t }) => {
    const samples = runtimeSamples(appId, instance, t + step / 2);
    const minutes = step / TIME.MINUTE;
    if (!app || samples.length === 0 || t + step <= dataStart)
      return emptyPoint(t);
    const avg = (pick: (s: RuntimeSample) => number) =>
      round(samples.reduce((sum, s) => sum + pick(s), 0) / samples.length);
    const sum = (pick: (s: RuntimeSample) => number) =>
      round(samples.reduce((total, s) => total + pick(s), 0) * minutes);
    const cpuMs = (avg((s) => s.cpuPercent) / 100) * step;
    return {
      t: iso(t),
      cpuPercent: avg((s) => s.cpuPercent),
      cpuUserMs: round(cpuMs * 0.72),
      cpuSystemMs: round(cpuMs * 0.28),
      memoryRss: avg((s) => s.memoryRss),
      memoryPercent: avg((s) => s.memoryPercent),
      heapUsed: avg((s) => s.heapUsed),
      heapTotal: avg((s) => s.heapTotal),
      eventLoopLagMs: avg((s) => s.eventLoopLagMs),
      eventLoopUtilization:
        Math.round(avg((s) => s.eventLoopUtilization * 1000)) / 1000,
      gcCount: sum((s) => s.gcMinor + s.gcMajor + s.gcIncremental),
      gcDurationMs: sum(
        (s) => s.gcMinor * 1.4 + s.gcMajor * 18 + s.gcIncremental * 3,
      ),
      gcMinorCount: sum((s) => s.gcMinor),
      gcMinorMs: sum((s) => s.gcMinor * 1.4),
      gcMajorCount: sum((s) => s.gcMajor),
      gcMajorMs: sum((s) => s.gcMajor * 18),
      gcIncrementalCount: sum((s) => s.gcIncremental),
      gcIncrementalMs: sum((s) => s.gcIncremental * 3),
    };
  });
}

function emptyPoint(t: number): RuntimeSeriesPointDto {
  return {
    t: iso(t),
    cpuPercent: null,
    cpuUserMs: null,
    cpuSystemMs: null,
    memoryRss: null,
    memoryPercent: null,
    heapUsed: null,
    heapTotal: null,
    eventLoopLagMs: null,
    eventLoopUtilization: null,
    gcCount: null,
    gcDurationMs: null,
    gcMinorCount: null,
    gcMinorMs: null,
    gcMajorCount: null,
    gcMajorMs: null,
    gcIncrementalCount: null,
    gcIncrementalMs: null,
  };
}

function runtimeSamples(
  appId: string,
  instance: string | null,
  t: number,
): RuntimeSample[] {
  const app = appDef(appId);
  if (!app) return [];
  return app.instances
    .map((serviceId, index) => ({ serviceId, index }))
    .filter(({ serviceId }) => !instance || serviceId === instance)
    .map(({ index }) => runtimeSample(app, index, t));
}

const round = (value: number) => Math.round(value * 100) / 100;

/** Executions (requests and jobs) the services view covers, with their span templates. */
function serviceExecutions(params: Params, window: Window) {
  const source = params.get('source');
  const operationId = params.get('operationId');
  const queue = params.get('queue');
  const name = params.get('name');
  const executions: Array<{
    templates: SpanTemplate[];
    durationMs: number;
    failed: boolean;
    t: number;
    id: string;
    traceId: string;
    serviceId: string;
    operationId: string;
    source: 'request' | 'job';
  }> = [];
  if (source !== 'job' && !queue && !name)
    for (const r of scopedRequests(params, window))
      if (!operationId || r.op.operationId === operationId)
        executions.push({
          templates: r.op.spans,
          durationMs: r.durationMs,
          failed: r.hasError,
          t: r.t,
          id: r.id,
          traceId: r.traceId,
          serviceId: r.serviceId,
          operationId: r.op.operationId,
          source: 'request',
        });
  if (source !== 'request' && !operationId)
    for (const j of scopedJobs(params, window))
      if ((!queue || j.job.queue === queue) && (!name || j.job.name === name))
        executions.push({
          templates: j.job.spans,
          durationMs: j.durationMs,
          failed: j.failed,
          t: j.t,
          id: j.id,
          traceId: j.traceId,
          serviceId: j.serviceId,
          operationId: jobKey(j.job),
          source: 'job',
        });
  return executions;
}

export const telemetryHandlers = [
  http.get('*/api/health', () => HttpResponse.json({ status: 'ok' })),

  get('instances', (params): InstanceSummaryDto[] => {
    catchUp();
    const apps = scopeApps(params);
    return APPLICATIONS.filter((a) => apps.has(a.id)).flatMap((app) =>
      app.instances.map((serviceId) => ({
        applicationId: app.id,
        serviceId,
        firstSeenAt: iso(dataStart),
        lastSeenAt: iso(Date.now() - 2_000),
        serviceVersion: app.versions.at(-1)?.version ?? null,
      })),
    );
  }),

  get('overview', (params): OverviewDto => {
    const window = windowOf(params);
    const operationId = params.get('operationId');
    const queue = params.get('queue');
    const name = params.get('name');
    const reqs = scopedRequests(params, window).filter(
      (r) => !operationId || r.op.operationId === operationId,
    );
    const js = scopedJobs(params, window).filter(
      (j) =>
        (!queue || j.job.queue === queue) && (!name || j.job.name === name),
    );
    const occ = scopedOccurrences(params, window);
    const failedJobs = js.filter((j) => j.failed).length;
    return {
      requests: {
        count: reqs.length,
        errorRate: reqs.length
          ? reqs.filter((r) => r.hasError).length / reqs.length
          : 0,
        status4xx: reqs.filter((r) => r.statusCode >= 400 && r.statusCode < 500)
          .length,
        status5xx: reqs.filter((r) => r.statusCode >= 500).length,
        latency: percentiles(reqs.map((r) => r.durationMs)),
      },
      jobs: {
        count: js.length,
        failed: failedJobs,
        failureRate: js.length ? failedJobs / js.length : 0,
        latency: percentiles(js.map((j) => j.durationMs)),
      },
      errors: {
        events: occ.length,
        groups: new Set(occ.map((o) => o.key)).size,
      },
      timeline: bucketize(window, reqs).map((b) =>
        timeBucket(b.t, b.items.map(reqExec)),
      ),
      jobsTimeline: bucketize(window, js).map((b) =>
        timeBucket(b.t, b.items.map(jobExec)),
      ),
    };
  }),

  get('requests/operations', (params): OperationStatsDto[] => {
    const groups = new Map<string, RequestEvent[]>();
    for (const r of scopedRequests(params, windowOf(params))) {
      const list = groups.get(r.op.operationId) ?? [];
      list.push(r);
      groups.set(r.op.operationId, list);
    }
    return [...groups.values()]
      .map((list) => {
        const errorCount = list.filter((r) => r.hasError).length;
        return {
          operationId: list[0]!.op.operationId,
          method: list[0]!.op.method,
          protocol: 'http',
          count: list.length,
          errorCount,
          errorRate: errorCount / list.length,
          lastSeenAt: iso(list[list.length - 1]!.t),
          latency: percentiles(list.map((r) => r.durationMs)),
        };
      })
      .sort((a, b) => b.count - a.count);
  }),

  get('requests/:id', (params, { id }): RequestDetailDto => {
    catchUp();
    const apps = scopeApps(params);
    const found = requests.find((r) => r.id === id && apps.has(r.appId));
    if (!found) throw new ApiError(404, `Request ${id} not found`);
    return requestDetail(found);
  }),

  get('requests', (params) => {
    const operationId = params.get('operationId');
    const status = params.get('status');
    const minDuration = Number(params.get('minDuration') ?? 0);
    const traceId = params.get('traceId');
    const userId = params.get('userId');
    const items = scopedRequests(params, windowOf(params)).filter(
      (r) =>
        (!operationId || r.op.operationId === operationId) &&
        (!status || (status === 'error') === r.hasError) &&
        r.durationMs >= minDuration &&
        (!traceId || r.traceId === traceId) &&
        (!userId || r.userId === userId),
    );
    return page(newestFirst(items).map(requestItem), params);
  }),

  get('jobs/queues', (params): JobStatsDto[] => {
    const groups = new Map<string, JobEvent[]>();
    for (const j of scopedJobs(params, windowOf(params))) {
      const list = groups.get(jobKey(j.job)) ?? [];
      list.push(j);
      groups.set(jobKey(j.job), list);
    }
    return [...groups.values()]
      .map((list) => {
        const failedCount = list.filter((j) => j.failed).length;
        const waits = list.flatMap((j) =>
          j.waitMs === null ? [] : [j.waitMs],
        );
        return {
          queue: list[0]!.job.queue,
          name: list[0]!.job.name,
          count: list.length,
          failedCount,
          failureRate: failedCount / list.length,
          avgWaitMs: waits.length
            ? round(waits.reduce((s, w) => s + w, 0) / waits.length)
            : 0,
          lastSeenAt: iso(list[list.length - 1]!.t),
          latency: percentiles(list.map((j) => j.durationMs)),
        };
      })
      .sort((a, b) => b.count - a.count);
  }),

  get('jobs/:id', (params, { id }): JobDetailDto => {
    catchUp();
    const apps = scopeApps(params);
    const found = jobs.find((j) => j.id === id && apps.has(j.appId));
    if (!found) throw new ApiError(404, `Job ${id} not found`);
    return jobDetail(found);
  }),

  get('jobs', (params) => {
    const queue = params.get('queue');
    const name = params.get('name');
    const status = params.get('status');
    const traceId = params.get('traceId');
    const items = scopedJobs(params, windowOf(params)).filter(
      (j) =>
        (!queue || j.job.queue === queue) &&
        (!name || j.job.name === name) &&
        (!status || (status === 'failed') === j.failed) &&
        (!traceId || j.traceId === traceId),
    );
    return page(newestFirst(items).map(jobItem), params);
  }),

  get('errors/:id', (params, { id }): ErrorGroupDetailDto => {
    const def = errorById.get(id);
    const apps = scopeApps(params);
    const group = def ? errorGroup(def.key, apps) : null;
    if (!def || !group) throw new ApiError(404, `Error group ${id} not found`);
    const window = windowOf(params);
    const occ = scopedOccurrences(params, window).filter(
      (o) => o.key === def.key,
    );
    return {
      ...group,
      stack: def.stack,
      occurrences: newestFirst(occ)
        .slice(0, 50)
        .map((o) => ({
          applicationId: o.appId,
          executionId: o.executionId,
          occurredAt: iso(o.t),
          serviceId: o.serviceId,
          source: def.source,
          traceId: o.traceId,
        })),
      timeline: bucketize(window, occ).map((b) => ({
        ...timeBucket(b.t, []),
        count: b.items.length,
        errors: b.items.length,
      })),
    };
  }),

  get('errors', (params) => {
    const apps = scopeApps(params);
    const source = params.get('source');
    const q = params.get('q')?.toLowerCase();
    const seen = new Set(
      scopedOccurrences(params, windowOf(params)).map((o) => o.key),
    );
    const groups = ERRORS.filter(
      (def) =>
        seen.has(def.key) &&
        (!source || def.source === source) &&
        (!q || `${def.errorClass} ${def.message}`.toLowerCase().includes(q)),
    )
      .map((def) => errorGroup(def.key, apps))
      .filter((g): g is ErrorGroupDto => g !== null)
      .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));
    return page(groups, params);
  }),

  get('logs', (params) => {
    const window = windowOf(params);
    const apps = scopeApps(params);
    const instance = params.get('instance');
    const level = params.get('level');
    const context = params.get('context');
    const traceId = params.get('traceId');
    const q = params.get('q')?.toLowerCase();
    const items = within(logs, window).filter(
      (l) =>
        apps.has(l.appId) &&
        (!instance || l.serviceId === instance) &&
        (!level || l.level === level) &&
        (!context || l.context === context) &&
        (!traceId || l.traceId === traceId) &&
        (!q || l.text.toLowerCase().includes(q)),
    );
    return page(newestFirst(items).map(logItem), params);
  }),

  get('traces/:traceId', (params, { traceId }): TraceDetailDto => {
    catchUp();
    const apps = scopeApps(params);
    const reqs = requests.filter(
      (r) => r.traceId === traceId && apps.has(r.appId),
    );
    const js = jobs.filter((j) => j.traceId === traceId && apps.has(j.appId));
    if (reqs.length === 0 && js.length === 0)
      throw new ApiError(404, `Trace ${traceId} not found`);
    return {
      traceId,
      requests: reqs.map(requestDetail),
      jobs: js.map(jobDetail),
      logs: logs
        .filter((l) => l.traceId === traceId && apps.has(l.appId))
        .map(logItem),
    };
  }),

  get('metrics/runtime/instances', (params): RuntimeInstanceDto[] => {
    windowOf(params);
    const appId = params.get('application') ?? '';
    scopeApps(params);
    const app = appDef(appId);
    if (!app) return [];
    const now = Date.now();
    return app.instances.map((serviceId, index) => {
      const s = runtimeSample(app, index, now);
      return {
        serviceId,
        lastSeenAt: iso(now - 4_000),
        serviceVersion: app.versions.at(-1)?.version ?? null,
        cpuPercent: round(s.cpuPercent),
        memoryRss: round(s.memoryRss),
        memoryPercent: round(s.memoryPercent),
        heapUsed: round(s.heapUsed),
        eventLoopLagMs: round(s.eventLoopLagMs),
        eventLoopUtilization: Math.round(s.eventLoopUtilization * 1000) / 1000,
      };
    });
  }),

  get('metrics/runtime', (params): RuntimeMetricsDto => {
    const window = windowOf(params);
    const appId = params.get('application') ?? '';
    scopeApps(params);
    const instance = params.get('instance');
    const series = runtimeSeries(appId, instance, window);
    const filled = series.filter((p) => p.cpuPercent !== null);
    const avg = (pick: (p: RuntimeSeriesPointDto) => number | null) =>
      filled.length
        ? round(filled.reduce((s, p) => s + (pick(p) ?? 0), 0) / filled.length)
        : null;
    const app = appDef(appId);
    const latestAt = Math.min(window.to, Date.now()) - 4_000;
    const latestIndex = app
      ? Math.max(
          0,
          app.instances.findIndex((s) => s === instance),
        )
      : 0;
    const latest =
      app && filled.length ? runtimeSample(app, latestIndex, latestAt) : null;
    return {
      series,
      avg: {
        cpuPercent: avg((p) => p.cpuPercent),
        memoryRss: avg((p) => p.memoryRss),
        memoryPercent: avg((p) => p.memoryPercent),
        heapUsed: avg((p) => p.heapUsed),
        eventLoopLagMs: avg((p) => p.eventLoopLagMs),
        eventLoopUtilization: avg((p) => p.eventLoopUtilization),
      },
      latest:
        latest && app
          ? {
              sampledAt: iso(latestAt),
              serviceId: app.instances[latestIndex]!,
              cpuPercent: round(latest.cpuPercent),
              memoryRss: round(latest.memoryRss),
              memoryPercent: round(latest.memoryPercent),
              heapUsed: round(latest.heapUsed),
              eventLoopLagMs: round(latest.eventLoopLagMs),
              eventLoopUtilization:
                Math.round(latest.eventLoopUtilization * 1000) / 1000,
            }
          : null,
    };
  }),

  get('users/:userId', (params, { userId }): UserDetailDto => {
    const window = windowOf(params);
    const reqs = scopedRequests(params, window).filter(
      (r) => r.userId === userId,
    );
    if (reqs.length === 0)
      throw new ApiError(404, `No requests from ${userId} in this range`);
    const errorCount = reqs.filter((r) => r.hasError).length;
    return {
      userId: userId ?? null,
      requestCount: reqs.length,
      errorCount,
      errorRate: errorCount / reqs.length,
      firstSeenAt: iso(reqs[0]!.t),
      lastSeenAt: iso(reqs[reqs.length - 1]!.t),
      latency: percentiles(reqs.map((r) => r.durationMs)),
      timeline: bucketize(window, reqs).map((b) =>
        timeBucket(b.t, b.items.map(reqExec)),
      ),
    };
  }),

  get('users', (params): UsersDto => {
    const window = windowOf(params);
    const search = params.get('search')?.toLowerCase();
    const limit = Number(params.get('limit') ?? 200) || 200;
    const reqs = scopedRequests(params, window);
    const byUser = new Map<string | null, RequestEvent[]>();
    for (const r of reqs) {
      const list = byUser.get(r.userId) ?? [];
      list.push(r);
      byUser.set(r.userId, list);
    }
    const items = [...byUser.entries()]
      .filter(([userId]) =>
        search ? userId?.toLowerCase().includes(search) : true,
      )
      .map(([userId, list]) => {
        const errorCount = list.filter((r) => r.hasError).length;
        return {
          userId,
          requestCount: list.length,
          errorCount,
          errorRate: errorCount / list.length,
          firstSeenAt: iso(list[0]!.t),
          lastSeenAt: iso(list[list.length - 1]!.t),
          latency: percentiles(list.map((r) => r.durationMs)),
        };
      })
      .sort((a, b) => b.requestCount - a.requestCount)
      .slice(0, limit);
    return {
      items,
      userCount: [...byUser.keys()].filter((u) => u !== null).length,
      timeline: bucketize(window, reqs).map((b) => ({
        t: iso(b.t),
        requests: b.items.length,
        users: new Set(b.items.flatMap((r) => (r.userId ? [r.userId] : [])))
          .size,
      })),
    };
  }),

  get('services/spans', (params): SlowSpanDto[] => {
    const className = params.get('className');
    const methodName = params.get('methodName');
    const limit = Number(params.get('limit') ?? 50) || 50;
    const spans: SlowSpanDto[] = [];
    for (const e of serviceExecutions(params, windowOf(params))) {
      const matches: Array<{ total: number; self: number }> = [];
      spanTimes(e.templates, e.durationMs, (template, total, self) => {
        if (
          template.className === className &&
          template.methodName === methodName
        )
          matches.push({ total, self });
      });
      const match = matches[0];
      if (!match) continue;
      const { total, self } = match;
      spans.push({
        calledAt: iso(e.t),
        durationMs: round(total),
        selfMs: round(self),
        executionId: e.id,
        operationId: e.operationId,
        serviceId: e.serviceId,
        source: e.source,
        traceId: e.traceId,
      });
    }
    return spans.sort((a, b) => b.durationMs - a.durationMs).slice(0, limit);
  }),

  get('services', (params): ServicesDto => {
    const classes = new Map<string, ServiceDto>();
    for (const e of serviceExecutions(params, windowOf(params))) {
      spanTimes(e.templates, e.durationMs, (template, total, self) => {
        const service =
          classes.get(template.className) ??
          ({
            className: template.className,
            calls: 0,
            errorCount: 0,
            selfMs: 0,
            totalMs: 0,
            share: 0,
            methods: [],
          } satisfies ServiceDto);
        classes.set(template.className, service);
        let method = service.methods.find(
          (m) => m.methodName === template.methodName,
        );
        if (!method) {
          method = {
            methodName: template.methodName,
            calls: 0,
            errorCount: 0,
            selfMs: 0,
            totalMs: 0,
          };
          service.methods.push(method);
        }
        const failed = e.failed && template.fails === true ? 1 : 0;
        for (const target of [service, method]) {
          target.calls += 1;
          target.errorCount += failed;
          target.selfMs += self;
          target.totalMs += total;
        }
      });
    }
    const services = [...classes.values()];
    const totalSelfMs = services.reduce((sum, s) => sum + s.selfMs, 0);
    for (const s of services) {
      s.share = totalSelfMs ? s.selfMs / totalSelfMs : 0;
      s.selfMs = round(s.selfMs);
      s.totalMs = round(s.totalMs);
      s.methods.sort((a, b) => b.selfMs - a.selfMs);
      for (const m of s.methods) {
        m.selfMs = round(m.selfMs);
        m.totalMs = round(m.totalMs);
      }
    }
    return {
      services: services.sort((a, b) => b.selfMs - a.selfMs),
      totalSelfMs: round(totalSelfMs),
    };
  }),
];
