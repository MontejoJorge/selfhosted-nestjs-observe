/**
 * In-memory telemetry for the demo. History is generated once at startup and
 * extended minute by minute as time passes, so LIVE keeps showing new data.
 */

import type {
  ApiKeyDto,
  LogLevel,
  StorageTrimDto,
  TimeRange,
  TraceSpanDto,
  WireErrorDto,
} from '@/lib/api/generated/api';
import {
  createRng,
  hashString,
  hex,
  logNormal,
  noise,
  poisson,
  uuid,
  uuidV7,
  type Rng,
} from './random';
import {
  APPLICATIONS,
  ERRORS,
  HISTORY_DAYS,
  JOBS,
  OPERATIONS,
  PROJECTS,
  TIME,
  USERS,
  type ApplicationDef,
  type ErrorDef,
  type JobDef,
  type OperationDef,
  type SpanTemplate,
  type VersionEffect,
} from './world';

export interface RequestEvent {
  id: string;
  appId: string;
  t: number;
  op: OperationDef;
  url: string;
  durationMs: number;
  statusCode: number;
  hasError: boolean;
  errorKey: string | null;
  userId: string | null;
  serviceId: string;
  version: string;
  traceId: string;
  seed: number;
}

export interface JobEvent {
  id: string;
  appId: string;
  t: number;
  job: JobDef;
  jobId: string;
  durationMs: number;
  failed: boolean;
  errorKey: string | null;
  serviceId: string;
  version: string;
  traceId: string;
  waitMs: number | null;
  attemptsMade: number | null;
  seed: number;
}

export interface LogEvent {
  id: string;
  appId: string;
  t: number;
  level: LogLevel;
  context: string;
  text: string;
  serviceId: string;
  traceId: string | null;
  spanId: string | null;
  attributes: Record<string, unknown> | null;
}

export interface OccurrenceEvent {
  key: string;
  appId: string;
  t: number;
  executionId: string;
  traceId: string;
  serviceId: string;
}

export interface ProjectState {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  createdAt: number;
  rangePresets: TimeRange[];
}

export interface ApplicationState {
  id: string;
  projectId: string;
  name: string;
  tags: string[];
  createdAt: number;
  def: ApplicationDef | null;
}

export interface TrimState extends StorageTrimDto {
  projectId: string;
}

const START = Date.now();
const DATA_START =
  Math.floor((START - HISTORY_DAYS * TIME.DAY) / TIME.MINUTE) * TIME.MINUTE;

export const requests: RequestEvent[] = [];
export const jobs: JobEvent[] = [];
export const logs: LogEvent[] = [];
export const occurrences: OccurrenceEvent[] = [];

export const errorGroupIds = new Map(
  ERRORS.map((def) => [def.key, uuid(createRng(hashString(def.key)))]),
);
export const errorByKey = new Map(ERRORS.map((def) => [def.key, def]));
export const errorById = new Map(
  ERRORS.map((def) => [errorGroupIds.get(def.key)!, def]),
);

/* Management data (projects, applications, keys, trims), mutable through the API. */

export const projects: ProjectState[] = PROJECTS.map((p) => ({
  id: p.id,
  slug: p.slug,
  name: p.name,
  description: p.description,
  createdAt: START - p.createdAgoMs,
  rangePresets: ['1h', '24h', '7d'],
}));

export const applications: ApplicationState[] = APPLICATIONS.map((a) => ({
  id: a.id,
  projectId: a.projectId,
  name: a.name,
  tags: [...a.tags],
  createdAt: START - a.createdAgoMs,
  def: a,
}));

const keyRng = createRng(7);
export const apiKeys: Array<ApiKeyDto & { projectId: string }> =
  APPLICATIONS.flatMap((a) => [
    {
      projectId: a.projectId,
      id: uuid(keyRng),
      appKey: `obs_${hex(keyRng, 24)}`,
      applicationId: a.id,
      applicationName: a.name,
      name: 'production',
      createdAt: new Date(START - a.createdAgoMs).toISOString(),
      revokedAt: null,
      status: 'active' as const,
    },
    {
      projectId: a.projectId,
      id: uuid(keyRng),
      appKey: `obs_${hex(keyRng, 24)}`,
      applicationId: a.id,
      applicationName: a.name,
      name: 'staging (rotated)',
      createdAt: new Date(START - a.createdAgoMs + TIME.DAY).toISOString(),
      revokedAt: new Date(START - 9 * TIME.DAY).toISOString(),
      status: 'revoked' as const,
    },
  ]);

export const trims: TrimState[] = [];

/* Traffic shape. */

