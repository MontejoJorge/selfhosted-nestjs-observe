import { ScopeControls } from '@/components/layout/scope-controls';
import { Page, PageHeader, PageSection } from '@/components/page';
import {
  ChartRange,
  CountBadge,
  LegendChip,
  Panel,
  PanelBody,
  PanelHeader,
  Trend,
} from '@/components/panel';
import { ScopedLink } from '@/components/scoped-link';
import { EmptyState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { applicationsQueryOptions } from '@/features/applications/queries';
import { ProjectTitle } from '@/features/projects/project-title';
import type {
  RuntimeInstanceDto,
  RuntimeMetricsDto,
  RuntimeSeriesPointDto,
} from '@/lib/api/generated/api';
import {
  formatCount,
  formatDuration,
  formatMegabytes,
  formatPercent,
  formatRelative,
} from '@/lib/format';
import { paths } from '@/lib/paths';
import { useScope, useTypedSearch } from '@/lib/scope-hooks';
import { formatLongDate, relativeChange } from '@/lib/stats';
import { cn } from '@/lib/utils';
import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import {
  previousRuntimeMetricsQueryOptions,
  runtimeInstancesQueryOptions,
  runtimeMetricsQueryOptions,
  type RuntimeScope,
} from './queries';
import { RuntimeChart, type RuntimeSeries } from './runtime-chart';
import { profilerSearch } from './search';

const formatRatio = (value: number) => `${(value * 100).toFixed(1)}%`;
const formatPct = (value: number) => `${value.toFixed(1)}%`;
const formatMs = (value: number) => formatDuration(value);

type Pick = keyof RuntimeSeriesPointDto;

/** Mean of the non-null values of `key` (gauges). */
function mean(points: readonly RuntimeSeriesPointDto[], key: Pick) {
  let sum = 0;
  let n = 0;
  for (const point of points) {
    const value = point[key];
    if (typeof value === 'number') {
      sum += value;
      n += 1;
    }
  }
  return n > 0 ? sum / n : null;
}

/** Sum of `keys` over all buckets (counters: CPU ms, GC). */
function total(points: readonly RuntimeSeriesPointDto[], keys: Pick[]) {
  let sum = 0;
  for (const point of points) {
    for (const key of keys) {
      const value = point[key];
      if (typeof value === 'number') sum += value;
    }
  }
  return sum;
}

const C = {
  red: 'var(--primary)',
  teal: 'var(--teal)',
  grey: 'var(--bar)',
  pink: 'color-mix(in oklch, var(--primary) 55%, var(--bar))',
};

interface ChartSpec {
  title: string;
  series: RuntimeSeries[];
  format: (value: number) => string;
  /** How the trend summarizes a series: mean of a gauge or sum of counters. */
  summary: (points: readonly RuntimeSeriesPointDto[]) => number | null;
  /** Lower is better for every runtime measure. */
  avgKey?: Pick;
}

const CHARTS = {
  memory: {
    title: 'Memory',
    series: [
      { key: 'heapUsed', label: 'Heap Used', color: C.red, mark: 'area' },
      {
        key: 'heapTotal',
        label: 'Heap Total',
        color: C.pink,
        mark: 'line',
        dashed: true,
      },
      { key: 'memoryRss', label: 'RSS', color: C.teal, mark: 'line' },
    ],
    format: (v) => formatMegabytes(v),
    summary: (p) => mean(p, 'memoryRss'),
  },
  cpuUtilization: {
    title: 'CPU utilization',
    series: [{ key: 'cpuPercent', label: 'AVG', color: C.red, mark: 'area' }],
    format: formatPct,
    summary: (p) => mean(p, 'cpuPercent'),
    avgKey: 'cpuPercent',
  },
  memoryUtilization: {
    title: 'Memory utilization',
    series: [
      { key: 'memoryPercent', label: 'AVG', color: C.red, mark: 'area' },
    ],
    format: formatPct,
    summary: (p) => mean(p, 'memoryPercent'),
    avgKey: 'memoryPercent',
  },
  cpu: {
    title: 'CPU',
    series: [
      { key: 'cpuUserMs', label: 'User', color: C.grey, mark: 'bar' },
      { key: 'cpuSystemMs', label: 'System', color: C.red, mark: 'bar' },
    ],
    format: formatMs,
    summary: (p) => total(p, ['cpuUserMs', 'cpuSystemMs']),
  },
  gcDuration: {
    title: 'GC duration',
    series: [
      {
        key: 'gcIncrementalMs',
        label: 'Incremental',
        color: C.grey,
        mark: 'bar',
      },
      { key: 'gcMinorMs', label: 'Minor', color: C.pink, mark: 'bar' },
      { key: 'gcMajorMs', label: 'Major', color: C.red, mark: 'bar' },
    ],
    format: formatMs,
    summary: (p) => total(p, ['gcIncrementalMs', 'gcMinorMs', 'gcMajorMs']),
  },
  loopDelay: {
    title: 'Event loop delay',
    series: [
      { key: 'eventLoopLagMs', label: 'AVG', color: C.red, mark: 'area' },
    ],
    format: formatMs,
    summary: (p) => mean(p, 'eventLoopLagMs'),
    avgKey: 'eventLoopLagMs',
  },
  loopUtilization: {
    title: 'Event loop utilization',
    series: [
      {
        key: 'eventLoopUtilization',
        label: 'AVG',
        color: C.red,
        mark: 'area',
      },
    ],
    format: formatRatio,
    summary: (p) => mean(p, 'eventLoopUtilization'),
    avgKey: 'eventLoopUtilization',
  },
  gcCount: {
    title: 'GC count',
    series: [
      {
        key: 'gcIncrementalCount',
        label: 'Incremental',
        color: C.grey,
        mark: 'bar',
      },
      { key: 'gcMinorCount', label: 'Minor', color: C.pink, mark: 'bar' },
      { key: 'gcMajorCount', label: 'Major', color: C.red, mark: 'bar' },
    ],
    format: (v) => formatCount(Math.round(v)),
    summary: (p) =>
      total(p, ['gcIncrementalCount', 'gcMinorCount', 'gcMajorCount']),
  },
} satisfies Record<string, ChartSpec>;

function ChartPanel({
  spec,
  metrics,
  previous,
  tall,
}: {
  spec: ChartSpec;
  metrics: RuntimeMetricsDto;
  previous: RuntimeMetricsDto | undefined;
  /** Spans two rows of the grid. */
  tall?: boolean;
}) {
  const points = metrics.series;
  const current = spec.summary(points);
  const before = previous ? spec.summary(previous.series) : null;
  const avg = spec.avgKey ? mean(points, spec.avgKey) : null;
  return (
    <Panel className={cn(tall && 'xl:row-span-2')}>
      <PanelHeader
        title={spec.title}
        aside={spec.series.map((s) => (
          <LegendChip
            key={s.key}
            color={s.color}
            label={s.label}
            value={
              spec.avgKey ? (avg === null ? '-' : spec.format(avg)) : undefined
            }
          />
        ))}
      >
        {current !== null && before !== null ? (
          <Trend
            change={relativeChange(current, before)}
            goodWhen="down"
            suffix="since last period"
          />
        ) : (
          <span className="text-sm text-muted-foreground">
            no previous period
          </span>
        )}
      </PanelHeader>
      <PanelBody className="flex flex-1 flex-col">
        <RuntimeChart
          points={points}
          series={spec.series}
          format={spec.format}
          className={cn(tall && 'xl:h-auto xl:min-h-44 xl:flex-1')}
        />
        {points.length > 0 ? (
          <ChartRange
            from={formatLongDate(points[0].t)}
            to={formatLongDate(points[points.length - 1].t)}
          />
        ) : null}
      </PanelBody>
    </Panel>
  );
}

function Figure({
  label,
  value,
  detail,
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 px-6 py-5">
      <span className="text-[28px] leading-none font-medium tabular-nums">
        {value}
      </span>
      <span className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase">
        {label}
      </span>
      {detail ? (
        <span className="font-mono text-xs text-muted-foreground">
          {detail}
        </span>
      ) : null}
    </div>
  );
}

function InstanceRow({
  instance,
  selected,
  onSelect,
}: {
  instance: RuntimeInstanceDto;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        'flex min-h-12 w-full flex-wrap items-center gap-x-8 gap-y-1 rounded-lg border px-4 py-2.5 text-left transition-colors',
        selected
          ? 'border-primary/50 bg-linear-to-r from-primary/15 to-primary/5'
          : 'border-transparent bg-foreground/[0.02] hover:bg-foreground/[0.05]',
      )}
    >
      <span className="flex min-w-0 flex-1 items-baseline gap-2">
        <span
          className={cn(
            'truncate font-mono text-sm font-semibold',
            selected && 'text-primary',
          )}
        >
          {instance.serviceId}
        </span>
        {instance.serviceVersion ? (
          <span className="font-mono text-xs text-muted-foreground">
            {instance.serviceVersion}
          </span>
        ) : null}
        <span className="text-xs text-muted-foreground">
          {formatRelative(instance.lastSeenAt)}
        </span>
      </span>
      {[
        ['CPU', formatPercent(instance.cpuPercent)],
        ['Memory', formatPercent(instance.memoryPercent)],
        [
          'Event loop lag',
          instance.eventLoopLagMs === null
            ? '–'
            : formatDuration(instance.eventLoopLagMs),
        ],
      ].map(([label, value]) => (
        <span key={label} className="flex items-baseline gap-2 font-mono">
          <span className="text-[9px] tracking-wider text-muted-foreground uppercase">
            {label}
          </span>
          <span className="text-sm font-semibold tabular-nums">{value}</span>
        </span>
      ))}
    </button>
  );
}

