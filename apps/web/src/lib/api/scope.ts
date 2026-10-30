import type { TimeRange } from '@/lib/api/generated/api';
import { z } from 'zod';
import { optionalEnum, optionalString } from '../search';

const HOUR_MS = 60 * 60_000;
const DAY_MS = 24 * HOUR_MS;

/**
 * Every preset the API knows, shortest first: the single source of truth for
 * their length and labels. `Record<TimeRange, …>` fails to compile when the API
 * adds one.
 */
export const TIME_RANGE_INFO: Record<
  TimeRange,
  { ms: number; label: string; short: string }
> = {
  '1h': { ms: HOUR_MS, label: 'Last hour', short: '1H' },
  '3h': { ms: 3 * HOUR_MS, label: 'Last 3 hours', short: '3H' },
  '6h': { ms: 6 * HOUR_MS, label: 'Last 6 hours', short: '6H' },
  '12h': { ms: 12 * HOUR_MS, label: 'Last 12 hours', short: '12H' },
  '24h': { ms: DAY_MS, label: 'Last 24 hours', short: '24H' },
  '3d': { ms: 3 * DAY_MS, label: 'Last 3 days', short: '3D' },
  '7d': { ms: 7 * DAY_MS, label: 'Last 7 days', short: '7D' },
  '15d': { ms: 15 * DAY_MS, label: 'Last 15 days', short: '15D' },
};

export const TIME_RANGES = Object.keys(TIME_RANGE_INFO) as [
  TimeRange,
  ...TimeRange[],
];

export const DEFAULT_RANGE: TimeRange = '1h';

/** The header's quick ranges when a project has not picked its own (API default). */
export const DEFAULT_RANGE_PRESETS: readonly TimeRange[] = ['1h', '24h', '7d'];

/** How many presets a project shows in its page headers (API rule). */
export const RANGE_PRESET_COUNT = 3;

/** The longest custom window the API accepts. */
export const MAX_WINDOW_DAYS = 31;
export const MAX_WINDOW_MS = MAX_WINDOW_DAYS * DAY_MS;

/** Search params kept across navigation by ScopedLink / useScopedNavigate. */
export const SCOPE_KEYS = ['application', 'range', 'from', 'to'] as const;

/** A full ISO 8601 date-time with an offset (`Z` or `+hh:mm`), as the API wants. */
const optionalDateTime = z
  .preprocess(
    (value) => (value === '' || value === null ? undefined : value),
    z.iso.datetime({ offset: true }).optional(),
  )
  .catch(undefined);

export const scopeSearchSchema = z.object({
  application: optionalString,
  range: optionalEnum(TIME_RANGES),
  from: optionalDateTime,
  to: optionalDateTime,
});

/**
 * The time window of a query: a relative preset, or a custom window when `from`
 * is set (the API ignores `range` then). `to` is only set together with `from`;
 * without it the window runs until now.
 */
export interface TimeWindow {
  range: TimeRange;
  from?: string;
  to?: string;
}

/**
 * The filters every telemetry query is scoped by. `project` (id or slug) comes
 * from the route path; `application` and the time window from the search params.
 * The field names match the API's query params, so a Scope can be spread into a call.
 */
export interface Scope extends TimeWindow {
  project: string;
  application: string | undefined;
}

/**
 * The window of parsed search params. A custom window the API would reject
 * (`from` after `to`, longer than 31 days, `to` alone) falls back to the preset,
 * like any other invalid param.
 */
function windowOf(search: z.output<typeof scopeSearchSchema>): TimeWindow {
  const range = search.range ?? DEFAULT_RANGE;
  if (!search.from) return { range };
  const from = Date.parse(search.from);
  const to = search.to ? Date.parse(search.to) : Date.now();
  if (!(from < to) || to - from > MAX_WINDOW_MS) return { range };
  // `range` is ignored by the API here: keep the default so keys don't vary on it.
  return search.to
    ? { range: DEFAULT_RANGE, from: search.from, to: search.to }
    : { range: DEFAULT_RANGE, from: search.from };
}

export function scopeFromParams(
  project: string,
  params: URLSearchParams,
): Scope {
  const search = scopeSearchSchema.parse(Object.fromEntries(params));
  return { project, application: search.application, ...windowOf(search) };
}

/** Just the time window from the search params (pages outside a project). */
export function windowFromParams(params: URLSearchParams): TimeWindow {
  return windowOf(scopeSearchSchema.parse(Object.fromEntries(params)));
}

/** Only the window fields of a scope, for query keys and calls that take no application. */
export function pickWindow({ range, from, to }: TimeWindow): TimeWindow {
  if (from === undefined) return { range };
  return to === undefined ? { range, from } : { range, from, to };
}
