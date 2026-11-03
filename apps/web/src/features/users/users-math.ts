import type { UserStatsDto } from '@/lib/api/generated/api';

/** Rows per page in the users table (client-side pagination). */
export const USERS_PAGE_SIZE = 25;

/** Failure rate at and above which a user reads fully red. */
export const FAILURE_RED_AT = 0.05;
/** Failure rate that reads neutral grey (teal below, red above). */
export const FAILURE_GREY_AT = 0.01;

/** Teal at 0%, grey around 1%, red at 5% and above (theme tokens, light and dark). */
export function failureColor(rate: number): string {
  if (rate <= FAILURE_GREY_AT) {
    const t = Math.round((rate / FAILURE_GREY_AT) * 100);
    return `color-mix(in oklch, var(--chart-3) ${t}%, var(--teal))`;
  }
  const t = Math.round(
    Math.min(1, (rate - FAILURE_GREY_AT) / (FAILURE_RED_AT - FAILURE_GREY_AT)) *
      100,
  );
  return `color-mix(in oklch, var(--primary) ${t}%, var(--chart-3))`;
}

/** The legend's gradient, matching `failureColor`. */
export const FAILURE_GRADIENT =
  'linear-gradient(to right, var(--teal), var(--chart-3) 20%, var(--primary))';

export const ANONYMOUS_LABEL = 'anonymous';

export function userLabel(user: Pick<UserStatsDto, 'userId'>): string {
  return user.userId ?? ANONYMOUS_LABEL;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = values.toSorted((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export interface ScatterPoint {
  userId: string | null;
  label: string;
  requests: number;
  p95: number;
  errorRate: number;
  /** Shown as a text label next to the dot. */
  flagged: boolean;
}

export interface ScatterModel {
  points: ScatterPoint[];
  /** Medians: the lower-left corner of the "busy & slow" quadrant. */
  medianRequests: number;
  medianP95: number;
  busyAndSlow: number;
}

const FLAGGED = 3;

/**
 * One dot per identified user (log scales need positive values). The worst few by failure
 * rate are labeled; if nobody reaches 1%, the heaviest by requests × p95.
 */
export function scatterModel(users: readonly UserStatsDto[]): ScatterModel {
  // The anonymous row aggregates every request without a user id: not a user.
  const usable = users.filter(
    (u) => u.userId !== null && u.requestCount > 0 && u.latency.p95 > 0,
  );
  const failing = usable
    .filter((u) => u.errorRate >= FAILURE_GREY_AT)
    .toSorted((a, b) => b.errorRate - a.errorRate);
  const flaggedUsers = new Set(
    (failing.length > 0
      ? failing
      : usable.toSorted(
          (a, b) =>
            b.requestCount * b.latency.p95 - a.requestCount * a.latency.p95,
        )
    ).slice(0, FLAGGED),
  );
  const medianRequests = median(usable.map((u) => u.requestCount));
  const medianP95 = median(usable.map((u) => u.latency.p95));
  return {
    points: usable.map((u) => ({
      userId: u.userId,
      label: userLabel(u),
      requests: u.requestCount,
      p95: u.latency.p95,
      errorRate: u.errorRate,
      flagged: flaggedUsers.has(u),
    })),
    medianRequests,
    medianP95,
    busyAndSlow: usable.filter(
      (u) => u.requestCount > medianRequests && u.latency.p95 > medianP95,
    ).length,
  };
}