function ProfilerBody({ scope }: { scope: RuntimeScope }) {
  const [, setSearch] = useTypedSearch(profilerSearch);
  const { data: instances } = useSuspenseQuery(
    runtimeInstancesQueryOptions(scope),
  );
  const { data: metrics } = useSuspenseQuery(runtimeMetricsQueryOptions(scope));
  const { data: previous } = useQuery(
    previousRuntimeMetricsQueryOptions(scope),
  );
  const snapshot = metrics.latest ?? metrics.avg;
  const multiple = instances.length > 1;

  return (
    <>
      <PageSection
        title={
          <span className="inline-flex items-center gap-2">
            Instances <CountBadge>{instances.length}</CountBadge>
          </span>
        }
        actions={
          multiple ? (
            <span className="text-sm text-muted-foreground">
              {scope.instance
                ? 'Showing one instance. Click it again to see them all.'
                : 'Averaged over all instances. Select one to filter.'}
            </span>
          ) : null
        }
      >
        {instances.length === 0 ? (
          <EmptyState title="No runtime samples in this time range">
            The agent reports CPU, memory, event loop and GC metrics every few
            seconds once it is running with this application's API key.
          </EmptyState>
        ) : (
          <div className="flex flex-col gap-1.5">
            {instances.map((instance) => (
              <InstanceRow
                key={instance.serviceId}
                instance={instance}
                selected={scope.instance === instance.serviceId}
                onSelect={() =>
                  setSearch({
                    instance:
                      scope.instance === instance.serviceId
                        ? undefined
                        : instance.serviceId,
                  })
                }
              />
            ))}
          </div>
        )}
      </PageSection>

      <Panel>
        <PanelHeader
          title="Runtime"
          aside={
            <span className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase">
              {metrics.latest
                ? `latest sample · ${metrics.latest.serviceId} · ${formatRelative(metrics.latest.sampledAt)}`
                : 'range average'}
            </span>
          }
        />
        <div className="grid grid-cols-2 divide-x divide-y lg:grid-cols-4 lg:divide-y-0">
          <Figure label="CPU" value={formatPercent(snapshot.cpuPercent)} />
          <Figure
            label="Memory"
            value={formatPercent(snapshot.memoryPercent)}
            detail={`RSS ${formatMegabytes(snapshot.memoryRss)}`}
          />
          <Figure
            label="Loop utilisation"
            value={
              snapshot.eventLoopUtilization === null
                ? '–'
                : formatRatio(snapshot.eventLoopUtilization)
            }
          />
          <Figure
            label="Loop lag"
            value={
              snapshot.eventLoopLagMs === null
                ? '–'
                : formatDuration(snapshot.eventLoopLagMs)
            }
          />
        </div>
      </Panel>

      <div className="grid min-w-0 gap-6 xl:grid-cols-2">
        <ChartPanel
          spec={CHARTS.memory}
          metrics={metrics}
          previous={previous}
          tall
        />
        <ChartPanel
          spec={CHARTS.cpuUtilization}
          metrics={metrics}
          previous={previous}
        />
        <ChartPanel
          spec={CHARTS.memoryUtilization}
          metrics={metrics}
          previous={previous}
        />
        <ChartPanel spec={CHARTS.cpu} metrics={metrics} previous={previous} />
        <ChartPanel
          spec={CHARTS.gcDuration}
          metrics={metrics}
          previous={previous}
        />
        <ChartPanel
          spec={CHARTS.loopDelay}
          metrics={metrics}
          previous={previous}
        />
        <ChartPanel
          spec={CHARTS.gcCount}
          metrics={metrics}
          previous={previous}
          tall
        />
        <ChartPanel
          spec={CHARTS.loopUtilization}
          metrics={metrics}
          previous={previous}
        />
      </div>
    </>
  );
}

/** Runtime metrics of one application (CPU, memory, event loop, GC), per instance. */
export function ProfilerPage() {
  const scope = useScope();
  const [search] = useTypedSearch(profilerSearch);
  const { data: applications } = useSuspenseQuery(
    applicationsQueryOptions(scope.project, scope.range),
  );
  // Runtime metrics are per application: default to the first one.
  const application = scope.application ?? applications.items[0]?.id;

  return (
    <Page>
      <PageHeader>
        <ProjectTitle subtitle="Runtime metrics from each running instance.">
          Profiler
        </ProjectTitle>
        <ScopeControls defaultApplication={application} />
      </PageHeader>
      {application ? (
        <ProfilerBody
          scope={{
            project: scope.project,
            application,
            range: scope.range,
            instance: search.instance,
          }}
        />
      ) : (
        <EmptyState
          title="No applications yet"
          action={
            <Button variant="outline" size="lg" asChild>
              <ScopedLink to={paths.applications(scope.project)}>
                Go to Applications
              </ScopedLink>
            </Button>
          }
        >
          Create an application and run its agent to see runtime metrics.
        </EmptyState>
      )}
    </Page>
  );
}
