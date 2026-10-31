import type { UserStatsDto } from '@/lib/api/generated/api';
import { describe, expect, it } from 'vitest';
import { failureColor, scatterModel, userLabel } from './users-math';

const user = (
  userId: string | null,
  requestCount: number,
  p95: number,
  errorRate = 0,
) =>
  ({
    userId,
    requestCount,
    errorRate,
    latency: { p50: 0, p95, p99: 0, avg: 0 },
  }) as UserStatsDto;

describe('failureColor', () => {
  it('goes teal -> grey up to 1% and grey -> red up to 5%', () => {
    expect(failureColor(0)).toBe(
      'color-mix(in oklch, var(--chart-3) 0%, var(--teal))',
    );
    expect(failureColor(0.01)).toBe(
      'color-mix(in oklch, var(--chart-3) 100%, var(--teal))',
    );
    expect(failureColor(0.03)).toBe(
      'color-mix(in oklch, var(--primary) 50%, var(--chart-3))',
    );
    expect(failureColor(0.5)).toBe(
      'color-mix(in oklch, var(--primary) 100%, var(--chart-3))',
    );
  });
});

describe('userLabel', () => {
  it('labels the anonymous row', () => {
    expect(userLabel({ userId: null })).toBe('anonymous');
    expect(userLabel({ userId: 'u1' })).toBe('u1');
  });
});

describe('scatterModel', () => {
  it('leaves out the anonymous row and users without traffic or latency', () => {
    const model = scatterModel([
      user(null, 1000, 50),
      user('idle', 0, 10),
      user('instant', 5, 0),
      user('u1', 10, 20),
    ]);
    expect(model.points.map((p) => p.userId)).toEqual(['u1']);
  });

  it('flags the worst failure rates first, at most three', () => {
    const model = scatterModel([
      user('a', 10, 10, 0.02),
      user('b', 10, 10, 0.5),
      user('c', 10, 10, 0.1),
      user('d', 10, 10, 0.05),
      user('e', 10, 10, 0.001),
    ]);
    expect(model.points.filter((p) => p.flagged).map((p) => p.userId)).toEqual([
      'b',
      'c',
      'd',
    ]);
  });

  it('flags the heaviest users when nobody fails', () => {
    const model = scatterModel([
      user('light', 1, 10),
      user('heavy', 100, 100),
      user('busy', 1000, 5),
    ]);
    expect(model.points.filter((p) => p.flagged).map((p) => p.userId)).toEqual([
      'light',
      'heavy',
      'busy',
    ]);
    const flaggedOrder = scatterModel([
      user('a', 1, 1),
      user('b', 2, 2),
      user('c', 3, 3),
      user('d', 4, 4),
    ]).points.filter((p) => p.flagged);
    expect(flaggedOrder.map((p) => p.userId)).toEqual(['b', 'c', 'd']);
  });

  it('counts busy and slow users against the medians', () => {
    const model = scatterModel([
      user('a', 1, 10),
      user('b', 2, 20),
      user('c', 3, 30),
      user('d', 4, 40),
    ]);
    expect(model.medianRequests).toBe(2.5);
    expect(model.medianP95).toBe(25);
    expect(model.busyAndSlow).toBe(2);
  });

  it('is empty for no users', () => {
    expect(scatterModel([])).toEqual({
      points: [],
      medianRequests: 0,
      medianP95: 0,
      busyAndSlow: 0,
    });
  });
});
