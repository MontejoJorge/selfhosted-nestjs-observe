import type { TimeWindow } from '../common/time-window.js';

/**
 * Release comparison rules (ADR 0006): the windows compared around a release boundary
 * and the verdict thresholds. Pure functions, no I/O.
 */

export const RELEASE_WINDOWS = ['15m', '30m', '1h', '3h'] as const;
export type ReleaseWindow = (typeof RELEASE_WINDOWS)[number];
export const DEFAULT_RELEASE_WINDOW: ReleaseWindow = '30m';

export const RELEASE_VERDICTS = [
  'regression',
  'improving',
  'stable',
  'insufficient_data',
] as const;
export type ReleaseVerdict = (typeof RELEASE_VERDICTS)[number];

export const RELEASE_SIGNALS = [
  'error_rate_up',
  'error_rate_down',
  'p95_up',
  'p95_down',
] as const;
export type ReleaseSignal = (typeof RELEASE_SIGNALS)[number];

const MINUTE_MS = 60_000;
const WINDOW_MS: Record<ReleaseWindow, number> = {
  '15m': 15 * MINUTE_MS,
  '30m': 30 * MINUTE_MS,
  '1h': 60 * MINUTE_MS,
  '3h': 180 * MINUTE_MS,
};

/**
 * An instance is running a version when `services` says it is its latest version and it
 * reported within this time.
 */
export const ACTIVE_INSTANCE_MS = 5 * MINUTE_MS;

export interface ComparisonThresholds {
  /** Minimum executions on each side; below it the verdict is `insufficient_data`. */
  minCount: number;
  /** Error (failure) rate change that counts: both bounds must be exceeded. */
  rateRelative: number;
  rateAbsolute: number;
  /** p95 change that counts: both bounds must be exceeded. */
  p95Relative: number;
  p95AbsoluteMs: number;
}

export const REQUEST_THRESHOLDS: ComparisonThresholds = {
  minCount: 50,
  rateRelative: 1.5,
  rateAbsolute: 0.01,
  p95Relative: 1.25,
  p95AbsoluteMs: 25,
};

export const JOB_THRESHOLDS: ComparisonThresholds = {
  minCount: 20,
  rateRelative: 1.5,
  rateAbsolute: 0.02,
  p95Relative: 1.25,
  p95AbsoluteMs: 100,
};

export interface SideWindows {
  before: TimeWindow;
  after: TimeWindow;
  /** false while the after window has not fully elapsed */
  complete: boolean;
}

/**
 * The windows compared around `boundary`, on whole minutes of the rollups: `before` is the
 * `window` that ends at the minute containing the boundary, `after` the `window` that
 * starts at the next minute. The boundary minute itself is left out, since it mixes both
 * versions.
 */
export function sideWindows(
  boundary: Date,
  window: ReleaseWindow,
  now: Date,
): SideWindows {
  const minute = Math.floor(boundary.getTime() / MINUTE_MS) * MINUTE_MS;
  const width = WINDOW_MS[window];
  const afterFrom = minute + MINUTE_MS;
  return {
    before: { from: new Date(minute - width), to: new Date(minute) },
    after: { from: new Date(afterFrom), to: new Date(afterFrom + width) },
    complete: now.getTime() >= afterFrom + width,
  };
}

export function windowMs(window: ReleaseWindow): number {
  return WINDOW_MS[window];
}

export interface SideStats {
  count: number;
  errorRate: number;
  p95Ms: number;
}

export interface Assessment {
  verdict: ReleaseVerdict;
  signals: ReleaseSignal[];
}

function changed(
  before: number,
  after: number,
  relative: number,
  absolute: number,
): -1 | 0 | 1 {
  if (after - before >= absolute && after >= before * relative) return 1;
  if (before - after >= absolute && after * relative <= before) return -1;
  return 0;
}

/**
 * Verdict of one kind of execution (requests or jobs): `insufficient_data` when either
 * side has fewer than `minCount` executions; `regression` when the error rate or the p95
 * got worse beyond both thresholds; `improving` when one got better and none worse;
 * otherwise `stable`.
 */
export function assess(
  before: SideStats,
  after: SideStats,
  thresholds: ComparisonThresholds,
): Assessment {
  if (before.count < thresholds.minCount || after.count < thresholds.minCount) {
    return { verdict: 'insufficient_data', signals: [] };
  }
  const signals: ReleaseSignal[] = [];
  const rate = changed(
    before.errorRate,
    after.errorRate,
    thresholds.rateRelative,
    thresholds.rateAbsolute,
  );
  if (rate === 1) signals.push('error_rate_up');
  if (rate === -1) signals.push('error_rate_down');
  const p95 = changed(
    before.p95Ms,
    after.p95Ms,
    thresholds.p95Relative,
    thresholds.p95AbsoluteMs,
  );
  if (p95 === 1) signals.push('p95_up');
  if (p95 === -1) signals.push('p95_down');

  const verdict: ReleaseVerdict =
    rate === 1 || p95 === 1
      ? 'regression'
      : rate === -1 || p95 === -1
        ? 'improving'
        : 'stable';
  return { verdict, signals };
}

/** Overall verdict: the worst of the kinds that have enough data. */
export function combineVerdicts(verdicts: ReleaseVerdict[]): ReleaseVerdict {
  const order: ReleaseVerdict[] = ['regression', 'improving', 'stable'];
  return (
    order.find((verdict) => verdicts.includes(verdict)) ?? 'insufficient_data'
  );
}
