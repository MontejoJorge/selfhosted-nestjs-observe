import type { StorageUsageTable } from '@/lib/api/generated/api';

/** Display names of the raw telemetry tables. */
export const TABLE_LABELS: Record<StorageUsageTable, string> = {
  requests: 'Requests',
  logs: 'Logs',
  error_occurrences: 'Errors',
  jobs: 'Jobs',
  runtime_metrics: 'Runtime metrics',
  custom_metrics: 'Custom metrics',
  profiles: 'Profiles',
};

export function tableLabel(table: string): string {
  return TABLE_LABELS[table as StorageUsageTable] ?? table;
}

/**
 * The stacked series of the storage bars, in a fixed order: the three tables that
 * hold most of the data get a hue, the rest fold into "Other" (grey).
 */
export const USAGE_SERIES = [
  { key: 'requests', label: 'Requests', color: 'var(--usage-1)' },
  { key: 'logs', label: 'Logs', color: 'var(--usage-2)' },
  { key: 'error_occurrences', label: 'Errors', color: 'var(--usage-3)' },
  { key: 'other', label: 'Other', color: 'var(--chart-3)' },
] as const;

export type UsageSeriesKey = (typeof USAGE_SERIES)[number]['key'];

export function seriesOf(table: string): UsageSeriesKey {
  return table === 'requests' ||
    table === 'logs' ||
    table === 'error_occurrences'
    ? table
    : 'other';
}

export interface UsagePart {
  table: string;
  bytes: number;
  rows?: number | null;
}

export interface UsageSegment {
  key: UsageSeriesKey;
  label: string;
  color: string;
  bytes: number;
}

/** Sums table parts into the fixed series (empty series are dropped). */
export function toSegments(parts: readonly UsagePart[]): UsageSegment[] {
  const sums = new Map<UsageSeriesKey, number>();
  for (const part of parts) {
    const key = seriesOf(part.table);
    sums.set(key, (sums.get(key) ?? 0) + part.bytes);
  }
  return USAGE_SERIES.flatMap((series) => {
    const bytes = sums.get(series.key) ?? 0;
    return bytes > 0 ? [{ ...series, bytes }] : [];
  });
}

const DAY_MS = 86_400_000;

/** Today's UTC day as `YYYY-MM-DD`. */
export function utcToday(now = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

/** `day` plus `delta` days, both `YYYY-MM-DD` (UTC). */
export function addDays(day: string, delta: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + delta * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

/** Whole days from `from` to `to` (`YYYY-MM-DD`). */
export function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS,
  );
}

/**
 * The first kept day of a trim, as the API computes it: today (UTC) minus
 * `keepDays`. Rows of earlier days are deleted.
 */
export function trimCutoffDay(keepDays: number, today = utcToday()): string {
  return addDays(today, -keepDays);
}

/**
 * Days left before retention drops `day`: it keeps the partitions from
 * `today - retentionDays` on, so `day` goes on `day + retentionDays + 1`.
 */
export function daysUntilDropped(
  day: string,
  retentionDays: number,
  today = utcToday(),
): number {
  return daysBetween(today, addDays(day, retentionDays + 1));
}

/** "1.93 GB" → ["1.93", "GB"], for BigNumber's value and unit. */
export function splitValue(formatted: string): [string, string | undefined] {
  const [value, unit] = formatted.split(' ');
  return [value, unit];
}
