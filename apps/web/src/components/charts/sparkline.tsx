import { cn } from '@/lib/utils';
import { useId, useMemo } from 'react';
import { Area, AreaChart, ResponsiveContainer, YAxis } from 'recharts';

/**
 * A teal area with a glowing end dot. Decorative: it has no axes or tooltip,
 * so always render the figure it summarizes next to it.
 */
export function Sparkline({
  values,
  className,
  endDot = false,
}: {
  values: readonly (number | null)[];
  className?: string;
  /** Draw a dot on the last point (the project cards). */
  endDot?: boolean;
}) {
  const gradientId = `spark-${useId().replace(/:/g, '')}`;
  const data = useMemo(() => values.map((v, i) => ({ i, v })), [values]);
  const last = data.length - 1;

  return (
    <div className={cn('h-10 w-full', className)} aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 6, right: endDot ? 6 : 0, bottom: 0, left: 0 }}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--teal)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--teal)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <YAxis hide domain={[0, 'dataMax']} />
          <Area
            dataKey="v"
            type="monotone"
            stroke="var(--teal)"
            strokeWidth={1.5}
            fill={`url(#${gradientId})`}
            connectNulls
            isAnimationActive={false}
            dot={
              endDot
                ? (props: { cx?: number; cy?: number; index?: number }) =>
                    props.index === last && props.cx !== undefined ? (
                      <circle
                        key="end"
                        cx={props.cx}
                        cy={props.cy}
                        r={3.5}
                        fill="var(--card)"
                        stroke="var(--teal)"
                        strokeWidth={2}
                      />
                    ) : (
                      <g key={props.index} />
                    )
                : false
            }
            activeDot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
