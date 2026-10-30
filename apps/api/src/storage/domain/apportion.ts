/**
 * PostgreSQL knows the size of a table or partition, not of the rows of one application
 * in it. Each day partition's real size (heap, TOAST and indexes) is split between the
 * owners of its rows in proportion to the payload bytes counted at ingest
 * (`application_usage`). Tables that are not partitioned are split the same way over all
 * their days. Dead space left by deletes is attributed to the rows still there.
 */

/** Rows and counted payload bytes of one owner (application or project) in one table and day. */
export interface UsageCell {
  owner: string;
  table: string;
  /** `YYYY-MM-DD` (UTC) */
  day: string;
  rows: number;
  bytes: number;
}

/** Counted payload bytes of every application in one table and day. */
export interface DayTotal {
  table: string;
  day: string;
  bytes: number;
}

/** Real size of a day partition, or of a whole table that is not partitioned (`day: null`). */
export interface RelationSize {
  table: string;
  day: string | null;
  bytes: number;
}

export interface EstimatedCell extends UsageCell {
  /** Estimated share of the real size, in bytes. */
  estimatedBytes: number;
}

const key = (table: string, day: string | null) => `${table}|${day ?? ''}`;

export function apportion(
  cells: readonly UsageCell[],
  totals: readonly DayTotal[],
  sizes: readonly RelationSize[],
): EstimatedCell[] {
  const sizeOf = new Map(sizes.map((s) => [key(s.table, s.day), s.bytes]));
  const totalOf = new Map<string, number>();
  for (const total of totals) {
    // Day totals, and table-wide totals for the tables sized as a whole.
    totalOf.set(key(total.table, total.day), total.bytes);
    const tableKey = key(total.table, null);
    totalOf.set(tableKey, (totalOf.get(tableKey) ?? 0) + total.bytes);
  }

  return cells.map((cell) => {
    const dayKey = key(cell.table, cell.day);
    const unit = sizeOf.has(dayKey) ? dayKey : key(cell.table, null);
    const size = sizeOf.get(unit) ?? 0;
    const total = totalOf.get(unit) ?? 0;
    return {
      ...cell,
      estimatedBytes: total > 0 ? Math.round((cell.bytes / total) * size) : 0,
    };
  });
}
