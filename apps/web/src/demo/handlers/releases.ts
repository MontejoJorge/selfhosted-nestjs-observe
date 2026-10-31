/** Release comparisons: the version boundaries come from the world's deploy history. */

import type {
  ComparisonDto,
  ExecutionStatsDto,
  JobImpactDto,
  NewErrorGroupDto,
  OperationImpactDto,
  ReleaseDetailDto,
  ReleaseMarkerDto,
  ReleaseSignal,
  ReleaseSummaryDto,
  ReleaseVerdict,
  ReleaseWindow,
} from '@/lib/api/generated/api';
import { http, HttpResponse } from 'msw';
import {
  ApiError,
  errorResponse,
  executionStats,
  iso,
  page,
  scopeApps,
  windowOf,
  within,
} from '../query';
import {
  applications,
  catchUp,
  errorByKey,
  errorGroupIds,
  jobs,
  occurrences,
  releaseBoundary,
  requests,
  versionAt,
} from '../store';
import { APPLICATIONS, TIME, type ApplicationDef } from '../world';

const WINDOW_MS: Record<ReleaseWindow, number> = {
  '15m': 15 * TIME.MINUTE,
  '30m': 30 * TIME.MINUTE,
  '1h': TIME.HOUR,
  '3h': 3 * TIME.HOUR,
};

const MIN_COUNT = 40;

function compare(
  before: ExecutionStatsDto,
  after: ExecutionStatsDto,
): ComparisonDto {
  if (before.count < MIN_COUNT || after.count < MIN_COUNT)
    return { before, after, signals: [], verdict: 'insufficient_data' };
  const signals: ReleaseSignal[] = [];
  // Small samples are noisy: a rate change needs a few failures behind it.
  const rateDelta = after.errorRate - before.errorRate;
  if (rateDelta > 0.02 && after.errors >= 3) signals.push('error_rate_up');
  if (rateDelta < -0.02 && before.errors >= 3) signals.push('error_rate_down');
  if (after.p95Ms > before.p95Ms * 1.5) signals.push('p95_up');
  if (after.p95Ms < before.p95Ms / 1.5) signals.push('p95_down');
  const verdict: ReleaseVerdict = signals.some((s) => s.endsWith('_up'))
    ? 'regression'
    : signals.length > 0
      ? 'improving'
      : 'stable';
  return { before, after, signals, verdict };
}

const SEVERITY: ReleaseVerdict[] = [
  'insufficient_data',
  'improving',
  'stable',
  'regression',
];

function worst(...verdicts: ReleaseVerdict[]): ReleaseVerdict {
  return verdicts.reduce((a, b) =>
    SEVERITY.indexOf(b) > SEVERITY.indexOf(a) ? b : a,
  );
}

interface Release {
  app: ApplicationDef;
  index: number;
  version: string;
  boundary: number;
  window: ReleaseWindow;
}

function sides({ boundary, window }: Release) {
  const minute = Math.floor(boundary / TIME.MINUTE) * TIME.MINUTE;
  const length = WINDOW_MS[window];
  return {
    before: { from: minute - length, to: minute },
    after: { from: minute + TIME.MINUTE, to: minute + TIME.MINUTE + length },
  };
}

function summary(release: Release): ReleaseSummaryDto {
  const { app, index, version, boundary } = release;
  const { before, after } = sides(release);
  const now = Date.now();
  const reqStats = (w: { from: number; to: number }) =>
    executionStats(
      within(requests, w)
        .filter((r) => r.appId === app.id)
        .map((r) => ({ durationMs: r.durationMs, failed: r.hasError })),
    );
  const jobStats = (w: { from: number; to: number }) =>
    executionStats(
      within(jobs, w)
        .filter((j) => j.appId === app.id)
        .map((j) => ({ durationMs: j.durationMs, failed: j.failed })),
    );
  const requestsCmp = compare(reqStats(before), reqStats(after));
  const jobsCmp = compare(jobStats(before), jobStats(after));
  const next = app.versions[index + 1];
  const running = app.instances.filter(
    (_, i) => versionAt(app, i, now) === version,
  ).length;
  const appName = applications.find((a) => a.id === app.id)?.name ?? app.name;
  return {
    applicationId: app.id,
    applicationName: appName,
    version,
    previousVersion: app.versions[index - 1]?.version ?? null,
    window: release.window,
    firstSeenAt: iso(boundary),
    lastSeenAt: iso(
      next
        ? releaseBoundary(app, next.version) +
            (app.instances.length - 1) * 2 * TIME.MINUTE
        : now,
    ),
    instanceCount: app.instances.length,
    activeInstances: running,
    before: { from: iso(before.from), to: iso(before.to) },
    after: { from: iso(after.from), to: iso(after.to) },
    complete: after.to <= now,
    requests: requestsCmp,
    jobs: jobsCmp,
    verdict: worst(requestsCmp.verdict, jobsCmp.verdict),
  };
}

function releasesOf(params: URLSearchParams): Release[] {
  const apps = scopeApps(params);
  const window = (params.get('window') ?? '30m') as ReleaseWindow;
  return APPLICATIONS.filter((a) => apps.has(a.id)).flatMap((app) =>
    app.versions.map((v, index) => ({
      app,
      index,
      version: v.version,
      boundary: releaseBoundary(app, v.version),
      window,
    })),
  );
}

