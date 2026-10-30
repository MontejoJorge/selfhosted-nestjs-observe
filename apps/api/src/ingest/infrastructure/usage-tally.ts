import { sql, type Insertable, type Transaction } from 'kysely';
import {
  USAGE_TABLES,
  type ApplicationUsageTable,
  type Database,
  type UsageTable,
} from '../../database/database.types.js';
import { utcDay } from '../../database/partition-manager.js';

/** Fixed part of a heap tuple (header and item pointer), as the migration 0010 backfill counts it. */
const TUPLE_OVERHEAD = 24;

function isUuid(value: string): boolean {
  return value.length === 36 && value[8] === '-' && value[23] === '-';
}

/**
 * Cheap estimate of the stored size of one row, from the values about to be inserted:
 * strings count their UTF-8 length plus a varlena header (16 bytes for uuids), numbers
 * and dates 8, booleans 1, nulls nothing. It is the uncompressed size: large jsonb values
 * end up compressed on disk, which the apportioning absorbs (only the shares of the
 * applications within one day partition matter).
 */
export function estimateRowBytes(row: Record<string, unknown>): number {
  let bytes = TUPLE_OVERHEAD;
  for (const value of Object.values(row)) {
    if (value === null || value === undefined) continue;
    if (typeof value === 'string') {
      if (isUuid(value)) bytes += 16;
      else {
        const length = Buffer.byteLength(value);
        bytes += length + (length < 127 ? 1 : 4);
      }
    } else if (typeof value === 'boolean') bytes += 1;
    else if (typeof value === 'number' || value instanceof Date) bytes += 8;
    else bytes += Buffer.byteLength(JSON.stringify(value)) + 4;
  }
  return bytes;
}

/** Rows and estimated bytes of one batch per UTC day and table, for `application_usage`. */
export class UsageTally {
  private readonly counts = new Map<
    string,
    { day: string; table: UsageTable; rows: number; bytes: number }
  >();

  /** Counts rows about to be inserted into `table`, by the UTC day of their time column. */
  add(table: UsageTable, rows: readonly object[]): void {
    const timeColumn = USAGE_TABLES[table];
    for (const row of rows as Record<string, unknown>[]) {
      const day = utcDay(row[timeColumn] as Date);
      const bytes = estimateRowBytes(row);
      const key = `${day}|${table}`;
      const entry = this.counts.get(key);
      if (entry) {
        entry.rows++;
        entry.bytes += bytes;
      } else this.counts.set(key, { day, table, rows: 1, bytes });
    }
  }

  /** Upsert rows sorted by (day, table), the primary key order, so concurrent batches cannot deadlock. */
  rowsOf(applicationId: string): Insertable<ApplicationUsageTable>[] {
    return [...this.counts.values()]
      .sort((a, b) =>
        a.day !== b.day
          ? a.day < b.day
            ? -1
            : 1
          : a.table < b.table
            ? -1
            : a.table > b.table
              ? 1
              : 0,
      )
      .map((entry) => ({
        application_id: applicationId,
        day: entry.day,
        table_name: entry.table,
        rows: entry.rows,
        bytes: entry.bytes,
      }));
  }
}

/**
 * Adds a batch's counts to `application_usage`. Run it last in the batch's transaction:
 * every batch of an application updates the same few rows of the day, so the row locks
 * are held only until the commit.
 */
export async function upsertUsage(
  trx: Transaction<Database>,
  rows: Insertable<ApplicationUsageTable>[],
): Promise<void> {
  if (rows.length === 0) return;
  await trx
    .insertInto('application_usage')
    .values(rows)
    .onConflict((oc) =>
      oc.columns(['application_id', 'day', 'table_name']).doUpdateSet({
        rows: sql<number>`application_usage.rows + excluded.rows`,
        bytes: sql<number>`application_usage.bytes + excluded.bytes`,
      }),
    )
    .execute();
}
