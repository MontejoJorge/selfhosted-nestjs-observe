import { BadRequestException } from '@nestjs/common';
import type { TimeBucketDto } from './common.dto.js';
import {
  MAX_WINDOW_DAYS,
  TIME_RANGES,
  type RangeQueryDto,
  type TimeRange,
} from './query.dto.js';

/** Half-open interval [from, to). Every query filters its partition key on it. */
export interface TimeWindow {
  from: Date;
  to: Date;
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
export const RANGE_MS: Record<TimeRange, number> = {
  '1h': HOUR,
  '3h': 3 * HOUR,
  '6h': 6 * HOUR,
  '12h': 12 * HOUR,
  '24h': DAY,
  '3d': 3 * DAY,
  '7d': 7 * DAY,
  '15d': 15 * DAY,
};
const DEFAULT_RANGE: TimeRange = '1h';
const MAX_WINDOW_MS = MAX_WINDOW_DAYS * DAY;

/**
 * `from`/`to` win over `range`; `to` defaults to now and `from` to `to - range` (1h by
 * default). A custom window must have `from` before `to` and span at most 31 days.
 */
export function resolveWindow(query: RangeQueryDto): TimeWindow {
  const to = query.to ? new Date(query.to) : new Date();
  const from = query.from
    ? new Date(query.from)
    : new Date(to.getTime() - RANGE_MS[query.range ?? DEFAULT_RANGE]);
  if (from >= to) throw new BadRequestException('`from` must be before `to`');
  if (to.getTime() - from.getTime() > MAX_WINDOW_MS)
    throw new BadRequestException(
      `\`from\` and \`to\` must be at most ${MAX_WINDOW_DAYS} days apart`,
    );
  return { from, to };
}

/** Distinct ranges sorted by duration, shortest first. */
export function sortRanges(ranges: readonly TimeRange[]): TimeRange[] {
  return TIME_RANGES.filter((range) => ranges.includes(range));
}

/** Bucket widths, in seconds, that timelines may use. */
const STEPS = [60, 300, 900, 1800, 3600, 10800, 21600, 43200, 86400];
const MAX_BUCKETS = 100;

/**
 * Smallest bucket width giving at most ~100 buckets. For the presets: 1h -> 1 min (60
 * buckets), 3h -> 5 min (36), 6h -> 5 min (72), 12h -> 15 min (48), 24h -> 15 min (96),
 * 3d -> 1 h (72), 7d -> 3 h (56), 15d -> 6 h (60). Custom windows (at most 31 days) pick
 * from the same widths (31 days -> 12 h, 62 buckets). Widths of 15 min or more divide
 * whole quarters and those of 1 h or more whole hours, which the users rollups rely on.
 */
export function bucketSeconds(window: TimeWindow): number {
  const spanSeconds = (window.to.getTime() - window.from.getTime()) / 1000;
  return (
    STEPS.find((step) => spanSeconds / step <= MAX_BUCKETS) ??
    Math.ceil(spanSeconds / MAX_BUCKETS)
  );
}

/** Origin for `date_bin`; buckets align to multiples of the width since this instant. */
export const BUCKET_ORIGIN = '2000-01-01T00:00:00Z';

/** Start (epoch ms) of every `stepSeconds` bucket overlapping the window, in order. */
export function bucketStarts(
  window: TimeWindow,
  stepSeconds: number,
): number[] {
  const stepMs = stepSeconds * 1000;
  const origin = Date.parse(BUCKET_ORIGIN);
  const starts: number[] = [];
  const first =
    origin + Math.floor((window.from.getTime() - origin) / stepMs) * stepMs;
  for (let start = first; start < window.to.getTime(); start += stepMs)
    starts.push(start);
  return starts;
}

/** Fills a sparse timeline so every bucket in the window is present. */
export function fillTimeline(
  window: TimeWindow,
  stepSeconds: number,
  rows: Array<{
    t: Date;
    count: number;
    errors: number;
    p95: number | null;
    avg: number | null;
    status4xx?: number;
    status5xx?: number;
  }>,
): TimeBucketDto[] {
  const byStart = new Map(rows.map((row) => [row.t.getTime(), row]));
  return bucketStarts(window, stepSeconds).map((start) => {
    const row = byStart.get(start);
    return {
      t: new Date(start).toISOString(),
      count: row?.count ?? 0,
      errors: row?.errors ?? 0,
      p95: row?.p95 ?? 0,
      avg: row?.avg ?? 0,
      status4xx: row?.status4xx ?? 0,
      status5xx: row?.status5xx ?? 0,
    };
  });
}
