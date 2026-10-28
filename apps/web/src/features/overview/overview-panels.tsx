import {
  DurationChart,
  ErrorStemChart,
  JobBarsChart,
  RequestBarsChart,
} from '@/components/charts/bucket-charts';
import {
  BigNumber,
  ChartCaption,
  ChartRange,
  CountBadge,
  FigureDetail,
  LegendChip,
  Panel,
  PanelBody,
  PanelHeader,
  Trend,
} from '@/components/panel';
import type { OverviewDto, TimeBucketDto } from '@/lib/api/generated/api';
import type { Scope } from '@/lib/api/scope';
import { formatCount, formatDuration } from '@/lib/format';
import {
  bucketSpread,
  formatClock,
  formatLongDate,
  formatThroughput,
  peakBucket,
  relativeChange,
} from '@/lib/stats';
import type { ReactNode } from 'react';

/**
 * `figure`: the number sits big in the body (project dashboard).
 * `header`: the number is a badge next to the title (activity pages).
 */
export type PanelLayout = 'figure' | 'header';

const STATUS_COLORS = {
  ok: 'var(--bar)',
  c4xx: 'color-mix(in oklch, var(--primary) 55%, var(--bar))',
  c5xx: 'var(--primary)',
};

function TimeRangeFooter({ buckets }: { buckets: readonly TimeBucketDto[] }) {
  if (buckets.length === 0) return null;
  return (
    <ChartRange
      from={formatLongDate(buckets[0].t)}
      to={formatLongDate(buckets[buckets.length - 1].t)}
    />
  );
}

/** Splits a formatted duration ("1.32 s") into number and unit for BigNumber. */
function splitDuration(ms: number | null | undefined): [string, string] {
  const [value, unit = ''] = formatDuration(ms).split(' ');
  return [value, unit];
}

function durationCaption(buckets: readonly TimeBucketDto[]): ReactNode {
  const spread = bucketSpread(buckets, (b) => b.avg);
  if (!spread) return null;
  const withTraffic = buckets.filter((b) => b.count > 0);
  const avgOfAvg =
    withTraffic.reduce((sum, b) => sum + b.avg, 0) / withTraffic.length;
  const avgOfP95 =
    withTraffic.reduce((sum, b) => sum + b.p95, 0) / withTraffic.length;
  const tail = avgOfAvg > 0 ? avgOfP95 / avgOfAvg : 0;
  return (
    <>
      avg between {formatDuration(spread.min)} and {formatDuration(spread.max)}
      {tail >= 2 ? (
        <span className="text-primary">
          {' '}
          · long tail, p95 ×{tail.toFixed(0)} the avg
        </span>
      ) : null}
    </>
  );
}

function peakCaption(
  buckets: readonly TimeBucketDto[],
  noun: string,
): ReactNode {
  const peak = peakBucket(buckets, (b) => b.count);
  if (!peak || peak.count === 0) return null;
  return (
    <>
      peak {formatCount(peak.count)} {noun} at {formatClock(peak.t)}
    </>
  );
}

export function RequestsPanel({
  overview,
  previous,
  range,
  layout,
}: {
  overview: OverviewDto;
  previous: OverviewDto | undefined;
  range: Scope['range'];
  layout: PanelLayout;
}) {
  const { requests, timeline } = overview;
  const okCount = requests.count - requests.status4xx - requests.status5xx;
  const trend = (
    <Trend
      change={
        previous
          ? relativeChange(requests.count, previous.requests.count)
          : null
      }
      suffix={layout === 'figure' ? 'since last period' : undefined}
    />
  );
  return (
    <Panel>
      <PanelHeader
        title="Requests"
        aside={
          <>
            <LegendChip
              color={STATUS_COLORS.ok}
              label="1/2/3xx"
              value={layout === 'header' ? formatCount(okCount) : undefined}
            />
            <LegendChip
              color={STATUS_COLORS.c4xx}
              label="4xx"
              value={
                layout === 'header'
                  ? formatCount(requests.status4xx)
                  : undefined
              }
            />
            <LegendChip
              color={STATUS_COLORS.c5xx}
              label="5xx"
              value={
                layout === 'header'
                  ? formatCount(requests.status5xx)
                  : undefined
              }
            />
          </>
        }
      >
        {layout === 'header' ? (
          <>
            <CountBadge>{formatCount(requests.count)}</CountBadge>
            <span className="font-mono text-sm">
              {formatThroughput(requests.count, range)}
            </span>
            {trend}
          </>
        ) : null}
      </PanelHeader>
      <PanelBody>
        {layout === 'figure' ? (
          <div className="mb-6">
            <BigNumber value={requests.count.toLocaleString('en-US')} />
            <FigureDetail>
              <span>{formatThroughput(requests.count, range)}</span>
              {trend}
            </FigureDetail>
          </div>
        ) : null}
        <RequestBarsChart
          buckets={timeline}
          className={layout === 'figure' ? 'h-56' : undefined}
        />
        <ChartCaption>{peakCaption(timeline, 'requests')}</ChartCaption>
        <TimeRangeFooter buckets={timeline} />
      </PanelBody>
    </Panel>
  );
}