/** 0.2..1: a daily curve peaking mid-afternoon UTC, quieter at weekends. */
export function load(t: number): number {
  const date = new Date(t);
  const hours = date.getUTCHours() + date.getUTCMinutes() / 60;
  const daily = 0.5 + 0.5 * Math.sin((2 * Math.PI * (hours - 9)) / 24);
  const weekend = date.getUTCDay() === 0 || date.getUTCDay() === 6 ? 0.65 : 1;
  const wobble = 1 + 0.12 * noise('load', t / (15 * TIME.MINUTE));
  return Math.max(0.2, (0.3 + 0.7 * daily) * weekend * wobble);
}

function deployedAt(
  app: ApplicationDef,
  index: number,
  instance: number,
): number {
  const agoMs = app.versions[index]!.agoMs;
  let at = START - agoMs;
  // Deploys older than a day happen in office hours (14:10 UTC that day).
  if (agoMs >= TIME.DAY)
    at =
      Math.floor(at / TIME.DAY) * TIME.DAY + 14 * TIME.HOUR + 10 * TIME.MINUTE;
  // Rolling deploys: each instance switches two minutes after the previous one.
  return at + instance * 2 * TIME.MINUTE;
}

export function versionAt(
  app: ApplicationDef,
  instance: number,
  t: number,
): string {
  let version = app.versions[0]!.version;
  app.versions.forEach((v, i) => {
    if (deployedAt(app, i, instance) <= t) version = v.version;
  });
  return version;
}

export function releaseBoundary(app: ApplicationDef, version: string): number {
  const index = app.versions.findIndex((v) => v.version === version);
  return deployedAt(app, index, 0);
}

const appDefs = new Map(APPLICATIONS.map((a) => [a.id, a]));
export const appDef = (id: string) => appDefs.get(id);

/* Generation. */

const rng = createRng(20261031);
let generatedUntil = DATA_START;

/** Inserts keeping `t` ascending; events arrive almost sorted, so this is cheap. */
function insert<T extends { t: number }>(list: T[], item: T): void {
  let i = list.length;
  while (i > 0 && list[i - 1]!.t > item.t) i--;
  if (i === list.length) list.push(item);
  else list.splice(i, 0, item);
}

function effectOf(
  byVersion: Record<string, VersionEffect> | undefined,
  version: string,
): VersionEffect {
  return byVersion?.[version] ?? {};
}

function pickUser(r: Rng): string | null {
  if (r() < 0.2) return null;
  return USERS[Math.floor(r() ** 2 * USERS.length)]!;
}

function addLog(log: Omit<LogEvent, 'id'>): void {
  insert(logs, { ...log, id: uuidV7(rng, log.t) });
}

function addOccurrence(
  error: ErrorDef,
  t: number,
  executionId: string,
  traceId: string,
  serviceId: string,
) {
  insert(occurrences, {
    key: error.key,
    appId: error.appId,
    t,
    executionId,
    traceId,
    serviceId,
  });
  addLog({
    appId: error.appId,
    t: t + 1,
    level: 'error',
    context:
      error.culprit.includes('/') && error.source === 'job'
        ? 'WorkerHost'
        : 'ExceptionsHandler',
    text: `${error.errorClass}: ${error.message}`,
    serviceId,
    traceId,
    spanId: hex(rng, 16),
    attributes: { stack: error.stack.split('\n').slice(0, 3).join('\n') },
  });
}

function runJob(
  job: JobDef,
  t: number,
  traceId: string,
  waitMs: number | null,
): void {
  const app = appDef(job.appId)!;
  const instance =
    job.everyMinuteAt === null ? Math.floor(rng() * app.instances.length) : 0;
  const version = versionAt(app, instance, t);
  const effect = effectOf(job.byVersion, version);
  const failed = rng() < job.failRate + (effect.errorRate ?? 0);
  const event: JobEvent = {
    id: uuidV7(rng, t),
    appId: job.appId,
    t,
    job,
    jobId:
      job.everyMinuteAt === null
        ? String(10_000 + Math.floor(rng() * 90_000))
        : `${job.name}:${Math.floor(t / TIME.MINUTE)}`,
    durationMs: round(
      logNormal(rng, job.medianMs * (effect.latency ?? 1), job.spread),
    ),
    failed,
    errorKey: failed ? (job.errorKey ?? null) : null,
    serviceId: app.instances[instance]!,
    version,
    traceId,
    waitMs,
    attemptsMade:
      job.maxAttempts === null ? null : failed ? job.maxAttempts : 1,
    seed: Math.floor(rng() * 2 ** 31),
  };
  insert(jobs, event);
  const error = event.errorKey ? errorByKey.get(event.errorKey) : undefined;
  if (error)
    addOccurrence(
      error,
      t + event.durationMs,
      event.id,
      traceId,
      event.serviceId,
    );
  else
    addLog({
      appId: job.appId,
      t: t + event.durationMs,
      level: 'log',
      context: job.log.context,
      text: job.log.text(rng()),
      serviceId: event.serviceId,
      traceId,
      spanId: hex(rng, 16),
      attributes: null,
    });
}

