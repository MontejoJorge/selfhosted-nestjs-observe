import {
  chartTooltip,
  type Formatter,
} from '@/components/charts/chart-tooltip';
import { ChartContainer, type ChartConfig } from '@/components/ui/chart';
import type { RuntimeSeriesPointDto } from '@/lib/api/generated/api';
import { cn } from '@/lib/utils';
import { useId, useMemo } from 'react';
import { Area, Bar, ComposedChart, Line, XAxis, YAxis } from 'recharts';

type NumericKey = {
  [K in keyof RuntimeSeriesPointDto]: RuntimeSeriesPointDto[K] extends
    number | null
    ? K
    : never;
}[keyof RuntimeSeriesPointDto];

export interface RuntimeSeries {
  key: NumericKey;
  label: string;
  color: string;
  /** `area` gets a gradient fill; `bar` stacks with the other bars. */
  mark: 'area' | 'line' | 'bar';
  dashed?: boolean;
}

/** A frameless runtime chart (no axes), one y-axis, several series. */
export function RuntimeChart({
  points,
  series,
  format,
  className,
}: {
  points: readonly RuntimeSeriesPointDto[];
  series: readonly RuntimeSeries[];
  format: Formatter;
  className?: string;
}) {
  const id = useId().replace(/:/g, '');
  const config = useMemo<ChartConfig>(
    () =>
      Object.fromEntries(
        series.map((s) => [s.key, { label: s.label, color: s.color }]),
      ),
    [series],
  );

  if (points.length === 0) {
    return (
      <div
        className={cn(
          'grid h-44 place-items-center font-mono text-xs text-muted-foreground',
          className,
        )}
      >
        No data in this time range
      </div>
    );
  }

  return (
    <ChartContainer
      config={config}
      className={cn('aspect-auto h-44 w-full', className)}
    >
      <ComposedChart
        data={points as RuntimeSeriesPointDto[]}
        margin={{ top: 6, right: 6, bottom: 2, left: 6 }}
        barCategoryGap="30%"
      >
        <defs>
          {series.map((s) => (
            <linearGradient
              key={s.key}
              id={`${id}-${s.key}`}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop offset="0%" stopColor={s.color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={s.color} stopOpacity={0.02} />
            </linearGradient>
          ))}
        </defs>
        <XAxis dataKey="t" hide />
        <YAxis hide domain={[0, 'auto']} />
        {chartTooltip(config, format)}
        {series.map((s) =>
          s.mark === 'bar' ? (
            <Bar
              key={s.key}
              dataKey={s.key}
              stackId="bars"
              fill={s.color}
              isAnimationActive={false}
            />
          ) : s.mark === 'area' ? (
            <Area
              key={s.key}
              dataKey={s.key}
              type="monotone"
              stroke={s.color}
              strokeWidth={1.5}
              strokeDasharray={s.dashed ? '3 3' : undefined}
              fill={`url(#${id}-${s.key})`}
              connectNulls
              dot={false}
              isAnimationActive={false}
            />
          ) : (
            <Line
              key={s.key}
              dataKey={s.key}
              type="monotone"
              stroke={s.color}
              strokeWidth={1.5}
              strokeDasharray={s.dashed ? '3 3' : undefined}
              connectNulls
              dot={false}
              isAnimationActive={false}
            />
          ),
        )}
      </ComposedChart>
    </ChartContainer>
  );
}