function DurationPanelView({
  title,
  avg,
  p95,
  previousAvg,
  buckets,
  layout,
}: {
  title: string;
  avg: number;
  p95: number;
  previousAvg: number | undefined;
  buckets: readonly TimeBucketDto[];
  layout: PanelLayout;
}) {
  const [value, unit] = splitDuration(avg);
  const trend = (
    <Trend
      change={previousAvg ? relativeChange(avg, previousAvg) : null}
      goodWhen="down"
      suffix={layout === 'figure' ? 'since last period' : undefined}
    />
  );
  return (
    <Panel>
      <PanelHeader
        title={title}
        aside={
          <>
            <LegendChip
              color="var(--primary)"
              label="AVG"
              value={layout === 'header' ? formatDuration(avg) : undefined}
            />
            <LegendChip
              color="var(--primary)"
              label="P95"
              value={layout === 'header' ? formatDuration(p95) : undefined}
            />
          </>
        }
      >
        {layout === 'header' ? trend : null}
      </PanelHeader>
      <PanelBody>
        {layout === 'figure' ? (
          <div className="mb-6">
            <BigNumber value={value} unit={unit} label="avg" />
            <FigureDetail>
              <span>p95 {formatDuration(p95)}</span>
              {trend}
            </FigureDetail>
          </div>
        ) : null}
        <DurationChart
          buckets={buckets}
          className={layout === 'figure' ? 'h-56' : undefined}
        />
        <ChartCaption>{durationCaption(buckets)}</ChartCaption>
        <TimeRangeFooter buckets={buckets} />
      </PanelBody>
    </Panel>
  );
}

export function DurationPanel({
  overview,
  previous,
  layout,
}: {
  overview: OverviewDto;
  previous: OverviewDto | undefined;
  layout: PanelLayout;
}) {
  return (
    <DurationPanelView
      title="Duration"
      avg={overview.requests.latency.avg}
      p95={overview.requests.latency.p95}
      previousAvg={previous?.requests.latency.avg}
      buckets={overview.timeline}
      layout={layout}
    />
  );
}

export function JobsDurationPanel({
  overview,
  previous,
  layout,
}: {
  overview: OverviewDto;
  previous: OverviewDto | undefined;
  layout: PanelLayout;
}) {
  return (
    <DurationPanelView
      title="Jobs duration"
      avg={overview.jobs.latency.avg}
      p95={overview.jobs.latency.p95}
      previousAvg={previous?.jobs.latency.avg}
      buckets={overview.jobsTimeline}
      layout={layout}
    />
  );
}

