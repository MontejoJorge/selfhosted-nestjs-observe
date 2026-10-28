import { sql, type RawBuilder } from 'kysely';
import type { PercentilesDto } from './common.dto.js';
import { BUCKET_ORIGIN } from './time-window.js';

/** p50/p95/p99 in a single sort. Only use it over a time-pruned range. */
export function latencyPercentiles(
  column: string,
): RawBuilder<number[] | null> {
  return sql<
    number[] | null
  >`percentile_cont(array[0.5, 0.95, 0.99]) within group (order by ${sql.ref(column)})`;
}

export function p95(column: string): RawBuilder<number | null> {
  return sql<
    number | null
  >`percentile_cont(0.95) within group (order by ${sql.ref(column)})`;
}

/**
 * Start of the `stepSeconds` bucket containing `column`. The step is inlined as a
 * literal (it is an integer we compute), so the same expression can be used in
 * SELECT and GROUP BY.
 */
export function bucketStart(
  column: string,
  stepSeconds: number,
): RawBuilder<Date> {
  const step = Math.max(1, Math.trunc(stepSeconds));
  return sql<Date>`date_bin(${sql.raw(`'${step} seconds'`)}::interval, ${sql.ref(column)}, ${sql.raw(`'${BUCKET_ORIGIN}'`)}::timestamptz)`;
}

export const countAll = sql<number>`count(*)::int8`;

export function countWhere(column: string): RawBuilder<number> {
  return sql<number>`(count(*) filter (where ${sql.ref(column)}))::int8`;
}

export function toPercentiles(
  values: number[] | null | undefined,
  avg: number | null | undefined,
): PercentilesDto {
  return {
    p50: values?.[0] ?? 0,
    p95: values?.[1] ?? 0,
    p99: values?.[2] ?? 0,
    avg: avg ?? 0,
  };
}

export function avgOf(column: string): RawBuilder<number | null> {
  return sql<number | null>`avg(${sql.ref(column)})::float8`;
}

/** Requests with a 4xx status code. */
export const count4xx = sql<number>`(count(*) filter (where status_code between 400 and 499))::int8`;
/** Requests with a 5xx (or higher) status code. */
export const count5xx = sql<number>`(count(*) filter (where status_code >= 500))::int8`;

export function ratio(part: number, total: number): number {
  return total > 0 ? part / total : 0;
}

/** Escapes LIKE wildcards so user input matches literally. */
export function likeContains(value: string): string {
  return `%${value.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}
