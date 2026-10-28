import type { TimeBucketDto } from '@/lib/api/generated/api';
import { formatCount, formatDuration } from '@/lib/format';
import { useMemo } from 'react';
import { TimeSeriesChart, type SeriesSpec } from './time-series-chart';

const throughputSeries: SeriesSpec[] = [
  {
    key: 'ok',
    label: 'Succeeded',
    color: 'var(--chart-1)',
    mark: 'bar',
    stackId: 'n',
  },
  {
    key: 'errors',
    label: 'Errors',
    color: 'var(--status-error)',
    mark: 'bar',
    stackId: 'n',
  },
];

const latencySeries: SeriesSpec[] = [
  { key: 'p95', label: 'p95', color: 'var(--chart-1)', mark: 'line' },
];

/** Stacked succeeded/errored counts per bucket. */
export function ThroughputChart({
  buckets,
}: {
  buckets: readonly TimeBucketDto[];
}) {
  const data = useMemo(
    () =>
      buckets.map((b) => ({
        t: b.t,
        ok: Math.max(0, b.count - b.errors),
        errors: b.errors,
      })),
    [buckets],
  );
  return (
    <TimeSeriesChart
      data={data}
      series={throughputSeries}
      formatValue={formatCount}
    />
  );
}

/** p95 latency per bucket. Kept separate from throughput: never a dual axis. */
export function LatencyChart({
  buckets,
}: {
  buckets: readonly TimeBucketDto[];
}) {
  const data = useMemo(
    () => buckets.map((b) => ({ t: b.t, p95: b.count > 0 ? b.p95 : null })),
    [buckets],
  );
  return (
    <TimeSeriesChart
      data={data}
      series={latencySeries}
      formatValue={formatDuration}
    />
  );
}