export function JobsPanel({
  overview,
  previous,
  layout,
}: {
  overview: OverviewDto;
  previous: OverviewDto | undefined;
  layout: PanelLayout;
}) {
  const { jobs, jobsTimeline } = overview;
  const failed = Math.round(jobs.count * jobs.failureRate);
  const trend = (
    <Trend
      change={previous ? relativeChange(jobs.count, previous.jobs.count) : null}
      suffix={layout === 'figure' ? 'since last period' : undefined}
    />
  );
  return (
    <Panel>
      <PanelHeader
        title="Jobs"
        aside={
          <>
            <LegendChip
              color="var(--bar)"
              label="Completed"
              value={formatCount(jobs.count - failed)}
            />
            <LegendChip
              color="var(--primary)"
              label="Failed"
              value={formatCount(failed)}
            />
          </>
        }
      >
        {layout === 'header' ? (
          <>
            <CountBadge>{formatCount(jobs.count)}</CountBadge>
            {trend}
          </>
        ) : null}
      </PanelHeader>
      <PanelBody>
        {layout === 'figure' ? (
          <div className="mb-6">
            <BigNumber
              value={jobs.count.toLocaleString('en-US')}
              label="runs"
            />
            <FigureDetail>
              <span>{(jobs.failureRate * 100).toFixed(2)}% failed</span>
              {trend}
            </FigureDetail>
          </div>
        ) : null}
        <JobBarsChart buckets={jobsTimeline} />
        <ChartCaption>{peakCaption(jobsTimeline, 'runs')}</ChartCaption>
        <TimeRangeFooter buckets={jobsTimeline} />
      </PanelBody>
    </Panel>
  );
}

/** Failed requests and failed job runs per bucket, as one series. */
function failureBuckets(overview: OverviewDto): TimeBucketDto[] {
  const jobsByTime = new Map(overview.jobsTimeline.map((b) => [b.t, b]));
  return overview.timeline.map((b) => ({
    ...b,
    errors: b.errors + (jobsByTime.get(b.t)?.errors ?? 0),
  }));
}

export function ErrorsPanel({
  overview,
  previous,
  layout,
}: {
  overview: OverviewDto;
  previous: OverviewDto | undefined;
  layout: PanelLayout;
}) {
  const requestErrors = Math.round(
    overview.requests.count * overview.requests.errorRate,
  );
  const jobErrors = Math.round(overview.jobs.count * overview.jobs.failureRate);
  const executions = overview.requests.count + overview.jobs.count;
  const rate = executions > 0 ? (requestErrors + jobErrors) / executions : 0;
  const previousRate = previous
    ? (() => {
        const total = previous.requests.count + previous.jobs.count;
        if (total === 0) return undefined;
        return (
          (previous.requests.count * previous.requests.errorRate +
            previous.jobs.count * previous.jobs.failureRate) /
          total
        );
      })()
    : undefined;
  const buckets = failureBuckets(overview);
  const trend = (
    <Trend
      change={previousRate ? relativeChange(rate, previousRate) : null}
      goodWhen="down"
      suffix="since last period"
    />
  );
  return (
    <Panel>
      <PanelHeader
        title="Errors"
        aside={
          <>
            <LegendChip
              color="var(--bar)"
              label="Requests"
              value={formatCount(requestErrors)}
            />
            <LegendChip
              color="var(--primary)"
              label="Jobs"
              value={formatCount(jobErrors)}
            />
          </>
        }
      >
        {layout === 'header' ? (
          <>
            <span className="font-mono text-sm">
              {(rate * 100).toFixed(2)}%
            </span>
            {trend}
          </>
        ) : null}
      </PanelHeader>
      <PanelBody>
        {layout === 'figure' ? (
          <div className="mb-6">
            <BigNumber
              value={(rate * 100).toFixed(2)}
              unit="%"
              label="failed"
            />
            <FigureDetail>
              <span>
                {formatCount(overview.errors.groups)} groups ·{' '}
                {formatCount(overview.errors.events)} events
              </span>
              {trend}
            </FigureDetail>
          </div>
        ) : null}
        <ErrorStemChart
          buckets={buckets}
          className={layout === 'figure' ? 'h-48' : undefined}
        />
        <ChartCaption>
          {executions > 0 ? (
            <span className="text-primary">
              {(rate * 100).toFixed(1)}% of executions
            </span>
          ) : null}
          {overview.errors.groups > 0 ? (
            <> · {formatCount(overview.errors.groups)} distinct errors</>
          ) : null}
        </ChartCaption>
        <TimeRangeFooter buckets={buckets} />
      </PanelBody>
    </Panel>
  );
}
