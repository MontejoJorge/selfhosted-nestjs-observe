import { ChartContainer, type ChartConfig } from '@/components/ui/chart';
import type { TimeBucketDto } from '@/lib/api/generated/api';
import { formatCount, formatDuration } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useId, useMemo } from 'react';
import { Area, AreaChart, Bar, BarChart, Line, XAxis, YAxis } from 'recharts';
import { chartTooltip } from './chart-tooltip';

const requestConfig: ChartConfig = {
  ok: { label: '1/2/3xx', color: 'var(--bar)' },
  status4xx: {
    label: '4xx',
    color: 'color-mix(in oklch, var(--primary) 55%, var(--bar))',
  },
  status5xx: { label: '5xx', color: 'var(--primary)' },
};

/** Dense thin bars per bucket: grey for 1/2/3xx, red segments on top for 4xx and 5xx. */
export function RequestBarsChart({
  buckets,
  className,
}: {
  buckets: readonly TimeBucketDto[];
  className?: string;
}) {
  const data = useMemo(
    () =>
      buckets.map((b) => ({
        t: b.t,
        ok: Math.max(0, b.count - b.status4xx - b.status5xx),
        status4xx: b.status4xx,
        status5xx: b.status5xx,
      })),
    [buckets],
  );
  return (
    <ChartContainer
      config={requestConfig}
      className={cn('aspect-auto h-36 w-full', className)}
    >
      <BarChart
        data={data}
        barCategoryGap="30%"
        margin={{ top: 4, right: 0, bottom: 0, left: 0 }}
      >
        <XAxis dataKey="t" hide />
        <YAxis hide />
        {chartTooltip(requestConfig, formatCount)}
        <Bar
          dataKey="ok"
          stackId="n"
          fill="var(--color-ok)"
          isAnimationActive={false}
        />
        <Bar
          dataKey="status4xx"
          stackId="n"
          fill="var(--color-status4xx)"
          isAnimationActive={false}
        />
        <Bar
          dataKey="status5xx"
          stackId="n"
          fill="var(--color-status5xx)"
          radius={[2, 2, 0, 0]}
          isAnimationActive={false}
        />
      </BarChart>
    </ChartContainer>
  );
}

const jobConfig: ChartConfig = {
  completed: { label: 'Completed', color: 'var(--bar)' },
  failed: { label: 'Failed', color: 'var(--primary)' },
};

/** Job runs per bucket, failed runs in red. */
export function JobBarsChart({
  buckets,
  className,
}: {
  buckets: readonly TimeBucketDto[];
  className?: string;
}) {
  const data = useMemo(
    () =>
      buckets.map((b) => ({
        t: b.t,
        completed: Math.max(0, b.count - b.errors),
        failed: b.errors,
      })),
    [buckets],
  );
  return (
    <ChartContainer
      config={jobConfig}
      className={cn('aspect-auto h-36 w-full', className)}
    >
      <BarChart
        data={data}
        barCategoryGap="30%"
        margin={{ top: 4, right: 0, bottom: 0, left: 0 }}
      >
        <XAxis dataKey="t" hide />
        <YAxis hide />
        {chartTooltip(jobConfig, formatCount)}
        <Bar
          dataKey="completed"
          stackId="n"
          fill="var(--color-completed)"
          isAnimationActive={false}
        />
        <Bar
          dataKey="failed"
          stackId="n"
          fill="var(--color-failed)"
          radius={[2, 2, 0, 0]}
          isAnimationActive={false}
        />
      </BarChart>
    </ChartContainer>
  );
}

const durationConfig: ChartConfig = {
  p95: { label: 'P95', color: 'var(--primary)' },
  avg: { label: 'AVG', color: 'var(--primary)' },
};

/** p95 as a red area with a gradient fill, the mean as a dashed line. Both are ms on one axis. */
export function DurationChart({
  buckets,
  className,
}: {
  buckets: readonly TimeBucketDto[];
  className?: string;
}) {
  const gradientId = `duration-${useId().replace(/:/g, '')}`;
  const data = useMemo(
    () =>
      buckets.map((b) => ({
        t: b.t,
        p95: b.count > 0 ? b.p95 : null,
        avg: b.count > 0 ? b.avg : null,
      })),
    [buckets],
  );
  return (
    <ChartContainer
      config={durationConfig}
      className={cn('aspect-auto h-36 w-full', className)}
    >
      <AreaChart data={data} margin={{ top: 6, right: 6, bottom: 2, left: 6 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.4} />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <XAxis dataKey="t" hide />
        <YAxis hide domain={[0, 'auto']} />
        {chartTooltip(durationConfig, formatDuration)}
        <Area
          dataKey="p95"
          type="monotone"
          stroke="var(--color-p95)"
          strokeWidth={1.5}
          fill={`url(#${gradientId})`}
          connectNulls
          dot={false}
          activeDot={{ r: 3 }}
          isAnimationActive={false}
        />
        <Line
          dataKey="avg"
          type="monotone"
          stroke="var(--color-avg)"
          strokeOpacity={0.7}
          strokeWidth={1.25}
          strokeDasharray="3 3"
          connectNulls
          dot={false}
          isAnimationActive={false}
        />
      </AreaChart>
    </ChartContainer>
  );
}

interface StemProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  value?: number;
}

/** A thin stem with a dot on top; nothing for empty buckets. */
function Stem({ x = 0, y = 0, width = 0, height = 0, value = 0 }: StemProps) {
  if (!value) return null;
  const cx = x + width / 2;
  return (
    <g>
      <line
        x1={cx}
        x2={cx}
        y1={y}
        y2={y + height}
        stroke="var(--bar)"
        strokeWidth={1.25}
      />
      <circle cx={cx} cy={y} r={3} fill="var(--primary)" />
    </g>
  );
}

const errorConfig: ChartConfig = {
  errors: { label: 'Errors', color: 'var(--primary)' },
};

/** Errors per bucket as a lollipop chart. */
export function ErrorStemChart({
  buckets,
  pick = (b) => b.errors,
  className,
}: {
  buckets: readonly TimeBucketDto[];
  pick?: (bucket: TimeBucketDto) => number;
  className?: string;
}) {
  const data = useMemo(
    () => buckets.map((b) => ({ t: b.t, errors: pick(b) })),
    [buckets, pick],
  );
  return (
    <ChartContainer
      config={errorConfig}
      className={cn('aspect-auto h-36 w-full', className)}
    >
      <BarChart data={data} margin={{ top: 6, right: 0, bottom: 0, left: 0 }}>
        <XAxis dataKey="t" hide />
        <YAxis hide />
        {chartTooltip(errorConfig, formatCount)}
        <Bar dataKey="errors" shape={<Stem />} isAnimationActive={false} />
      </BarChart>
    </ChartContainer>
  );
}
