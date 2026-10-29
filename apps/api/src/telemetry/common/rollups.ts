import { sql, type RawBuilder, type SqlBool } from 'kysely';
import {
  BUCKETS_PER_DOUBLING,
  LAST_BUCKET,
  histogramQuantiles,
} from '../../ingest/domain/latency-histogram.js';
import type { PercentilesDto } from './common.dto.js';
import { inApplications, type TelemetryScope } from './scope.js';
import type { TimeWindow } from './time-window.js';

/**
 * Helpers to read the per-minute rollups (`requests_1m`, `jobs_1m`).
 *
 * Stats come from one grouped query (sums, min, max) and percentiles from a second one
 * that unnests the histograms into `(bucket, count)` cells summed per group: cheaper
 * than merging arrays row by row. The cells are put back together in TS.
 */

/** Time column of a rollup table and the width of its buckets. */
export interface RollupGrain {
  column: string;
  ms: number;
}

/** `requests_1m` and `jobs_1m`. */
export const MINUTE_GRAIN: RollupGrain = { column: 'minute', ms: 60_000 };
/** `span_stats_5m`. */
export const FIVE_MINUTE_GRAIN: RollupGrain = {
  column: 'bucket',
  ms: 5 * 60_000,
};

/** Rollups cover whole buckets: the window starts at the bucket containing `from`. */
export function rollupWindow(
  window: TimeWindow,
  stepMs = MINUTE_GRAIN.ms,
): TimeWindow {
  return {
    from: new Date(Math.floor(window.from.getTime() / stepMs) * stepMs),
    to: window.to,
  };
}

/**
 * Filter of a rollup query: the scope's applications (and instance), the buckets of the
 * window, and equality on the optional `equals` columns. One expression, so it applies
 * to queries with and without the `histogramCells` from-item.
 */
export function inRollupScope(
  scope: TelemetryScope,
  window: TimeWindow,
  equals: Record<string, string | undefined> = {},
  grain: RollupGrain = MINUTE_GRAIN,
): RawBuilder<SqlBool> {
  const buckets = rollupWindow(window, grain.ms);
  const time = sql.ref(grain.column);
  const conditions: RawBuilder<unknown>[] = [
    inApplications('application_id', scope.applicationIds),
    sql`${time} >= ${buckets.from}`,
    sql`${time} < ${buckets.to}`,
  ];
  if (scope.instance) conditions.push(sql`service_id = ${scope.instance}`);
  for (const [column, value] of Object.entries(equals))
    if (value !== undefined)
      conditions.push(sql`${sql.ref(column)} = ${value}`);
  return sql<SqlBool>`${sql.join(conditions, sql` and `)}`;
}

/** From-item of the histogram cells of each rollup row: `cell.n` counts, `cell.i` bucket index + 1. */
export const histogramCells = sql<{
  n: number;
  i: number;
}>`unnest(histogram) with ordinality`.as<'cell'>(sql`cell(n, i)`);

export const nonEmptyCell = sql<boolean>`cell.n > 0`;
export const cellBucket = sql<number>`(cell.i - 1)::int4`;
export const cellCount = sql<number>`sum(cell.n)::int8`;

/**
 * Histogram bucket of a raw duration column, in SQL: the same index as `bucketIndex` in
 * `ingest/domain/latency-histogram.ts`. For the few raw rows a rollup read adds at the
 * edges of its window.
 */
export function histogramBucketOf(column: string): RawBuilder<number> {
  return sql<number>`case when ${sql.ref(column)} < 1 then 0 else least(floor(${sql.lit(BUCKETS_PER_DOUBLING)} * ln(${sql.ref(column)}) / ln(2))::int + 1, ${sql.lit(LAST_BUCKET)}) end`;
}

export const sumOf = (column: string) =>
  sql<number>`coalesce(sum(${sql.ref(column)}), 0)::float8`;
export const minOf = sql<number | null>`min(min_ms)`;
export const maxOf = sql<number | null>`max(max_ms)`;

/** Rebuilds one histogram per group key from summed cells. */
export function histogramsByKey<T extends { bucket: number; count: number }>(
  cells: T[],
  keyOf: (cell: T) => string,
): Map<string, number[]> {
  const histograms = new Map<string, number[]>();
  for (const cell of cells) {
    const key = keyOf(cell);
    let histogram = histograms.get(key);
    if (!histogram) histograms.set(key, (histogram = []));
    while (histogram.length <= cell.bucket) histogram.push(0);
    histogram[cell.bucket] += cell.count;
  }
  return histograms;
}

export interface LatencyTotals {
  count: number;
  sum_ms: number;
  min_ms: number | null;
  max_ms: number | null;
}

/** p50/p95/p99 from a histogram, average from the duration sum. */
export function rollupPercentiles(
  totals: LatencyTotals,
  histogram: readonly number[] | undefined,
): PercentilesDto {
  if (totals.count === 0 || !histogram)
    return { p50: 0, p95: 0, p99: 0, avg: 0 };
  const [p50, p95, p99] = histogramQuantiles(
    histogram,
    [0.5, 0.95, 0.99],
    totals.min_ms ?? 0,
    totals.max_ms ?? 0,
  );
  return { p50, p95, p99, avg: totals.sum_ms / totals.count };
}

export interface TimelineRow extends LatencyTotals {
  t: Date;
  errors: number;
  status4xx?: number;
  status5xx?: number;
}

/**
 * Timeline buckets with their p95 and average, and the totals and percentiles of the
 * whole window, from the grouped rows and histogram cells of one timeline.
 */
export function summarizeTimeline(
  rows: TimelineRow[],
  cells: Array<{ t: Date; bucket: number; count: number }>,
) {
  const perBucket = histogramsByKey(cells, (cell) => String(cell.t.getTime()));
  const overall = histogramsByKey(cells, () => '');
  const totals = {
    count: 0,
    errors: 0,
    status4xx: 0,
    status5xx: 0,
    sum_ms: 0,
    min_ms: null as number | null,
    max_ms: null as number | null,
  };
  const buckets = rows.map((row) => {
    totals.count += row.count;
    totals.errors += row.errors;
    totals.status4xx += row.status4xx ?? 0;
    totals.status5xx += row.status5xx ?? 0;
    totals.sum_ms += row.sum_ms;
    if (row.min_ms !== null)
      totals.min_ms = Math.min(totals.min_ms ?? Infinity, row.min_ms);
    if (row.max_ms !== null)
      totals.max_ms = Math.max(totals.max_ms ?? -Infinity, row.max_ms);
    const latency = rollupPercentiles(
      row,
      perBucket.get(String(row.t.getTime())),
    );
    return {
      t: row.t,
      count: row.count,
      errors: row.errors,
      status4xx: row.status4xx,
      status5xx: row.status5xx,
      p95: latency.p95,
      avg: latency.avg,
    };
  });
  return {
    totals,
    buckets,
    latency: rollupPercentiles(totals, overall.get('')),
  };
}
