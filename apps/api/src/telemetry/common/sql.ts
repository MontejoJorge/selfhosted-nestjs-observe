import { sql, type RawBuilder } from 'kysely';
import { BUCKET_ORIGIN } from './time-window.js';

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

export function avgOf(column: string): RawBuilder<number | null> {
  return sql<number | null>`avg(${sql.ref(column)})::float8`;
}

export function ratio(part: number, total: number): number {
  return total > 0 ? part / total : 0;
}

/** Escapes LIKE wildcards so user input matches literally. */
export function likeContains(value: string): string {
  return `%${value.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}
