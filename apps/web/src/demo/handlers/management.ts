/** Projects, applications, API keys, storage and trims, kept in memory for the session. */

import type {
  ActivityBucketDto,
  ApiKeyDto,
  ApplicationDto,
  ApplicationSummaryDto,
  ApplicationUsageDto,
  CreateApiKeyDto,
  CreateApplicationDto,
  CreatedApiKeyDto,
  CreateProjectDto,
  CreateStorageTrimDto,
  DayUsageDto,
  ProjectDto,
  ProjectStorageDto,
  ProjectSummaryDto,
  StorageOverviewDto,
  StorageTrimDto,
  StorageUsageTable,
  TableUsageDto,
  UpdateApplicationDto,
  UpdateProjectDto,
} from '@/lib/api/generated/api';
import { http, HttpResponse, type HttpResponseResolver } from 'msw';
import {
  ApiError,
  bucketize,
  errorResponse,
  findApplication,
  findProject,
  iso,
  page,
  scopeApps,
  windowOf,
  within,
  type Window,
} from '../query';
import {
  apiKeys,
  appDef,
  applications,
  catchUp,
  dataStart,
  jobs,
  logs,
  newAppKey,
  newId,
  newSecret,
  occurrences,
  projects,
  requests,
  runtimeSample,
  trims,
  type ApplicationState,
  type ProjectState,
  type TrimState,
} from '../store';
import { RETENTION_DAYS, TIME } from '../world';

type Resolver = (args: {
  params: URLSearchParams;
  path: Record<string, string>;
  body: () => Promise<unknown>;
}) => unknown;

/** Runs a resolver, maps ApiError to an HTTP error, `undefined` to 204 and `[status, body]` to that status. */
function route(resolve: Resolver): HttpResponseResolver {
  return async ({ request, params }) => {
    try {
      const result = await resolve({
        params: new URL(request.url).searchParams,
        path: params as Record<string, string>,
        body: () => request.json(),
      });
      if (result === undefined) return new HttpResponse(null, { status: 204 });
      if (
        Array.isArray(result) &&
        result.length === 2 &&
        typeof result[0] === 'number'
      )
        return HttpResponse.json(result[1] as never, { status: result[0] });
      return HttpResponse.json(result as never);
    } catch (error) {
      return errorResponse(error);
    }
  };
}

const appsOf = (projectId: string) =>
  applications.filter((a) => a.projectId === projectId);

function activity(window: Window, appIds: Set<string>): ActivityBucketDto[] {
  const reqs = within(requests, window).filter((r) => appIds.has(r.appId));
  return bucketize(window, reqs).map(({ t, items }) => ({
    t: iso(t),
    count: items.length,
    errors: items.filter((r) => r.hasError).length,
    avgDurationMs: items.length
      ? Math.round(
          (items.reduce((s, r) => s + r.durationMs, 0) / items.length) * 100,
        ) / 100
      : null,
  }));
}

function lastSeen(appIds: Set<string>): string | null {
  const last = requests.findLast((r) => appIds.has(r.appId));
  return last ? iso(Math.max(last.t, Date.now() - 4_000)) : null;
}

function projectDto(p: ProjectState): ProjectDto {
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    description: p.description,
    createdAt: iso(p.createdAt),
    rangePresets: p.rangePresets,
    applicationCount: appsOf(p.id).length,
  };
}

function applicationDto(a: ApplicationState): ApplicationDto {
  return {
    id: a.id,
    projectId: a.projectId,
    name: a.name,
    tags: a.tags,
    createdAt: iso(a.createdAt),
    lastSeenAt: a.def ? lastSeen(new Set([a.id])) : null,
  };
}

function slugify(name: string): string {
  const base =
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'project';
  let slug = base;
  for (let i = 2; projects.some((p) => p.slug === slug); i++)
    slug = `${base}-${i}`;
  return slug;
}

function createKey(
  projectId: string,
  app: ApplicationState,
  name: string,
): CreatedApiKeyDto {
  const key = {
    projectId,
    id: newId(),
    appKey: newAppKey(),
    applicationId: app.id,
    applicationName: app.name,
    name,
    createdAt: iso(Date.now()),
    revokedAt: null,
    status: 'active' as const,
  };
  apiKeys.unshift(key);
  return { ...keyDto(key), appSecret: newSecret() };
}

/** Drops the store's `projectId` bookkeeping field from a record. */
function withoutProject<T extends { projectId: string }>(
  item: T,
): Omit<T, 'projectId'> {
  const copy: Partial<T> = { ...item };
  delete copy.projectId;
  return copy as Omit<T, 'projectId'>;
}

