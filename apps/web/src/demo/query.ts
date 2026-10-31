/** Window, bucket and statistics helpers mirroring the API's query semantics. */

import type {
  ExecutionStatsDto,
  PercentilesDto,
  TimeBucketDto,
  TimeRange,
} from '@/lib/api/generated/api';
import { TIME_RANGE_INFO } from '@/lib/api/scope';
import { HttpResponse } from 'msw';
import {
  applications,
  catchUp,
  projects,
  type ApplicationState,
  type ProjectState,
} from './store';

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function errorResponse(error: unknown) {
  if (error instanceof ApiError)
    return HttpResponse.json(
      { statusCode: error.status, message: error.message },
      { status: error.status },
    );
  throw error;
}

export interface Window {
  from: number;
  to: number;
}

/** `from`/`to` when given, else the relative `range` (default 1h) ending now. */
export function windowOf(params: URLSearchParams): Window {
  const now = Date.now();
  catchUp(now);
  const from = params.get('from');
  if (from) {
    const to = params.get('to');
    return { from: Date.parse(from), to: to ? Date.parse(to) : now };
  }
  const range = (params.get('range') ?? '1h') as TimeRange;
  const ms = TIME_RANGE_INFO[range]?.ms ?? TIME_RANGE_INFO['1h'].ms;
  return { from: now - ms, to: now };
}

const STEPS = [60, 300, 900, 1800, 3600, 10800, 21600, 43200, 86400];

export function bucketMs({ from, to }: Window): number {
  const span = (to - from) / 1000;
  return (
    (STEPS.find((step) => span / step <= 100) ?? Math.ceil(span / 100)) * 1000
  );
}

const ORIGIN = Date.parse('2000-01-01T00:00:00Z');

export function bucketStarts(window: Window, step: number): number[] {
  const starts: number[] = [];
  const first = ORIGIN + Math.floor((window.from - ORIGIN) / step) * step;
  for (let start = first; start < window.to; start += step) starts.push(start);
  return starts;
}

/** Groups items into the window's buckets (same starts as `bucketStarts`). */
export function bucketize<T extends { t: number }>(
  window: Window,
  items: readonly T[],
  step = bucketMs(window),
): Array<{ t: number; items: T[] }> {
  const starts = bucketStarts(window, step);
  const buckets = starts.map((t) => ({ t, items: [] as T[] }));
  const first = starts[0] ?? window.from;
  for (const item of items) {
    const index = Math.floor((item.t - first) / step);
    buckets[index]?.items.push(item);
  }
  return buckets;
}

/** Items of an ascending list with `from <= t < to`. */
export function within<T extends { t: number }>(
  list: readonly T[],
  { from, to }: Window,
): T[] {
  return list.slice(lowerBound(list, from), lowerBound(list, to));
}

function lowerBound(list: readonly { t: number }[], t: number): number {
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid]!.t < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

const round = (value: number) => Math.round(value * 100) / 100;

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!;
}

export function percentiles(durations: number[]): PercentilesDto {
  const sorted = [...durations].sort((a, b) => a - b);
  const avg = sorted.length
    ? sorted.reduce((s, d) => s + d, 0) / sorted.length
    : 0;
  return {
    p50: round(quantile(sorted, 0.5)),
    p95: round(quantile(sorted, 0.95)),
    p99: round(quantile(sorted, 0.99)),
    avg: round(avg),
  };
}

export function executionStats(
  items: ReadonlyArray<{ durationMs: number; failed: boolean }>,
): ExecutionStatsDto {
  const latency = percentiles(items.map((i) => i.durationMs));
  const errors = items.filter((i) => i.failed).length;
  return {
    count: items.length,
    errors,
    errorRate: items.length ? errors / items.length : 0,
    avgMs: latency.avg,
    p95Ms: latency.p95,
  };
}

export function timeBucket(
  t: number,
  items: ReadonlyArray<{
    durationMs: number;
    failed: boolean;
    statusCode?: number;
  }>,
): TimeBucketDto {
  const latency = percentiles(items.map((i) => i.durationMs));
  return {
    t: new Date(t).toISOString(),
    count: items.length,
    errors: items.filter((i) => i.failed).length,
    avg: latency.avg,
    p95: latency.p95,
    status4xx: items.filter(
      (i) => (i.statusCode ?? 0) >= 400 && (i.statusCode ?? 0) < 500,
    ).length,
    status5xx: items.filter((i) => (i.statusCode ?? 0) >= 500).length,
  };
}

export function page<T>(
  items: readonly T[],
  params: URLSearchParams,
  defaultLimit = 50,
) {
  const offset = Number(params.get('cursor') ?? 0) || 0;
  const limit = Number(params.get('limit') ?? defaultLimit) || defaultLimit;
  const slice = items.slice(offset, offset + limit);
  return {
    items: slice,
    nextCursor: offset + limit < items.length ? String(offset + limit) : null,
  };
}

export function findProject(ref: string | null): ProjectState {
  const project = projects.find((p) => p.id === ref || p.slug === ref);
  if (!project) throw new ApiError(404, `Project ${ref} not found`);
  return project;
}

/**
 * The application ids a telemetry query covers: the project's, or the one
 * `application` names (which must belong to the project).
 */
export function scopeApps(
  params: URLSearchParams,
  projectRef?: string,
): Set<string> {
  const project = findProject(projectRef ?? params.get('project'));
  const application = params.get('application');
  const apps = applications.filter((a) => a.projectId === project.id);
  if (!application) return new Set(apps.map((a) => a.id));
  if (!apps.some((a) => a.id === application))
    throw new ApiError(
      404,
      `Application ${application} not found in this project`,
    );
  return new Set([application]);
}

export function findApplication(
  projectId: string,
  id: string,
): ApplicationState {
  const app = applications.find(
    (a) => a.id === id && a.projectId === projectId,
  );
  if (!app) throw new ApiError(404, `Application ${id} not found`);
  return app;
}

export const iso = (t: number) => new Date(t).toISOString();
