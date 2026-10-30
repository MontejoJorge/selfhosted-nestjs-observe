import { MethodBadge } from '@/components/data/badges';
import { RoutePath } from '@/components/data/metric-cells';
import { ScopeControls } from '@/components/layout/scope-controls';
import { Page, PageHeader, PanelGrid } from '@/components/page';
import { EmptyState, NoTelemetryHint } from '@/components/states';
import { errorGroupsQueryOptions } from '@/features/errors/queries';
import { ProjectTitle } from '@/features/projects/project-title';
import { operationsQueryOptions } from '@/features/requests/queries';
import { servicesQueryOptions } from '@/features/services/queries';
import { TimeMapPanel } from '@/features/services/time-map-panel';
import { formatCount, formatDuration, formatRelative } from '@/lib/format';
import { paths } from '@/lib/paths';
import { useScope } from '@/lib/scope-hooks';
import {
  useSuspenseInfiniteQuery,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { useMemo } from 'react';
import {
  DurationPanel,
  ErrorsPanel,
  JobsDurationPanel,
  JobsPanel,
  RequestsPanel,
} from './overview-panels';
import { overviewQueryOptions } from './queries';
import { RankedList, type RankedItem } from './ranked-list';
import { usePreviousOverview } from './use-previous-overview';

const RANKED = 12;

function useRankings() {
  const scope = useScope();
  const { data: operations } = useSuspenseQuery(operationsQueryOptions(scope));
  return useMemo(() => {
    const total = operations.reduce((sum, op) => sum + op.count, 0);
    const toItem = (
      op: (typeof operations)[number],
      value: string,
      caption: string,
    ): RankedItem => ({
      key: `${op.protocol}:${op.method}:${op.operationId}`,
      to: paths.operation(scope.project),
      search: { operationId: op.operationId, method: op.method ?? undefined },
      badge: <MethodBadge method={op.method} variant="chip" />,
      label: <RoutePath value={op.operationId} />,
      value,
      caption,
    });
    return {
      outliers: operations
        .toSorted((a, b) => b.latency.p95 - a.latency.p95)
        .slice(0, RANKED)
        .map((op) =>
          toItem(
            op,
            formatDuration(op.latency.p95),
            `p50 ${formatDuration(op.latency.p50)}`,
          ),
        ),
      throughput: operations
        .toSorted((a, b) => b.count - a.count)
        .slice(0, RANKED)
        .map((op) =>
          toItem(
            op,
            op.count.toLocaleString('en-US'),
            `${total > 0 ? Math.round((op.count / total) * 100) : 0}% of requests`,
          ),
        ),
    };
  }, [operations, scope.project]);
}

function TopErrors() {
  const scope = useScope();
  const { data } = useSuspenseInfiniteQuery(errorGroupsQueryOptions(scope, {}));
  const items: RankedItem[] = data.pages
    .flatMap((page) => page.items)
    .slice(0, RANKED)
    .map((group) => ({
      key: group.id,
      to: paths.error(scope.project, group.id),
      badge: (
        <span className="font-mono text-xs font-semibold text-primary">
          {group.errorClass}
        </span>
      ),
      label: (
        <span className="line-clamp-2 text-sm text-foreground/90">
          {group.message}
        </span>
      ),
      value: formatCount(group.count),
      caption: formatRelative(group.lastSeenAt),
    }));
  return (
    <RankedList
      title="Top errors"
      measure="COUNT"
      items={items}
      empty="No errors in this time range."
    />
  );
}

export function DashboardPage() {
  const scope = useScope();
  const { data } = useSuspenseQuery(overviewQueryOptions(scope));
  const previous = usePreviousOverview(scope);
  const { outliers, throughput } = useRankings();
  const { data: services } = useSuspenseQuery(servicesQueryOptions(scope));
  const isEmpty =
    data.requests.count === 0 &&
    data.jobs.count === 0 &&
    data.errors.events === 0;

  return (
    <Page>
      <PageHeader>
        <ProjectTitle subtitle="A quick look at your project: traffic, errors and slow spots.">
          Dashboard
        </ProjectTitle>
        <ScopeControls />
      </PageHeader>

      {isEmpty ? (
        <EmptyState title="No telemetry in this time range">
          <NoTelemetryHint />
        </EmptyState>
      ) : null}

      <PanelGrid>
        <RequestsPanel
          overview={data}
          previous={previous}
          range={scope.range}
          layout="figure"
        />
        <DurationPanel overview={data} previous={previous} layout="figure" />
      </PanelGrid>

      <PanelGrid className="xl:grid-cols-3">
        <RankedList
          title="Performance outliers"
          measure="P95"
          items={outliers}
          empty="No requests in this time range."
        />
        <RankedList
          title="High throughput"
          measure="COUNT"
          items={throughput}
          empty="No requests in this time range."
        />
        <TimeMapPanel
          services={services.services}
          totalSelfMs={services.totalSelfMs}
        />
      </PanelGrid>

      <PanelGrid className="xl:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
        <TopErrors />
        <ErrorsPanel overview={data} previous={previous} layout="figure" />
      </PanelGrid>

      <PanelGrid>
        <JobsPanel overview={data} previous={previous} layout="figure" />
        <JobsDurationPanel
          overview={data}
          previous={previous}
          layout="figure"
        />
      </PanelGrid>
    </Page>
  );
}
