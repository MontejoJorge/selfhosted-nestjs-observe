import type { TimeBucketDto, TimeRange } from '@/lib/api/generated/api';

const RANGE_MS: Record<TimeRange, number> = {
  '1h': 60 * 60_000,
  '24h': 24 * 60 * 60_000,
  '7d': 7 * 24 * 60 * 60_000,
};

export function rangeMs(range: TimeRange): number {
  return RANGE_MS[range];
}

/** The window right before the current relative range, as ISO from/to. */
export function previousWindow(range: TimeRange, now = Date.now()) {
  const span = rangeMs(range);
  return {
    from: new Date(now - 2 * span).toISOString(),
    to: new Date(now - span).toISOString(),
  };
}

/** Throughput like "2.4/s" or "33/min", whichever reads better. */
export function formatThroughput(count: number, range: TimeRange): string {
  const perSecond = count / (rangeMs(range) / 1000);
  if (perSecond >= 1) return `${perSecond.toFixed(1)}/s`;
  const perMinute = perSecond * 60;
  if (perMinute >= 1) return `${Math.round(perMinute)}/min`;
  return `${(perMinute * 60).toFixed(1)}/h`;
}

/** Relative change, or `null` when there is nothing to compare with. */
export function relativeChange(
  current: number,
  previous: number,
): number | null {
  if (!Number.isFinite(previous) || previous <= 0) return null;
  return (current - previous) / previous;
}

const longDate = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

/** "October 28, 2026 4:10 PM". */
export function formatLongDate(iso: string): string {
  return longDate.format(new Date(iso)).replace(' at ', ' ');
}

const clock = new Intl.DateTimeFormat('en-US', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

export function formatClock(iso: string): string {
  return clock.format(new Date(iso));
}

/** The bucket with the highest value of `pick`, or undefined for an empty series. */
export function peakBucket(
  buckets: readonly TimeBucketDto[],
  pick: (bucket: TimeBucketDto) => number,
): TimeBucketDto | undefined {
  let best: TimeBucketDto | undefined;
  for (const bucket of buckets) {
    if (!best || pick(bucket) > pick(best)) best = bucket;
  }
  return best;
}

/** Min and max of `pick` over buckets that had traffic. */
export function bucketSpread(
  buckets: readonly TimeBucketDto[],
  pick: (bucket: TimeBucketDto) => number,
): { min: number; max: number } | null {
  let min = Infinity;
  let max = -Infinity;
  for (const bucket of buckets) {
    if (bucket.count === 0) continue;
    const value = pick(bucket);
    if (value < min) min = value;
    if (value > max) max = value;
  }
  return Number.isFinite(min) ? { min, max } : null;
}
