import { describe, expect, it } from 'vitest';
import {
  bucketIndex,
  histogramQuantiles,
  LAST_BUCKET,
  record,
} from './latency-histogram.js';

describe('bucketIndex', () => {
  it('puts sub-millisecond, zero, negative and NaN durations in bucket 0', () => {
    expect(bucketIndex(0)).toBe(0);
    expect(bucketIndex(0.999)).toBe(0);
    expect(bucketIndex(-10)).toBe(0);
    expect(bucketIndex(Number.NaN)).toBe(0);
  });

  it('uses four buckets per doubling', () => {
    expect(bucketIndex(1)).toBe(1);
    expect(bucketIndex(2)).toBe(5);
    expect(bucketIndex(4)).toBe(9);
    expect(bucketIndex(1024)).toBe(41);
  });

  it('keeps each duration inside its bucket bounds', () => {
    for (const ms of [1, 1.18, 1.2, 3, 10, 99.9, 250, 7_250, 60_000]) {
      const i = bucketIndex(ms);
      expect(ms).toBeGreaterThanOrEqual(2 ** ((i - 1) / 4) - 1e-9);
      expect(ms).toBeLessThan(2 ** (i / 4));
    }
  });

  it('caps very long durations at the last bucket', () => {
    expect(bucketIndex(2 ** 24)).toBe(LAST_BUCKET);
    expect(bucketIndex(Number.MAX_VALUE)).toBe(LAST_BUCKET);
    expect(bucketIndex(Infinity)).toBe(LAST_BUCKET);
  });
});

describe('record', () => {
  it('grows the dense array up to the bucket and counts', () => {
    const histogram: number[] = [];
    record(histogram, 2);
    record(histogram, 2.1);
    record(histogram, 0.2);
    expect(histogram).toEqual([1, 0, 0, 0, 0, 2]);
  });
});

describe('histogramQuantiles', () => {
  it('returns zeros for an empty histogram', () => {
    expect(histogramQuantiles([], [0.5, 0.95], 0, 0)).toEqual([0, 0]);
    expect(histogramQuantiles([0, 0, 0], [0.5], 1, 5)).toEqual([0]);
  });

  it('clamps estimates to the observed min and max', () => {
    const histogram: number[] = [];
    for (let i = 0; i < 10; i++) record(histogram, 10);
    expect(histogramQuantiles(histogram, [0, 0.5, 1], 10, 10)).toEqual([
      10, 10, 10,
    ]);
  });

  it('stays within ~10% of the exact percentiles', () => {
    const histogram: number[] = [];
    for (let ms = 1; ms <= 1000; ms++) record(histogram, ms);
    const [p50, p95, p99] = histogramQuantiles(
      histogram,
      [0.5, 0.95, 0.99],
      1,
      1000,
    );
    expect(Math.abs(p50 - 500) / 500).toBeLessThan(0.1);
    expect(Math.abs(p95 - 950) / 950).toBeLessThan(0.1);
    expect(Math.abs(p99 - 990) / 990).toBeLessThan(0.1);
  });

  it('is monotonic in the quantile', () => {
    const histogram: number[] = [];
    for (const ms of [0.5, 3, 8, 8, 40, 120, 900, 5_000]) record(histogram, ms);
    const values = histogramQuantiles(
      histogram,
      [0.1, 0.25, 0.5, 0.75, 0.9, 0.99],
      0.5,
      5_000,
    );
    expect(values).toEqual(values.toSorted((a, b) => a - b));
  });
});
