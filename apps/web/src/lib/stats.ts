import type { TimeBucketDto } from '@/lib/api/generated/api';
import type { TimeWindow } from './api/scope';
import { windowBounds, windowMs } from './time-window';

/** The window of the same length right before `window`, as ISO from/to. */
export function previousWindow(window: TimeWindow, now = Date.now()) {
  const { from, to } = windowBounds(window, now);
  const span = to - from;
  return {
    from: new Date(from - span).toISOString(),
    to: new Date(from).toISOString(),
  };
}

/** Throughput like "2.4/s" or "33/min", whichever reads better. */
export function formatThroughput(count: number, window: TimeWindow): string {
  const perSecond = count / (windowMs(window) / 1000);
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