function detail(release: Release): ReleaseDetailDto {
  const base = summary(release);
  const { app, version, boundary } = release;
  const { before, after } = sides(release);
  const now = Date.now();

  const operations = new Map<string, OperationImpactDto>();
  const opSides = [
    ['before', before],
    ['after', after],
  ] as const;
  for (const [side, w] of opSides) {
    const groups = new Map<
      string,
      Array<{ durationMs: number; failed: boolean }>
    >();
    for (const r of within(requests, w).filter((r) => r.appId === app.id)) {
      const list = groups.get(r.op.operationId) ?? [];
      list.push({ durationMs: r.durationMs, failed: r.hasError });
      groups.set(r.op.operationId, list);
      if (!operations.has(r.op.operationId))
        operations.set(r.op.operationId, {
          operationId: r.op.operationId,
          method: r.op.method,
          protocol: 'http',
          before: executionStats([]),
          after: executionStats([]),
        });
    }
    for (const [operationId, list] of groups)
      operations.get(operationId)![side] = executionStats(list);
  }

  const jobImpact = new Map<string, JobImpactDto>();
  for (const [side, w] of opSides) {
    const groups = new Map<
      string,
      Array<{ durationMs: number; failed: boolean }>
    >();
    for (const j of within(jobs, w).filter((j) => j.appId === app.id)) {
      const key = `${j.job.queue}/${j.job.name}`;
      const list = groups.get(key) ?? [];
      list.push({ durationMs: j.durationMs, failed: j.failed });
      groups.set(key, list);
      if (!jobImpact.has(key))
        jobImpact.set(key, {
          queue: j.job.queue,
          name: j.job.name,
          before: executionStats([]),
          after: executionStats([]),
        });
    }
    for (const [key, list] of groups)
      jobImpact.get(key)![side] = executionStats(list);
  }

  const next = app.versions[release.index + 1];
  const firstSeen = new Map<string, number>();
  const counts = new Map<string, number>();
  for (const o of occurrences) {
    if (o.appId !== app.id) continue;
    if (!firstSeen.has(o.key)) firstSeen.set(o.key, o.t);
    counts.set(o.key, (counts.get(o.key) ?? 0) + 1);
  }
  const newErrorGroups: NewErrorGroupDto[] = [...firstSeen.entries()]
    .filter(
      ([, t]) =>
        t >= boundary && t < (next ? releaseBoundary(app, next.version) : now),
    )
    .map(([key, t]) => {
      const def = errorByKey.get(key)!;
      const last = occurrences.findLast((o) => o.key === key)!;
      return {
        id: errorGroupIds.get(key)!,
        errorClass: def.errorClass,
        message: def.message,
        source: def.source,
        count: counts.get(key) ?? 0,
        firstSeenAt: iso(t),
        lastSeenAt: iso(last.t),
      };
    });

  const byTraffic = <
    T extends { before: ExecutionStatsDto; after: ExecutionStatsDto },
  >(
    items: Iterable<T>,
  ) =>
    [...items]
      .sort(
        (a, b) =>
          b.before.count + b.after.count - (a.before.count + a.after.count),
      )
      .slice(0, 10);

  return {
    ...base,
    operations: byTraffic(operations.values()),
    jobImpact: byTraffic(jobImpact.values()),
    newErrorGroups,
    instances: app.instances.map((serviceId, i) => {
      const active = versionAt(app, i, now) === version;
      return {
        serviceId,
        active,
        firstSeenAt: iso(boundary + i * 2 * TIME.MINUTE),
        lastSeenAt: iso(
          active || !next
            ? now - 3_000
            : releaseBoundary(app, next.version) + i * 2 * TIME.MINUTE,
        ),
      };
    }),
  };
}

export const releaseHandlers = [
  http.get('*/api/release-markers', ({ request }) => {
    try {
      const params = new URL(request.url).searchParams;
      const window = windowOf(params);
      const apps = scopeApps(params);
      const instance = params.get('instance');
      const markers: ReleaseMarkerDto[] = APPLICATIONS.filter((a) =>
        apps.has(a.id),
      ).flatMap((app) => {
        const index = instance ? app.instances.indexOf(instance) : 0;
        if (index < 0) return [];
        return app.versions
          .map((v) => ({
            applicationId: app.id,
            version: v.version,
            at: releaseBoundary(app, v.version) + index * 2 * TIME.MINUTE,
            serviceId: instance,
          }))
          .filter((m) => m.at >= window.from && m.at < window.to)
          .map((m) => ({ ...m, at: iso(m.at) }));
      });
      return HttpResponse.json(markers);
    } catch (error) {
      return errorResponse(error);
    }
  }),

  http.get('*/api/releases/:version', ({ request, params: path }) => {
    try {
      catchUp();
      const params = new URL(request.url).searchParams;
      const version = decodeURIComponent(String(path.version));
      const release = releasesOf(params).find((r) => r.version === version);
      if (!release) throw new ApiError(404, `Release ${version} not found`);
      return HttpResponse.json(detail(release));
    } catch (error) {
      return errorResponse(error);
    }
  }),

  http.get('*/api/releases', ({ request }) => {
    try {
      const params = new URL(request.url).searchParams;
      const window = windowOf(params);
      const items = releasesOf(params)
        .filter((r) => r.boundary >= window.from && r.boundary < window.to)
        .sort((a, b) => b.boundary - a.boundary)
        .map(summary);
      return HttpResponse.json(page(items, params, 20));
    } catch (error) {
      return errorResponse(error);
    }
  }),
];
