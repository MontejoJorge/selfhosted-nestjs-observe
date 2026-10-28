import { ChartCard } from '@/components/charts/chart-card';
import {
  TimeSeriesChart,
  type SeriesSpec,
} from '@/components/charts/time-series-chart';
import { EmptyState } from '@/components/states';
import type { RuntimeSeriesPointDto, TimeRange } from '@/lib/api/generated/api';
import {
  formatCount,
  formatDuration,
  formatMegabytes,
  formatPercent,
} from '@/lib/format';
import { useSuspenseQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { runtimeMetricsQueryOptions } from './queries';

const cpuSeries: SeriesSpec[] = [
  { key: 'cpuPercent', label: 'CPU', color: 'var(--chart-1)', mark: 'area' },
];
const memorySeries: SeriesSpec[] = [
  { key: 'memoryRss', label: 'RSS', color: 'var(--chart-1)', mark: 'line' },
  {
    key: 'heapTotal',
    label: 'Heap total',
    color: 'var(--chart-2)',
    mark: 'line',
  },
  {
    key: 'heapUsed',
    label: 'Heap used',
    color: 'var(--chart-3)',
    mark: 'line',
  },
];
const lagSeries: SeriesSpec[] = [
  {
    key: 'eventLoopLagMs',
    label: 'Lag',
    color: 'var(--chart-1)',
    mark: 'line',
  },
];
const eluSeries: SeriesSpec[] = [
  { key: 'elu', label: 'Utilization', color: 'var(--chart-1)', mark: 'area' },
];
const gcCountSeries: SeriesSpec[] = [
  {
    key: 'gcCount',
    label: 'Collections',
    color: 'var(--chart-1)',
    mark: 'bar',
  },
];
const gcDurationSeries: SeriesSpec[] = [
  {
    key: 'gcDurationMs',
    label: 'GC time',
    color: 'var(--chart-1)',
    mark: 'bar',
  },
];

/** Runtime charts for one service. Only rendered once a service is selected. */
export function RuntimeCharts({
  service,
  range,
}: {
  service: string;
  range: TimeRange;
}) {
  const { data } = useSuspenseQuery(
    runtimeMetricsQueryOptions({ service, range }),
  );
  const points = useMemo(
    () =>
      data.map((point: RuntimeSeriesPointDto) => ({
        ...point,
        elu:
          point.eventLoopUtilization === null
            ? null
            : point.eventLoopUtilization * 100,
      })),
    [data],
  );

  if (points.length === 0) {
    return (
      <EmptyState title="No runtime samples in this time range">
        The agent sends one runtime sample per batch (every few seconds) while
        the app runs.
      </EmptyState>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ChartCard title="CPU" description="Percent of one core">
        <TimeSeriesChart
          data={points}
          series={cpuSeries}
          formatValue={formatPercent}
        />
      </ChartCard>
      <ChartCard title="Memory" description="Resident set and V8 heap">
        <TimeSeriesChart
          data={points}
          series={memorySeries}
          formatValue={formatMegabytes}
        />
      </ChartCard>
      <ChartCard title="Event loop lag" description="Average per bucket">
        <TimeSeriesChart
          data={points}
          series={lagSeries}
          formatValue={formatDuration}
        />
      </ChartCard>
      <ChartCard
        title="Event loop utilization"
        description="Share of time the loop was busy"
      >
        <TimeSeriesChart
          data={points}
          series={eluSeries}
          formatValue={formatPercent}
        />
      </ChartCard>
      <ChartCard title="GC collections" description="Collections per bucket">
        <TimeSeriesChart
          data={points}
          series={gcCountSeries}
          formatValue={formatCount}
        />
      </ChartCard>
      <ChartCard title="GC time" description="Total pause time per bucket">
        <TimeSeriesChart
          data={points}
          series={gcDurationSeries}
          formatValue={formatDuration}
        />
      </ChartCard>
    </div>
  );
}
