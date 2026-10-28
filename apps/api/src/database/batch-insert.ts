import type { Insertable, Kysely, Transaction } from 'kysely';
import type { Database } from './database.types.js';

/** PostgreSQL allows 65535 bind parameters per statement; stay well below. */
const MAX_PARAMS = 60_000;
const MAX_ROWS_PER_STATEMENT = 1_000;

export function chunkRows<T>(rows: T[], columnCount: number): T[][] {
  const size = Math.max(
    1,
    Math.min(MAX_ROWS_PER_STATEMENT, Math.floor(MAX_PARAMS / columnCount)),
  );
  const chunks: T[][] = [];
  for (let i = 0; i < rows.length; i += size)
    chunks.push(rows.slice(i, i + size));
  return chunks;
}

/** Multi-row INSERT, split into chunks that fit the bind-parameter limit. */
export async function insertMany<T extends keyof Database>(
  db: Kysely<Database> | Transaction<Database>,
  table: T,
  rows: Insertable<Database[T]>[],
): Promise<void> {
  if (rows.length === 0) return;
  const columnCount = Object.keys(rows[0] as object).length;
  for (const chunk of chunkRows(rows, columnCount)) {
    await db
      .insertInto(table)
      .values(chunk as never)
      .execute();
  }
}

/**
 * JSON-encodes a value for a jsonb column (null stays SQL NULL). PostgreSQL rejects
 * `\u0000` in jsonb, so escaped NUL characters are removed.
 */
export function toJson(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return JSON.stringify(value).replace(/(?<!\\)\\u0000/g, '');
}

/** PostgreSQL text cannot hold NUL bytes. */
export function toText<T extends string | null>(value: T): T {
  return (value === null ? null : value.replaceAll('\0', '')) as T;
}
