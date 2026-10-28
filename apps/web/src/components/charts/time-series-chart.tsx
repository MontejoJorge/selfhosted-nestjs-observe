import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { formatDateTime, formatTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { memo } from 'react';
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
} from 'recharts';

export interface SeriesSpec {
  key: string;
  label: string;
  /** CSS color, usually a theme token such as `var(--chart-1)`. */
  color: string;
  mark: 'line' | 'area' | 'bar';
  /** Bars or areas sharing a stack id are stacked. */
  stackId?: string;
}

interface TimeSeriesChartProps<T extends { t: string }> {
  data: readonly T[];
  series: readonly SeriesSpec[];
  formatValue: (value: number) => string;
  className?: string;
}

function TimeSeriesChartImpl<T extends { t: string }>({
  data,
  series,
  formatValue,
  className,
}: TimeSeriesChartProps<T>) {
  const config: ChartConfig = Object.fromEntries(
    series.map((s) => [s.key, { label: s.label, color: s.color }]),
  );
  const lastInStack = new Map<string, string>();
  for (const s of series) if (s.stackId) lastInStack.set(s.stackId, s.key);

  return (
    <ChartContainer
      config={config}
      className={cn('aspect-auto h-48 w-full', className)}
    >
      <ComposedChart
        data={data as T[]}
        margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
        barCategoryGap={1}
      >
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="t"
          tickLine={false}
          axisLine={false}
          minTickGap={48}
          tickFormatter={(value: string) => formatTime(value)}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={68}
          tickFormatter={(value: number) => formatValue(value)}
        />
        <ChartTooltip
          cursor={
            series.some((s) => s.mark === 'bar') ? true : { strokeWidth: 1 }
          }
          content={
            <ChartTooltipContent
              labelFormatter={(_, payload) => {
                const t = (payload?.[0]?.payload as { t?: string } | undefined)
                  ?.t;
                return t ? formatDateTime(t) : null;
              }}
              formatter={(value, name, item) => (
                <div className="flex w-full items-center gap-2">
                  <span
                    className="size-2.5 shrink-0 rounded-[2px]"
                    style={{ background: item.color }}
                  />
                  <span className="text-muted-foreground">
                    {config[String(name)]?.label ?? name}
                  </span>
                  <span className="ml-auto font-mono font-medium text-foreground tabular-nums">
                    {typeof value === 'number'
                      ? formatValue(value)
                      : String(value)}
                  </span>
                </div>
              )}
            />
          }
        />
        {series.length > 1 ? (
          <ChartLegend content={<ChartLegendContent />} />
        ) : null}
        {series.map((s) => {
          const color = `var(--color-${s.key})`;
          if (s.mark === 'bar') {
            const isTop = !s.stackId || lastInStack.get(s.stackId) === s.key;
            return (
              <Bar
                key={s.key}
                dataKey={s.key}
                fill={color}
                stackId={s.stackId}
                radius={isTop ? [2, 2, 0, 0] : 0}
                maxBarSize={32}
                isAnimationActive={false}
              />
            );
          }
          if (s.mark === 'area') {
            return (
              <Area
                key={s.key}
                dataKey={s.key}
                type="monotone"
                stroke={color}
                strokeWidth={2}
                fill={color}
                fillOpacity={0.15}
                stackId={s.stackId}
                connectNulls
                dot={false}
                isAnimationActive={false}
              />
            );
          }
          return (
            <Line
              key={s.key}
              dataKey={s.key}
              type="monotone"
              stroke={color}
              strokeWidth={2}
              connectNulls
              dot={false}
              isAnimationActive={false}
            />
          );
        })}
      </ComposedChart>
    </ChartContainer>
  );
}

/** A single-axis time series chart (lines, areas or stacked bars) over `{ t }` points. */
export const TimeSeriesChart = memo(
  TimeSeriesChartImpl,
) as typeof TimeSeriesChartImpl;
