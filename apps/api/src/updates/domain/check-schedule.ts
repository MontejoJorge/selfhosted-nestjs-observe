/** How often the latest release is looked up, successful or not. */
export const CHECK_INTERVAL_MS = 12 * 60 * 60 * 1000;

/** A check is due when there was none yet or the last one is at least 12 hours old. */
export function isCheckDue(checkedAt: Date | null, now: Date): boolean {
  return (
    checkedAt === null ||
    now.getTime() - checkedAt.getTime() >= CHECK_INTERVAL_MS
  );
}
