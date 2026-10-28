import { BadRequestException } from '@nestjs/common';
import type { TimeBucket, TimeRange } from '@selfhosted-observe/contracts';
import type { RangeQueryDto } from './query.dto.js';

/** Half-open interval [from, to). Every query filters its partition key on it. */
export interface TimeWindow {
  from: Date;
  to: Date;
}

const MINUTE = 60_000;
const RANGE_MS: Record<TimeRange, number> = {
  '1h': 60 * MINUTE,
  '24h': 24 * 60 * MINUTE,
  '7d': 7 * 24 * 60 * MINUTE,
};
const DEFAULT_RANGE: TimeRange = '1h';

/** `from`/`to` win over `range`; `to` defaults to now and `from` to `to - range` (1h by default). */
export function resolveWindow(query: RangeQueryDto): TimeWindow {
  const to = query.to ? new Date(query.to) : new Date();
  const from = query.from
    ? new Date(query.from)
    : new Date(to.getTime() - RANGE_MS[query.range ?? DEFAULT_RANGE]);
  if (from >= to) throw new BadRequestException('`from` must be before `to`');
  return { from, to };
}

/** Bucket widths, in seconds, that timelines may use. */
const STEPS = [60, 300, 900, 1800, 3600, 10800, 21600, 43200, 86400];
const MAX_BUCKETS = 100;

/**
 * Smallest bucket width giving at most ~100 buckets. For the supported ranges:
 * 1h -> 1 min (60 buckets), 24h -> 15 min (96), 7d -> 3 h (56).
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
): TimeBucket[] {
  const stepMs = stepSeconds * 1000;
  const origin = Date.parse(BUCKET_ORIGIN);
  const byStart = new Map(rows.map((row) => [row.t.getTime(), row]));
  const buckets: TimeBucket[] = [];
  const first =
    origin + Math.floor((window.from.getTime() - origin) / stepMs) * stepMs;
  for (let start = first; start < window.to.getTime(); start += stepMs) {
    const row = byStart.get(start);
    buckets.push({
      t: new Date(start).toISOString(),
      count: row?.count ?? 0,
      errors: row?.errors ?? 0,
      p95: row?.p95 ?? 0,
      avg: row?.avg ?? 0,
      status4xx: row?.status4xx ?? 0,
      status5xx: row?.status5xx ?? 0,
    });
  }
  return buckets;
}