const keyDto = (key: ApiKeyDto & { projectId: string }): ApiKeyDto =>
  withoutProject(key);

/* Storage: rows counted from the generated telemetry, bytes estimated per row. */

const BYTES_PER_ROW: Record<StorageUsageTable, number> = {
  requests: 1450,
  jobs: 1180,
  error_occurrences: 210,
  logs: 340,
  runtime_metrics: 190,
  custom_metrics: 120,
  profiles: 6200,
};

type Usage = Map<string, Map<string, Map<StorageUsageTable, number>>>;

/** Rows per application, UTC day and table. */
function usage(): Usage {
  catchUp();
  const result: Usage = new Map();
  const add = (
    appId: string,
    t: number,
    table: StorageUsageTable,
    rows = 1,
  ) => {
    const day = iso(t).slice(0, 10);
    const byDay =
      result.get(appId) ?? new Map<string, Map<StorageUsageTable, number>>();
    result.set(appId, byDay);
    const byTable = byDay.get(day) ?? new Map<StorageUsageTable, number>();
    byDay.set(day, byTable);
    byTable.set(table, (byTable.get(table) ?? 0) + rows);
  };
  for (const r of requests) add(r.appId, r.t, 'requests');
  for (const j of jobs) add(j.appId, j.t, 'jobs');
  for (const o of occurrences) add(o.appId, o.t, 'error_occurrences');
  for (const l of logs) add(l.appId, l.t, 'logs');
  for (const a of applications) {
    const def = appDef(a.id);
    if (!def) continue;
    // One runtime sample every 10 s per instance.
    for (
      let day = Math.floor(dataStart / TIME.DAY) * TIME.DAY;
      day < Date.now();
      day += TIME.DAY
    ) {
      const from = Math.max(day, dataStart);
      const to = Math.min(day + TIME.DAY, Date.now());
      add(
        a.id,
        day,
        'runtime_metrics',
        Math.round(((to - from) / 10_000) * def.instances.length),
      );
    }
  }
  return result;
}

function tableUsage(
  byTable: Iterable<[StorageUsageTable, number]>,
): TableUsageDto[] {
  return [...byTable]
    .map(([table, rows]) => ({
      table,
      rows,
      bytes: rows * BYTES_PER_ROW[table],
    }))
    .sort((a, b) => b.bytes - a.bytes);
}

function sumTables(lists: TableUsageDto[][]): TableUsageDto[] {
  const totals = new Map<StorageUsageTable, number>();
  for (const list of lists)
    for (const t of list)
      totals.set(t.table, (totals.get(t.table) ?? 0) + t.rows);
  return tableUsage(totals);
}

const total = (tables: TableUsageDto[]) => ({
  rows: tables.reduce((s, t) => s + t.rows, 0),
  bytes: tables.reduce((s, t) => s + t.bytes, 0),
});

function appUsage(all: Usage, app: ApplicationState): ApplicationUsageDto {
  const days = [...(all.get(app.id)?.values() ?? [])].map((byTable) =>
    tableUsage(byTable),
  );
  const tables = sumTables(days);
  return { applicationId: app.id, name: app.name, tables, ...total(tables) };
}

/** Trims advance with time: pending for 2 s, running for 6 s, then they delete and disappear. */
function advanceTrims(): void {
  const now = Date.now();
  for (const trim of [...trims]) {
    const age = now - Date.parse(trim.requestedAt);
    if (age < 2_000) continue;
    trim.status = 'running';
    trim.startedAt ??= iso(now);
    trim.totalSteps = 12;
    trim.doneSteps = Math.min(12, Math.floor(((age - 2_000) / 6_000) * 12));
    if (age < 8_000) continue;
    const appIds = trim.applicationId
      ? new Set([trim.applicationId])
      : new Set(appsOf(trim.projectId).map((a) => a.id));
    const cutoff = Date.parse(trim.cutoffDay);
    for (const list of [requests, jobs, logs, occurrences] as Array<
      Array<{ t: number; appId: string }>
    >) {
      const kept = list.filter((e) => e.t >= cutoff || !appIds.has(e.appId));
      list.splice(0, list.length, ...kept);
    }
    trims.splice(trims.indexOf(trim), 1);
  }
}

const trimDto = (trim: TrimState): StorageTrimDto => withoutProject(trim);

