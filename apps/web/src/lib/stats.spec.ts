import { describe, expect, it } from 'vitest';
import type { TimeBucketDto } from './api/generated/api';
import {
  bucketSpread,
  formatClock,
  formatLongDate,
  formatThroughput,
  peakBucket,
  previousWindow,
  relativeChange,
} from './stats';

const NOW = Date.parse('2026-10-30T12:00:00Z');

const bucket = (t: string, count: number, p95 = 0): TimeBucketDto => ({
  t,
  count,
  errors: 0,
  p95,
  avg: 0,
  status4xx: 0,
  status5xx: 0,
});

describe('previousWindow', () => {
  it('is the same length right before a preset', () => {
    expect(previousWindow({ range: '1h' }, NOW)).toEqual({
      from: '2026-10-30T10:00:00.000Z',
      to: '2026-10-30T11:00:00.000Z',
    });
  });

  it('is the same length right before a custom window', () => {
    expect(
      previousWindow(
        {
          range: '1h',
          from: '2026-10-28T00:00:00Z',
          to: '2026-10-29T00:00:00Z',
        },
        NOW,
      ),
    ).toEqual({
      from: '2026-10-27T00:00:00.000Z',
      to: '2026-10-28T00:00:00.000Z',
    });
  });
});

describe('formatThroughput', () => {
  it('picks per second, minute or hour', () => {
    expect(formatThroughput(7200, { range: '1h' })).toBe('2.0/s');
    expect(formatThroughput(1980, { range: '1h' })).toBe('33/min');
    expect(formatThroughput(30, { range: '1h' })).toBe('30.0/h');
    expect(formatThroughput(0, { range: '24h' })).toBe('0.0/h');
  });
});

describe('relativeChange', () => {
  it('is null when there is nothing to compare with', () => {
    expect(relativeChange(10, 0)).toBeNull();
    expect(relativeChange(10, -1)).toBeNull();
    expect(relativeChange(10, Number.NaN)).toBeNull();
    expect(relativeChange(10, Infinity)).toBeNull();
  });

  it('is the change relative to the previous value', () => {
    expect(relativeChange(150, 100)).toBe(0.5);
    expect(relativeChange(50, 100)).toBe(-0.5);
    expect(relativeChange(0, 100)).toBe(-1);
  });
});

describe('date helpers', () => {
  it('formats a long date and a 24-hour clock (TZ=UTC)', () => {
    expect(formatLongDate('2026-10-28T16:10:00Z')).toBe(
      'October 28, 2026 4:10 PM',
    );
    expect(formatClock('2026-10-28T16:10:00Z')).toBe('16:10');
  });
});

describe('peakBucket', () => {
  it('returns the first bucket with the highest value', () => {
    const buckets = [
      bucket('a', 1),
      bucket('b', 5),
      bucket('c', 5),
      bucket('d', 2),
    ];
    expect(peakBucket(buckets, (b) => b.count)?.t).toBe('b');
    expect(peakBucket([], (b) => b.count)).toBeUndefined();
  });
});

describe('bucketSpread', () => {
  it('ignores buckets without traffic', () => {
    const buckets = [bucket('a', 0, 0), bucket('b', 3, 40), bucket('c', 1, 10)];
    expect(bucketSpread(buckets, (b) => b.p95)).toEqual({ min: 10, max: 40 });
  });

  it('is null when no bucket had traffic', () => {
    expect(bucketSpread([bucket('a', 0)], (b) => b.p95)).toBeNull();
    expect(bucketSpread([], (b) => b.p95)).toBeNull();
  });
});