function runRequest(op: OperationDef, t: number): void {
  const app = appDef(op.appId)!;
  const instance = Math.floor(rng() * app.instances.length);
  const version = versionAt(app, instance, t);
  const effect = effectOf(op.byVersion, version);
  const errorRate = op.errorRate + (effect.errorRate ?? 0);
  const roll = rng();
  const hasError = roll < errorRate;
  const clientError =
    !hasError && op.clientError && roll < errorRate + op.clientError.rate;
  const statusCode = hasError
    ? (op.errorStatus ?? 500)
    : clientError
      ? op.clientError!.status
      : op.method === 'POST'
        ? 201
        : 200;
  const durationMs = round(
    logNormal(rng, op.medianMs * (effect.latency ?? 1), op.spread) *
      (clientError ? 0.4 : 1),
  );
  const event: RequestEvent = {
    id: uuidV7(rng, t),
    appId: op.appId,
    t,
    op,
    url: op.url(rng()),
    durationMs,
    statusCode,
    hasError,
    errorKey: hasError ? (op.errorKey ?? null) : null,
    userId: op.users ? pickUser(rng) : null,
    serviceId: app.instances[instance]!,
    version,
    traceId: hex(rng, 32),
    seed: Math.floor(rng() * 2 ** 31),
  };
  insert(requests, event);

  const error = event.errorKey ? errorByKey.get(event.errorKey) : undefined;
  if (error)
    addOccurrence(
      error,
      t + durationMs,
      event.id,
      event.traceId,
      event.serviceId,
    );
  if (hasError || clientError) return;

  for (const log of op.logs ?? []) {
    if (rng() >= log.chance) continue;
    addLog({
      appId: op.appId,
      t: t + durationMs * 0.8,
      level: log.level,
      context: log.context,
      text: log.text(rng()),
      serviceId: event.serviceId,
      traceId: event.traceId,
      spanId: hex(rng, 16),
      attributes: event.userId
        ? { userId: event.userId, path: event.url }
        : null,
    });
  }
  if (rng() < 0.03) {
    addLog({
      appId: op.appId,
      t: t + 0.5,
      level: 'debug',
      context: 'CacheService',
      text: `Cache miss for ${event.url}`,
      serviceId: event.serviceId,
      traceId: event.traceId,
      spanId: hex(rng, 16),
      attributes: null,
    });
  }
  if (op.enqueues) {
    const job = JOBS.find((j) => `${j.queue}/${j.name}` === op.enqueues);
    const wait = round(logNormal(rng, 40, 0.8));
    if (job) runJob(job, t + durationMs + wait, event.traceId, wait);
  }
}

function generateMinute(m: number): void {
  const level = load(m);
  for (const op of OPERATIONS) {
    const count = poisson(rng, op.rate * (op.steady ? 1 : level));
    for (let i = 0; i < count; i++) runRequest(op, m + rng() * TIME.MINUTE);
  }
  for (const job of JOBS) {
    if (job.everyMinuteAt !== null) {
      runJob(
        job,
        m + job.everyMinuteAt * 1000 + rng() * 40,
        hex(rng, 32),
        null,
      );
      continue;
    }
    const count = poisson(rng, job.rate * level);
    for (let i = 0; i < count; i++)
      runJob(
        job,
        m + rng() * TIME.MINUTE,
        hex(rng, 32),
        round(logNormal(rng, 60, 1)),
      );
  }
  if (rng() < 0.02 * level) {
    const app = APPLICATIONS[Math.floor(rng() * APPLICATIONS.length)]!;
    addLog({
      appId: app.id,
      t: m + rng() * TIME.MINUTE,
      level: 'warn',
      context: 'HealthIndicator',
      text: `Event loop lag above 50ms on ${app.instances[0]}`,
      serviceId: app.instances[0]!,
      traceId: null,
      spanId: null,
      attributes: null,
    });
  }
  // The agent logs its own startup once per instance per deploy.
  for (const app of APPLICATIONS) {
    app.instances.forEach((serviceId, instance) => {
      app.versions.forEach((v, index) => {
        const at = deployedAt(app, index, instance);
        if (at >= m && at < m + TIME.MINUTE)
          addLog({
            appId: app.id,
            t: at,
            level: 'log',
            context: 'NestApplication',
            text: `Nest application successfully started (v${v.version})`,
            serviceId,
            traceId: null,
            spanId: null,
            attributes: { version: v.version },
          });
      });
    });
  }
}

