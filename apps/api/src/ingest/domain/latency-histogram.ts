/**
 * Log-scale latency histogram kept by the per-minute rollups (`requests_1m`, `jobs_1m`).
 *
 * Bucket 0 holds durations under 1 ms; bucket i >= 1 holds [2^((i-1)/4), 2^(i/4)) ms:
 * four buckets per doubling, each ~19% wide, so a percentile read back from merged
 * histograms is within ~10% of the exact value. Durations of 2^24 ms (~4.7 h) or more
 * fall in the last bucket. A histogram is a dense array of counts, trimmed after its
 * last non-empty bucket. Migration 0005 computes the same index in SQL for the backfill.
 */
export const BUCKETS_PER_DOUBLING = 4;
export const LAST_BUCKET = 96;

export function bucketIndex(durationMs: number): number {
  if (!(durationMs >= 1)) return 0;
  return Math.min(
    LAST_BUCKET,
    Math.floor(BUCKETS_PER_DOUBLING * Math.log2(durationMs)) + 1,
  );
}

function bucketBounds(index: number): [number, number] {
  if (index === 0) return [0, 1];
  return [
    2 ** ((index - 1) / BUCKETS_PER_DOUBLING),
    2 ** (index / BUCKETS_PER_DOUBLING),
  ];
}

/** Counts one duration into `histogram`, growing it as needed. */
export function record(histogram: number[], durationMs: number): void {
  const index = bucketIndex(durationMs);
  while (histogram.length <= index) histogram.push(0);
  histogram[index]++;
}

/**
 * Quantiles (0..1) of a histogram, interpolated linearly inside the bucket that holds
 * each rank and clamped to the observed min and max.
 */
export function histogramQuantiles(
  histogram: readonly number[],
  quantiles: readonly number[],
  minMs: number,
  maxMs: number,
): number[] {
  const total = histogram.reduce((sum, count) => sum + count, 0);
  if (total === 0) return quantiles.map(() => 0);
  return quantiles.map((q) => {
    const rank = q * total;
    let seen = 0;
    for (let index = 0; index < histogram.length; index++) {
      const count = histogram[index];
      if (!count) continue;
      if (seen + count >= rank) {
        const [lo, hi] = bucketBounds(index);
        const value = lo + (hi - lo) * ((rank - seen) / count);
        return Math.min(maxMs, Math.max(minMs, value));
      }
      seen += count;
    }
    return maxMs;
  });
}