export const managementHandlers = [
  http.get(
    '*/api/projects',
    route(({ params }) => {
      const window = windowOf(params);
      const items: ProjectSummaryDto[] = projects.map((p) => {
        const appIds = new Set(appsOf(p.id).map((a) => a.id));
        const reqs = within(requests, window).filter((r) =>
          appIds.has(r.appId),
        );
        return {
          ...projectDto(p),
          activity: activity(window, appIds),
          requestCount: reqs.length,
          avgDurationMs: reqs.length
            ? Math.round(
                (reqs.reduce((s, r) => s + r.durationMs, 0) / reqs.length) *
                  100,
              ) / 100
            : null,
          lastSeenAt: lastSeen(appIds),
        };
      });
      return page(items, params);
    }),
  ),

  http.post(
    '*/api/projects',
    route(async ({ body }) => {
      const input = (await body()) as CreateProjectDto;
      const project: ProjectState = {
        id: newId(),
        slug: slugify(input.name),
        name: input.name,
        description: input.description || null,
        createdAt: Date.now(),
        rangePresets: ['1h', '24h', '7d'],
      };
      projects.push(project);
      return [201, projectDto(project)];
    }),
  ),

  http.get(
    '*/api/projects/:project/storage/trims',
    route(({ path }) => {
      const project = findProject(path.project!);
      advanceTrims();
      return trims.filter((t) => t.projectId === project.id).map(trimDto);
    }),
  ),

  http.post(
    '*/api/projects/:project/storage/trims',
    route(async ({ path, body }) => {
      const project = findProject(path.project!);
      const input = (await body()) as CreateStorageTrimDto;
      if (input.application) findApplication(project.id, input.application);
      const today = Date.UTC(
        new Date().getUTCFullYear(),
        new Date().getUTCMonth(),
        new Date().getUTCDate(),
      );
      const trim: TrimState = {
        projectId: project.id,
        id: newId(),
        applicationId: input.application ?? null,
        keepDays: input.keepDays,
        cutoffDay: iso(today - input.keepDays * TIME.DAY).slice(0, 10),
        requestedAt: iso(Date.now()),
        startedAt: null,
        status: 'pending',
        doneSteps: 0,
        totalSteps: null,
      };
      trims.push(trim);
      return [201, trimDto(trim)];
    }),
  ),

  http.get(
    '*/api/projects/:project/storage',
    route(({ params, path }): ProjectStorageDto => {
      const project = findProject(path.project!);
      advanceTrims();
      const application = params.get('application');
      if (application) findApplication(project.id, application);
      const all = usage();
      const apps = appsOf(project.id);
      const scoped = apps.filter((a) => !application || a.id === application);
      const days = new Map<string, Map<StorageUsageTable, number>>();
      for (const a of scoped)
        for (const [day, byTable] of all.get(a.id) ?? [])
          for (const [table, rows] of byTable) {
            const target =
              days.get(day) ?? new Map<StorageUsageTable, number>();
            days.set(day, target);
            target.set(table, (target.get(table) ?? 0) + rows);
          }
      const dayUsage: DayUsageDto[] = [...days.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([day, byTable]) => {
          const tables = tableUsage(byTable);
          return { day, tables, ...total(tables) };
        });
      const tables = sumTables(dayUsage.map((d) => d.tables));
      return {
        projectId: project.id,
        applicationId: application,
        applications: apps
          .map((a) => appUsage(all, a))
          .sort((a, b) => b.bytes - a.bytes),
        days: dayUsage,
        tables,
        ...total(tables),
        retentionDays: RETENTION_DAYS,
        trims: trims.filter((t) => t.projectId === project.id).map(trimDto),
      };
    }),
  ),

  http.get(
    '*/api/projects/:project/data-days',
    route(({ params, path }) => {
      catchUp();
      const apps = scopeApps(params, path.project);
      const days = new Set<string>();
      for (const r of requests)
        if (apps.has(r.appId)) days.add(iso(r.t).slice(0, 10));
      for (const j of jobs)
        if (apps.has(j.appId)) days.add(iso(j.t).slice(0, 10));
      const sorted = [...days].sort();
      return {
        days: sorted,
        oldest: sorted[0] ?? null,
        newest: sorted.at(-1) ?? null,
      };
    }),
  ),

  http.get(
    '*/api/projects/:project/keys',
    route(({ params, path }) => {
      const project = findProject(path.project!);
      const applicationId = params.get('applicationId');
      const items = apiKeys
        .filter(
          (k) =>
            k.projectId === project.id &&
            (!applicationId || k.applicationId === applicationId),
        )
        .map(keyDto);
      return page(items, params);
    }),
  ),

  http.post(
    '*/api/projects/:project/keys',
    route(async ({ path, body }) => {
      const project = findProject(path.project!);
      const input = (await body()) as CreateApiKeyDto;
      const app = findApplication(project.id, input.applicationId);
      return [201, createKey(project.id, app, input.name)];
    }),
  ),

  http.post(
    '*/api/projects/:project/keys/:keyId/revoke',
    route(({ path }) => {
      const project = findProject(path.project!);
      const key = apiKeys.find(
        (k) => k.id === path.keyId && k.projectId === project.id,
      );
      if (!key) throw new ApiError(404, 'API key not found');
      key.status = 'revoked';
      key.revokedAt ??= iso(Date.now());
      return [201, keyDto(key)];
    }),
  ),

  http.delete(
    '*/api/projects/:project/keys/:keyId',
    route(({ path }) => {
      const project = findProject(path.project!);
      const index = apiKeys.findIndex(
        (k) => k.id === path.keyId && k.projectId === project.id,
      );
      if (index < 0) throw new ApiError(404, 'API key not found');
      apiKeys.splice(index, 1);
      return undefined;
    }),
  ),

  http.get(
    '*/api/projects/:project/applications/:applicationId',
    route(({ path }) => {
      const project = findProject(path.project!);
      return applicationDto(findApplication(project.id, path.applicationId!));
    }),
  ),

  http.patch(
    '*/api/projects/:project/applications/:applicationId',
    route(async ({ path, body }) => {
      const project = findProject(path.project!);
      const app = findApplication(project.id, path.applicationId!);
      const input = (await body()) as UpdateApplicationDto;
      if (input.name !== undefined) {
        if (
          appsOf(project.id).some(
            (a) => a.id !== app.id && a.name === input.name,
          )
        )
          throw new ApiError(
            409,
            `An application named ${input.name} already exists`,
          );
        app.name = input.name;
      }
      if (input.tags !== undefined) app.tags = input.tags;
      return applicationDto(app);
    }),
  ),

  http.delete(
    '*/api/projects/:project/applications/:applicationId',
    route(({ path }) => {
      const project = findProject(path.project!);
      const app = findApplication(project.id, path.applicationId!);
      applications.splice(applications.indexOf(app), 1);
      for (let i = apiKeys.length - 1; i >= 0; i--)
        if (apiKeys[i]!.applicationId === app.id) apiKeys.splice(i, 1);
      return undefined;
    }),
  ),

  http.get(
    '*/api/projects/:project/applications',
    route(({ params, path }) => {
      const project = findProject(path.project!);
      const window = windowOf(params);
      const seconds = (window.to - window.from) / 1000;
      const items: ApplicationSummaryDto[] = appsOf(project.id).map((a) => {
        const ids = new Set([a.id]);
        const reqs = within(requests, window).filter((r) => r.appId === a.id);
        const def = appDef(a.id);
        const sample =
          def && a.def
            ? runtimeSample(def, 0, Math.min(window.to, Date.now()))
            : null;
        const round = (v: number) => Math.round(v * 100) / 100;
        return {
          ...applicationDto(a),
          activity: activity(window, ids),
          requestCount: reqs.length,
          requestsPerSecond: round(reqs.length / seconds),
          errorRate: reqs.length
            ? reqs.filter((r) => r.hasError).length / reqs.length
            : 0,
          avgDurationMs: reqs.length
            ? round(reqs.reduce((s, r) => s + r.durationMs, 0) / reqs.length)
            : null,
          cpuPercent: sample ? round(sample.cpuPercent) : null,
          memoryRssMb: sample ? round(sample.memoryRss) : null,
          memoryPercent: sample ? round(sample.memoryPercent) : null,
        };
      });
      return page(items, params);
    }),
  ),

  http.post(
    '*/api/projects/:project/applications',
    route(async ({ path, body }) => {
      const project = findProject(path.project!);
      const input = (await body()) as CreateApplicationDto;
      if (appsOf(project.id).some((a) => a.name === input.name))
        throw new ApiError(
          409,
          `An application named ${input.name} already exists`,
        );
      const app: ApplicationState = {
        id: newId(),
        projectId: project.id,
        name: input.name,
        tags: input.tags ?? [],
        createdAt: Date.now(),
        def: null,
      };
      applications.push(app);
      return [
        201,
        {
          ...applicationDto(app),
          apiKey: createKey(project.id, app, 'default'),
        },
      ];
    }),
  ),

  http.get(
    '*/api/projects/:project',
    route(({ path }) => projectDto(findProject(path.project!))),
  ),

  http.patch(
    '*/api/projects/:project',
    route(async ({ path, body }) => {
      const project = findProject(path.project!);
      const input = (await body()) as UpdateProjectDto;
      if (input.name !== undefined) project.name = input.name;
      if (input.description !== undefined)
        project.description = input.description || null;
      if (input.rangePresets !== undefined) {
        const order = ['1h', '3h', '6h', '12h', '24h', '3d', '7d', '15d'];
        project.rangePresets = [...input.rangePresets].sort(
          (a, b) => order.indexOf(a) - order.indexOf(b),
        );
      }
      return projectDto(project);
    }),
  ),

  http.delete(
    '*/api/projects/:project',
    route(({ path }) => {
      const project = findProject(path.project!);
      projects.splice(projects.indexOf(project), 1);
      for (const app of appsOf(project.id))
        applications.splice(applications.indexOf(app), 1);
      for (let i = apiKeys.length - 1; i >= 0; i--)
        if (apiKeys[i]!.projectId === project.id) apiKeys.splice(i, 1);
      return undefined;
    }),
  ),

  http.get(
    '*/api/storage',
    route((): StorageOverviewDto => {
      advanceTrims();
      const all = usage();
      const raw = new Map<StorageUsageTable, number>();
      const partitions: StorageOverviewDto['partitions'] = [];
      const perTableDay = new Map<string, number>();
      for (const byDay of all.values())
        for (const [day, byTable] of byDay)
          for (const [table, rows] of byTable) {
            raw.set(table, (raw.get(table) ?? 0) + rows);
            perTableDay.set(
              `${table}|${day}`,
              (perTableDay.get(`${table}|${day}`) ?? 0) + rows,
            );
          }
      for (const [key, rows] of perTableDay) {
        const [table, day] = key.split('|') as [StorageUsageTable, string];
        partitions.push({
          table,
          day,
          partition: `${table}_p${day.replaceAll('-', '')}`,
          approxRows: rows,
          bytes: rows * BYTES_PER_ROW[table],
        });
      }
      partitions.sort(
        (a, b) => a.table.localeCompare(b.table) || a.day.localeCompare(b.day),
      );
      const rawTables = tableUsage(raw).map((t) => ({
        table: t.table,
        kind: 'raw' as const,
        bytes: t.bytes,
        approxRows: t.rows,
        partitions: partitions.filter((p) => p.table === t.table).length,
      }));
      const reqRows = raw.get('requests') ?? 0;
      const fixed = [
        {
          table: 'request_rollups_minute',
          kind: 'rollup' as const,
          rows: Math.round(reqRows / 3),
          perRow: 260,
        },
        {
          table: 'job_rollups_minute',
          kind: 'rollup' as const,
          rows: Math.round((raw.get('jobs') ?? 0) / 2),
          perRow: 240,
        },
        {
          table: 'user_activity_15m',
          kind: 'rollup' as const,
          rows: Math.round(reqRows / 20),
          perRow: 120,
        },
        {
          table: 'error_groups',
          kind: 'other' as const,
          rows: 8,
          perRow: 4096,
        },
        {
          table: 'storage_usage',
          kind: 'other' as const,
          rows: 140,
          perRow: 180,
        },
        {
          table: 'api_keys',
          kind: 'other' as const,
          rows: apiKeys.length,
          perRow: 512,
        },
        {
          table: 'applications',
          kind: 'other' as const,
          rows: applications.length,
          perRow: 512,
        },
        {
          table: 'projects',
          kind: 'other' as const,
          rows: projects.length,
          perRow: 512,
        },
      ].map((t) => ({
        table: t.table,
        kind: t.kind,
        approxRows: t.rows,
        bytes: Math.max(16_384, t.rows * t.perRow),
        partitions: 0,
      }));
      const tables = [...rawTables, ...fixed].sort((a, b) => b.bytes - a.bytes);
      return {
        retentionDays: RETENTION_DAYS,
        aggregateRetentionDays: 90,
        databaseBytes: Math.round(
          tables.reduce((s, t) => s + t.bytes, 0) * 1.18,
        ),
        tables,
        partitions,
        projects: projects
          .map((p) => {
            const tablesOfProject = sumTables(
              appsOf(p.id).map((a) => appUsage(all, a).tables),
            );
            return {
              projectId: p.id,
              name: p.name,
              slug: p.slug,
              ...total(tablesOfProject),
            };
          })
          .sort((a, b) => b.bytes - a.bytes),
      };
    }),
  ),
];
