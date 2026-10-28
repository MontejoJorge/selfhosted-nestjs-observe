import {
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { formatLongDate } from '@/lib/stats';

export type Formatter = (value: number) => string;

/** The shared tooltip: long date, then one colored row per series. */
export function chartTooltip(config: ChartConfig, format: Formatter) {
  return (
    <ChartTooltip
      cursor={{
        stroke: 'var(--border)',
        fill: 'var(--muted)',
        fillOpacity: 0.3,
      }}
      content={
        <ChartTooltipContent
          labelFormatter={(_, payload) => {
            const t = (payload?.[0]?.payload as { t?: string } | undefined)?.t;
            return t ? formatLongDate(t) : null;
          }}
          formatter={(value, name, item) => (
            <div className="flex w-full items-center gap-2">
              <span
                className="h-3 w-[3px] shrink-0 rounded-full"
                style={{ background: item.color }}
              />
              <span className="text-muted-foreground">
                {config[String(name)]?.label ?? name}
              </span>
              <span className="ml-auto font-mono font-medium text-foreground tabular-nums">
                {typeof value === 'number' ? format(value) : String(value)}
              </span>
            </div>
          )}
        />
      }
    />
  );
}
