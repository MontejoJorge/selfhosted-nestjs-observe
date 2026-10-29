import {
  ChartCaption,
  Panel,
  PanelBody,
  PanelHeader,
} from '@/components/panel';
import {
  ChartContainer,
  ChartTooltip,
  type ChartConfig,
} from '@/components/ui/chart';
import type { UserStatsDto } from '@/lib/api/generated/api';
import { formatCount, formatDuration, formatRate } from '@/lib/format';
import { paths } from '@/lib/paths';
import { useProjectRef, useScopedNavigate } from '@/lib/scope-hooks';
import { useMemo } from 'react';
import { ReferenceArea, Scatter, ScatterChart, XAxis, YAxis } from 'recharts';
import {
  FAILURE_GRADIENT,
  FAILURE_RED_AT,
  failureColor,
  scatterModel,
  type ScatterPoint,
} from './users-math';

const config: ChartConfig = {
  users: { label: 'Users', color: 'var(--chart-3)' },
};

const tick = {
  fontSize: 10,
  fontFamily: 'var(--font-mono)',
  fill: 'var(--muted-foreground)',
};

/** A log-scale domain padded by a share of its span (at least ±10%). */
function logDomain(values: number[]): [number, number] {
  const lo = Math.log(Math.min(...values));
  const hi = Math.log(Math.max(...values));
  const pad = Math.max((hi - lo) * 0.08, Math.log(1.1));
  return [Math.exp(lo - pad), Math.exp(hi + pad)];
}

/** Four geometrically spaced ticks, rounded to two significant digits. */
function logTicks([min, max]: [number, number]): number[] {
  const ratio = max / min;
  return [0.1, 0.37, 0.63, 0.9].map((f) => {
    const value = min * ratio ** f;
    const magnitude = 10 ** (Math.floor(Math.log10(value)) - 1);
    return Math.round(value / magnitude) * magnitude;
  });
}

function PointTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: ScatterPoint }>;
}) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return (
    <div className="grid min-w-44 gap-1 rounded-lg border bg-background px-2.5 py-1.5 text-xs shadow-xl">
      <p className="truncate font-mono font-medium">{point.label}</p>
      <Row label="Requests" value={formatCount(point.requests)} />
      <Row label="P95" value={formatDuration(point.p95)} />
      <Row label="Failure rate" value={formatRate(point.errorRate)} />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="ml-auto font-mono tabular-nums">{value}</span>
    </div>
  );
}

/**
 * One dot per user: requests (x) against p95 (y), both log scales, colored by
 * failure rate. The upper-right quadrant past both medians is "busy & slow".
 */
export function LatencyScatterPanel({
  users,
}: {
  users: readonly UserStatsDto[];
}) {
  const project = useProjectRef();
  const navigate = useScopedNavigate();
  const model = useMemo(() => scatterModel(users), [users]);
  const { points } = model;
  const xDomain = useMemo(
    () => logDomain(points.map((p) => p.requests)),
    [points],
  );
  const yDomain = useMemo(() => logDomain(points.map((p) => p.p95)), [points]);

  return (
    <Panel>
      <PanelHeader
        title="Latency by user"
        aside={
          <span className="inline-flex items-center gap-2 text-[13px] text-muted-foreground">
            Failure rate
            <span className="font-mono text-xs">0%</span>
            <span
              className="h-1.5 w-20 rounded-full"
              style={{ background: FAILURE_GRADIENT }}
              aria-hidden
            />
            <span className="font-mono text-xs">
              {Math.round(FAILURE_RED_AT * 100)}%+
            </span>
          </span>
        }
      />
      <PanelBody>
        {points.length === 0 ? (
          <p className="grid h-56 place-items-center text-sm text-muted-foreground">
            No users to plot.
          </p>
        ) : (
          <ChartContainer config={config} className="aspect-auto h-56 w-full">
            <ScatterChart margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
              <XAxis
                type="number"
                dataKey="requests"
                scale="log"
                domain={xDomain}
                ticks={logTicks(xDomain)}
                allowDataOverflow
                tick={tick}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: number) => formatCount(Math.round(v))}
              />
              <YAxis
                type="number"
                dataKey="p95"
                scale="log"
                domain={yDomain}
                ticks={logTicks(yDomain)}
                allowDataOverflow
                width={56}
                tick={tick}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: number) => formatDuration(v)}
              />
              {model.busyAndSlow > 0 ? (
                <ReferenceArea
                  x1={model.medianRequests}
                  x2={xDomain[1]}
                  y1={model.medianP95}
                  y2={yDomain[1]}
                  fill="var(--primary)"
                  fillOpacity={0.06}
                  stroke="none"
                  label={{
                    value: 'BUSY & SLOW',
                    position: 'insideTopRight',
                    fontSize: 10,
                    fontFamily: 'var(--font-mono)',
                    fill: 'var(--muted-foreground)',
                  }}
                />
              ) : null}
              <ChartTooltip
                cursor={false}
                content={<PointTooltip />}
                isAnimationActive={false}
              />
              <Scatter
                data={points}
                isAnimationActive={false}
                shape={(props: {
                  cx?: number;
                  cy?: number;
                  payload?: ScatterPoint;
                }) => {
                  const { cx = 0, cy = 0, payload: point } = props;
                  if (!point) return <g />;
                  const userId = point.userId;
                  return (
                    <g
                      className={userId ? 'cursor-pointer' : undefined}
                      onClick={
                        userId
                          ? () => navigate(paths.user(project, userId))
                          : undefined
                      }
                    >
                      <circle
                        cx={cx}
                        cy={cy}
                        r={point.flagged ? 5.5 : 4.5}
                        fill={failureColor(point.errorRate)}
                        fillOpacity={0.9}
                        stroke="var(--card)"
                        strokeWidth={1}
                      />
                      {point.flagged ? (
                        <text
                          x={cx + 9}
                          y={cy + 3.5}
                          fontSize={10}
                          fontFamily="var(--font-mono)"
                          fill="var(--foreground)"
                        >
                          {point.label.length > 22
                            ? `${point.label.slice(0, 21)}…`
                            : point.label}{' '}
                          <tspan fontWeight={700}>
                            {formatRate(point.errorRate)}
                          </tspan>
                        </text>
                      ) : null}
                    </g>
                  );
                }}
              />
            </ScatterChart>
          </ChartContainer>
        )}
        <ChartCaption>
          p95 against requests · log scales
          {model.busyAndSlow > 0 ? (
            <span className="text-primary">
              {' '}
              · {formatCount(model.busyAndSlow)} busy & slow
            </span>
          ) : null}
        </ChartCaption>
      </PanelBody>
    </Panel>
  );
}
