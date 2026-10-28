import type { TimeRange } from '@/lib/api/generated/api';
import { z } from 'zod';
import { optionalEnum, optionalString } from '../search';

/** Maintainer decision: the dashboard only offers these three ranges. */
export const TIME_RANGES = [
  '1h',
  '24h',
  '7d',
] as const satisfies readonly TimeRange[];

export const DEFAULT_RANGE: TimeRange = '1h';

export const TIME_RANGE_LABELS: Record<(typeof TIME_RANGES)[number], string> = {
  '1h': 'Last hour',
  '24h': 'Last 24 hours',
  '7d': 'Last 7 days',
};

/** Search params kept across navigation by ScopedLink / useScopedNavigate. */
export const SCOPE_KEYS = ['application', 'range'] as const;

export const scopeSearchSchema = z.object({
  application: optionalString,
  range: optionalEnum(TIME_RANGES),
});

/**
 * The filters every telemetry query is scoped by. `project` (id or slug) comes
 * from the route path; `application` and `range` from the search params. The
 * field names match the API's query params, so a Scope can be spread into a call.
 */
export interface Scope {
  project: string;
  application: string | undefined;
  range: TimeRange;
}

export function scopeFromParams(
  project: string,
  params: URLSearchParams,
): Scope {
  const search = scopeSearchSchema.parse(Object.fromEntries(params));
  return {
    project,
    application: search.application,
    range: search.range ?? DEFAULT_RANGE,
  };
}

/** Just the range from the search params (pages outside a project). */
export function rangeFromParams(params: URLSearchParams): TimeRange {
  return (
    scopeSearchSchema.parse(Object.fromEntries(params)).range ?? DEFAULT_RANGE
  );
}
