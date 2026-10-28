import type { TimeRange } from '@selfhosted-observe/contracts';

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

/** The global filters every query is scoped by (kept in the URL by the root route). */
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
