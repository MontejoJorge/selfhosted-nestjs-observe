import {
  LatencyChart,
  ThroughputChart,
} from '@/components/charts/bucket-charts';
import { ChartCard } from '@/components/charts/chart-card';
import { Stat, StatGrid } from '@/components/data/stat';
import { Page, PageHeader, PageTitle } from '@/components/page';
import { ScopedLink } from '@/components/scoped-link';
import { EmptyState, NoTelemetryHint } from '@/components/states';
import { TIME_RANGE_LABELS } from '@/lib/api/scope';
import { formatCount, formatDuration, formatRate } from '@/lib/format';
import { useScope } from '@/lib/scope-hooks';
import { useSuspenseQuery } from '@tanstack/react-query';
import { overviewQueryOptions } from './queries';

export function OverviewPage() {
  const scope = useScope();
  const { data } = useSuspenseQuery(overviewQueryOptions(scope));
  const isEmpty =
    data.requests.count === 0 &&
    data.jobs.count === 0 &&
    data.errors.events === 0;

  return (
    <Page>
      <PageHeader>
        <PageTitle eyebrow={scope.service ?? 'All services'}>
          Overview
        </PageTitle>
        <span className="text-xs text-muted-foreground">
          {TIME_RANGE_LABELS[scope.range]}
        </span>
      </PageHeader>

      {isEmpty ? (
        <EmptyState title="No telemetry in this time range">
          <NoTelemetryHint />
        </EmptyState>
      ) : null}

      <StatGrid>
        <Stat
          label={
            <ScopedLink to="/requests" className="hover:underline">
              Requests
            </ScopedLink>
          }
          value={formatCount(data.requests.count)}
          detail={`p50 ${formatDuration(data.requests.latency.p50)}`}
        />
        <Stat
          label="Request error rate"
          value={formatRate(data.requests.errorRate)}
          tone={data.requests.errorRate > 0.05 ? 'critical' : 'default'}
        />
        <Stat
          label="Request p95"
          value={formatDuration(data.requests.latency.p95)}
          detail={`p99 ${formatDuration(data.requests.latency.p99)}`}
        />
        <Stat
          label={
            <ScopedLink to="/jobs" className="hover:underline">
              Job failure rate
            </ScopedLink>
          }
          value={formatRate(data.jobs.failureRate)}
          detail={`${formatCount(data.jobs.count)} jobs`}
          tone={data.jobs.failureRate > 0.05 ? 'critical' : 'default'}
        />
        <Stat
          label={
            <ScopedLink to="/errors" className="hover:underline">
              Error groups
            </ScopedLink>
          }
          value={formatCount(data.errors.groups)}
          detail={`${formatCount(data.errors.events)} events`}
        />
      </StatGrid>

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard title="Throughput" description="Requests per bucket">
          <ThroughputChart buckets={data.timeline} />
        </ChartCard>
        <ChartCard title="Latency" description="Request p95 per bucket">
          <LatencyChart buckets={data.timeline} />
        </ChartCard>
      </div>
    </Page>
  );
}
