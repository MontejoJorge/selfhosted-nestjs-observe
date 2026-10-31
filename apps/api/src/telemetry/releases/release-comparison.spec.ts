import { describe, expect, it } from 'vitest';
import {
  assess,
  combineVerdicts,
  JOB_THRESHOLDS,
  REQUEST_THRESHOLDS,
  sideWindows,
  windowMs,
  type SideStats,
} from './release-comparison.js';

const side = (overrides: Partial<SideStats> = {}): SideStats => ({
  count: 100,
  errorRate: 0.01,
  p95Ms: 100,
  ...overrides,
});

describe('sideWindows', () => {
  const boundary = new Date('2026-10-30T12:00:30Z');

  it('leaves out the boundary minute and compares equal windows', () => {
    const { before, after } = sideWindows(boundary, '30m', boundary);
    expect(before).toEqual({
      from: new Date('2026-10-30T11:30:00Z'),
      to: new Date('2026-10-30T12:00:00Z'),
    });
    expect(after).toEqual({
      from: new Date('2026-10-30T12:01:00Z'),
      to: new Date('2026-10-30T12:31:00Z'),
    });
    expect(after.to.getTime() - after.from.getTime()).toBe(windowMs('30m'));
  });

  it('is complete once the after window has fully elapsed', () => {
    expect(
      sideWindows(boundary, '15m', new Date('2026-10-30T12:15:59Z')).complete,
    ).toBe(false);
    expect(
      sideWindows(boundary, '15m', new Date('2026-10-30T12:16:00Z')).complete,
    ).toBe(true);
  });
});

describe('assess', () => {
  it('needs enough executions on both sides', () => {
    expect(
      assess(side({ count: 49 }), side({ errorRate: 1 }), REQUEST_THRESHOLDS),
    ).toEqual({ verdict: 'insufficient_data', signals: [] });
    expect(assess(side(), side({ count: 19 }), JOB_THRESHOLDS).verdict).toBe(
      'insufficient_data',
    );
    expect(
      assess(side({ count: 20 }), side({ count: 20 }), JOB_THRESHOLDS).verdict,
    ).toBe('stable');
  });

  it('flags a regression only when both the relative and absolute bounds are exceeded', () => {
    // +2 points and x3: regression
    expect(
      assess(side(), side({ errorRate: 0.03 }), REQUEST_THRESHOLDS),
    ).toEqual({ verdict: 'regression', signals: ['error_rate_up'] });
    // x5 but only +0.4 points: noise
    expect(
      assess(
        side({ errorRate: 0.001 }),
        side({ errorRate: 0.005 }),
        REQUEST_THRESHOLDS,
      ).verdict,
    ).toBe('stable');
    // +30 ms but only x1.2: noise
    expect(
      assess(side({ p95Ms: 150 }), side({ p95Ms: 180 }), REQUEST_THRESHOLDS)
        .verdict,
    ).toBe('stable');
    // +30 ms and x1.3
    expect(
      assess(side(), side({ p95Ms: 130 }), REQUEST_THRESHOLDS).signals,
    ).toEqual(['p95_up']);
  });

  it('counts a new error rate from zero as a regression', () => {
    expect(
      assess(
        side({ errorRate: 0 }),
        side({ errorRate: 0.02 }),
        REQUEST_THRESHOLDS,
      ).verdict,
    ).toBe('regression');
  });

  it('reports improvements when nothing got worse', () => {
    expect(
      assess(
        side({ errorRate: 0.05, p95Ms: 400 }),
        side({ errorRate: 0.01, p95Ms: 200 }),
        REQUEST_THRESHOLDS,
      ),
    ).toEqual({
      verdict: 'improving',
      signals: ['error_rate_down', 'p95_down'],
    });
  });

  it('lets a regression win over an improvement', () => {
    expect(
      assess(
        side({ errorRate: 0.05 }),
        side({ errorRate: 0.01, p95Ms: 200 }),
        REQUEST_THRESHOLDS,
      ),
    ).toEqual({
      verdict: 'regression',
      signals: ['error_rate_down', 'p95_up'],
    });
  });

  it('uses the job thresholds for jobs', () => {
    // +50 ms and x1.5 is a request regression, not a job one (100 ms minimum)
    expect(
      assess(side(), side({ p95Ms: 150 }), REQUEST_THRESHOLDS).verdict,
    ).toBe('regression');
    expect(assess(side(), side({ p95Ms: 150 }), JOB_THRESHOLDS).verdict).toBe(
      'stable',
    );
  });
});

describe('combineVerdicts', () => {
  it('picks the most notable verdict among kinds with data', () => {
    expect(combineVerdicts(['stable', 'regression', 'improving'])).toBe(
      'regression',
    );
    expect(combineVerdicts(['insufficient_data', 'improving', 'stable'])).toBe(
      'improving',
    );
    expect(combineVerdicts(['insufficient_data', 'stable'])).toBe('stable');
  });

  it('is insufficient_data when no kind has data', () => {
    expect(combineVerdicts([])).toBe('insufficient_data');
    expect(combineVerdicts(['insufficient_data'])).toBe('insufficient_data');
  });
});
