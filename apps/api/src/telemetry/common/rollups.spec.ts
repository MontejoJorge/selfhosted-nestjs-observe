import { describe, expect, it } from 'vitest';
import { record } from '../../ingest/domain/latency-histogram.js';
import {
  histogramsByKey,
  rollupPercentiles,
  rollupWindow,
  summarizeTimeline,
} from './rollups.js';

describe('rollupWindow', () => {
  it('starts at the bucket containing `from` and keeps `to`', () => {
    const to = new Date('2026-10-30T13:00:00Z');
    expect(
      rollupWindow({ from: new Date('2026-10-30T12:00:42Z'), to }),
    ).toEqual({ from: new Date('2026-10-30T12:00:00Z'), to });
    expect(
      rollupWindow({ from: new Date('2026-10-30T12:07:00Z'), to }, 5 * 60_000)
        .from,
    ).toEqual(new Date('2026-10-30T12:05:00Z'));
  });
});

describe('histogramsByKey', () => {
  it('rebuilds dense histograms per key from cells', () => {
    const histograms = histogramsByKey(
      [
        { key: 'a', bucket: 2, count: 3 },
        { key: 'a', bucket: 0, count: 1 },
        { key: 'a', bucket: 2, count: 2 },
        { key: 'b', bucket: 1, count: 7 },
      ],
      (cell) => cell.key,
    );
    expect(histograms.get('a')).toEqual([1, 0, 5]);
    expect(histograms.get('b')).toEqual([0, 7]);
  });
});

describe('rollupPercentiles', () => {
  it('is all zeros without executions or a histogram', () => {
    const zero = { p50: 0, p95: 0, p99: 0, avg: 0 };
    expect(
      rollupPercentiles(
        { count: 0, sum_ms: 0, min_ms: null, max_ms: null },
        [1],
      ),
    ).toEqual(zero);
    expect(
      rollupPercentiles(
        { count: 3, sum_ms: 30, min_ms: 5, max_ms: 15 },
        undefined,
      ),
    ).toEqual(zero);
  });

  it('averages from the sum and reads percentiles from the histogram', () => {
    const histogram: number[] = [];
    for (const ms of [10, 10, 10, 10]) record(histogram, ms);
    expect(
      rollupPercentiles(
        { count: 4, sum_ms: 40, min_ms: 10, max_ms: 10 },
        histogram,
      ),
    ).toEqual({ p50: 10, p95: 10, p99: 10, avg: 10 });
  });
});

describe('summarizeTimeline', () => {
  const t1 = new Date('2026-10-30T12:00:00Z');
  const t2 = new Date('2026-10-30T12:01:00Z');

  it('sums totals, merges min/max and computes per-bucket and overall latency', () => {
    const h1: number[] = [];
    record(h1, 10);
    record(h1, 10);
    const h2: number[] = [];
    record(h2, 100);
    const cells = [
      ...h1.flatMap((count, bucket) =>
        count ? [{ t: t1, bucket, count }] : [],
      ),
      ...h2.flatMap((count, bucket) =>
        count ? [{ t: t2, bucket, count }] : [],
      ),
    ];
    const summary = summarizeTimeline(
      [
        {
          t: t1,
          count: 2,
          errors: 1,
          status4xx: 1,
          sum_ms: 20,
          min_ms: 10,
          max_ms: 10,
        },
        {
          t: t2,
          count: 1,
          errors: 0,
          status5xx: 1,
          sum_ms: 100,
          min_ms: 100,
          max_ms: 100,
        },
        {
          t: new Date('2026-10-30T12:02:00Z'),
          count: 0,
          errors: 0,
          sum_ms: 0,
          min_ms: null,
          max_ms: null,
        },
      ],
      cells,
    );
    expect(summary.totals).toEqual({
      count: 3,
      errors: 1,
      status4xx: 1,
      status5xx: 1,
      sum_ms: 120,
      min_ms: 10,
      max_ms: 100,
    });
    expect(summary.buckets.map((b) => [b.count, b.p95, b.avg])).toEqual([
      [2, 10, 10],
      [1, 100, 100],
      [0, 0, 0],
    ]);
    expect(summary.latency.avg).toBe(40);
    // interpolated inside the bucket of the 10 ms executions, [9.51, 11.31)
    expect(summary.latency.p50).toBeGreaterThanOrEqual(10);
    expect(summary.latency.p50).toBeLessThan(2 ** (14 / 4));
    expect(summary.latency.p99).toBe(100);
  });

  it('leaves min/max null when no bucket had traffic', () => {
    const summary = summarizeTimeline([], []);
    expect(summary.totals.min_ms).toBeNull();
    expect(summary.latency).toEqual({ p50: 0, p95: 0, p99: 0, avg: 0 });
  });
});
