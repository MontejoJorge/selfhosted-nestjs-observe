const DAY_MS = 86_400_000;

/** Why a trim request is refused (the HTTP layer maps it to 400). */
export class InvalidTrimError extends Error {}

/**
 * First UTC day kept by "keep the last `keepDays` days": today and the `keepDays` days
 * before it are kept, older rows are deleted. The same rule as `RETENTION_DAYS`, which
 * keeps partitions from `today - RETENTION_DAYS` on, so with 14 days stored, keeping 7
 * deletes the days 8 to 14 days ago. `keepDays` must be below the retention: at or above
 * it there is nothing to trim.
 */
export function trimCutoffDay(
  now: Date,
  keepDays: number,
  retentionDays: number,
): string {
  if (!Number.isInteger(keepDays) || keepDays < 1 || keepDays >= retentionDays)
    throw new InvalidTrimError(
      `keepDays must be an integer from 1 to ${retentionDays - 1} (RETENTION_DAYS is ${retentionDays})`,
    );
  const today = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  return new Date(today - keepDays * DAY_MS).toISOString().slice(0, 10);
}
