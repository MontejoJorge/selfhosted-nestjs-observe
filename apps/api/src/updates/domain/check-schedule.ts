/** How often the latest release is looked up, successful or not. */
export const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

/**
 * The cron ticks every 6 hours too, and the last attempt is stored when its lookup ends,
 * so a tick comes a little short of 6 hours after it. Without this margin every other
 * tick would be skipped and checks would land 12 hours apart.
 */
export const CHECK_SLACK_MS = 10 * 60 * 1000;

/** A check is due when there was none yet or the last one is about 6 hours old. */
export function isCheckDue(checkedAt: Date | null, now: Date): boolean {
  return (
    checkedAt === null ||
    now.getTime() - checkedAt.getTime() >= CHECK_INTERVAL_MS - CHECK_SLACK_MS
  );
}