/** Generates every whole minute up to now. Called before each query. */
export function catchUp(now = Date.now()): void {
  const until = Math.floor(now / TIME.MINUTE) * TIME.MINUTE;
  while (generatedUntil <= until) {
    generateMinute(generatedUntil);
    generatedUntil += TIME.MINUTE;
  }
}

export const dataStart = DATA_START;

/* Spans, rebuilt on demand from the templates. */

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function buildSpans(
  templates: SpanTemplate[],
  parentStart: number,
  parentDuration: number,
  r: Rng,
  error: WireErrorDto | null,
): TraceSpanDto[] {
  let cursor = parentStart + parentDuration * 0.02;
  return templates.map((template) => {
    const duration = round(parentDuration * template.share * (0.9 + r() * 0.2));
    const start = round(cursor);
    cursor = start + duration;
    const failed = error !== null && template.fails === true;
    return {
      className: template.className,
      methodName: template.methodName,
      name: template.name ?? null,
      origin: template.origin ?? 'auto',
      spanId: hex(r, 16),
      startOffsetMs: start,
      durationMs: duration,
      error: failed ? error : null,
      tags: template.tags ?? {},
      children: buildSpans(template.children ?? [], start, duration, r, error),
    };
  });
}

export function spansOf(
  templates: SpanTemplate[],
  durationMs: number,
  seed: number,
  error: WireErrorDto | null,
): TraceSpanDto[] {
  return buildSpans(templates, 0, durationMs, createRng(seed), error);
}

/**
 * Own and total time of each class/method in a template tree for one execution
 * of `durationMs`, matching the shares used by `spansOf` on average.
 */
export function spanTimes(
  templates: SpanTemplate[],
  durationMs: number,
  visit: (template: SpanTemplate, totalMs: number, selfMs: number) => void,
): void {
  for (const template of templates) {
    const total = durationMs * template.share;
    const childShare = (template.children ?? []).reduce(
      (sum, c) => sum + c.share,
      0,
    );
    visit(template, total, Math.max(0, total * (1 - childShare)));
    spanTimes(template.children ?? [], total, visit);
  }
}

export function wireError(key: string | null): WireErrorDto | null {
  const def = key ? errorByKey.get(key) : undefined;
  return def
    ? { cls: def.errorClass, message: def.message, stack: def.stack }
    : null;
}

/* Runtime samples, computed from the traffic curve (nothing stored). */

export interface RuntimeSample {
  cpuPercent: number;
  memoryRss: number;
  memoryPercent: number;
  heapUsed: number;
  heapTotal: number;
  eventLoopLagMs: number;
  eventLoopUtilization: number;
  gcMinor: number;
  gcMajor: number;
  gcIncremental: number;
}

export function runtimeSample(
  app: ApplicationDef,
  instance: number,
  t: number,
): RuntimeSample {
  const key = `${app.id}:${instance}`;
  const level = load(t);
  const n = noise(key, t / TIME.MINUTE);
  const version = versionAt(app, instance, t);
  // 1.5.0 leaks a little memory until the next deploy restarts the process.
  const sinceDeploy = (t - releaseBoundary(app, version)) / TIME.HOUR;
  const leak = version === '1.5.0' ? Math.min(160, sinceDeploy * 2.2) : 0;
  const rss = app.runtime.rss + 38 * level + leak + 6 * n;
  const heapTotal = rss * 0.62;
  return {
    cpuPercent: Math.max(0.5, app.runtime.cpu + 26 * level + 4 * n),
    memoryRss: rss,
    memoryPercent: (rss / 4096) * 100,
    heapTotal,
    heapUsed: heapTotal * (0.68 + 0.12 * n),
    eventLoopLagMs: Math.max(0.3, 1.1 + 5 * level ** 2 + 0.8 * n),
    eventLoopUtilization: Math.min(0.95, 0.04 + 0.32 * level + 0.03 * n),
    gcMinor: Math.max(0, Math.round(14 * level + 3 * n)),
    gcMajor: n > 0.85 ? 1 : 0,
    gcIncremental: Math.max(0, Math.round(2 * level + n)),
  };
}

export function newId(): string {
  return uuid(rng);
}

export function newSecret(): string {
  return `obs_sk_${hex(rng, 40)}`;
}

export function newAppKey(): string {
  return `obs_${hex(rng, 24)}`;
}
