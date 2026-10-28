import type { TimeRange } from '@/lib/api/generated/api';
import { z } from 'zod';
import { optionalEnum, optionalString } from '../search';

export const TIME_RANGES = [
  '15m',
  '1h',
  '6h',
  '24h',
  '7d',
  '14d',
] as const satisfies readonly TimeRange[];

export const DEFAULT_RANGE: TimeRange = '1h';

export const TIME_RANGE_LABELS: Record<TimeRange, string> = {
  '15m': 'Last 15 minutes',
  '1h': 'Last hour',
  '6h': 'Last 6 hours',
  '24h': 'Last 24 hours',
  '7d': 'Last 7 days',
  '14d': 'Last 14 days',
};

/** Search params kept across navigation by ScopedLink / useScopedNavigate. */
export const SCOPE_KEYS = ['service', 'range'] as const;

export const scopeSearchSchema = z.object({
  service: optionalString,
  range: optionalEnum(TIME_RANGES),
});

/** The global filters every query is scoped by. */
export interface Scope {
  service: string | undefined;
  range: TimeRange;
}

export function toScope(search: {
  service?: string;
  range?: TimeRange;
}): Scope {
  return { service: search.service, range: search.range ?? DEFAULT_RANGE };
}

export function scopeFromParams(params: URLSearchParams): Scope {
  return toScope(scopeSearchSchema.parse(Object.fromEntries(params)));
}
