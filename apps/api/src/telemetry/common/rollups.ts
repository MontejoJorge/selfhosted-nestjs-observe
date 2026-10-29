import { sql, type RawBuilder, type SqlBool } from 'kysely';
import { histogramQuantiles } from '../../ingest/domain/latency-histogram.js';
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

const MINUTE_MS = 60_000;

/** Rollups cover whole minutes: the window starts at the minute containing `from`. */
export function rollupWindow(window: TimeWindow): TimeWindow {
  return {
    from: new Date(Math.floor(window.from.getTime() / MINUTE_MS) * MINUTE_MS),
    to: window.to,
  };
}

/**
 * Filter of a rollup query: the scope's applications (and instance), the minutes of the
 * window, and equality on the optional `equals` columns. One expression, so it applies
 * to queries with and without the `histogramCells` from-item.
 */
export function inRollupScope(
  scope: TelemetryScope,
  window: TimeWindow,
  equals: Record<string, string | undefined> = {},
): RawBuilder<SqlBool> {
  const minutes = rollupWindow(window);
  const conditions: RawBuilder<unknown>[] = [
    inApplications('application_id', scope.applicationIds),
    sql`minute >= ${minutes.from}`,
    sql`minute < ${minutes.to}`,
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
