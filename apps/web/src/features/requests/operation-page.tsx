import { MethodBadge } from '@/components/data/badges';
import {
  FilterBar,
  InputFilter,
  OptionFilter,
} from '@/components/data/filters';
import { KeyValue, KeyValueList } from '@/components/data/key-value';
import { FailureRate, RoutePath } from '@/components/data/metric-cells';
import { ScopeControls } from '@/components/layout/scope-controls';
import { Page, PageHeader, PageSection } from '@/components/page';
import { Panel, PanelBody, PanelHeader } from '@/components/panel';
import {
  DurationPanel,
  RequestsPanel,
} from '@/features/overview/overview-panels';
import { overviewQueryOptions } from '@/features/overview/queries';
import { usePreviousOverview } from '@/features/overview/use-previous-overview';
import { ProjectTitle } from '@/features/projects/project-title';
import { useReleaseMarkers } from '@/features/releases/use-release-markers';
import { formatCount, formatDuration, formatRelative } from '@/lib/format';
import { useScope, useTypedSearch } from '@/lib/scope-hooks';
import { useSuspenseQuery } from '@tanstack/react-query';
import { operationsQueryOptions } from './queries';
import { RequestTable } from './request-table';
import { operationSearch } from './search';

const STATUS_OPTIONS = [
  { value: 'ok', label: 'Succeeded' },
  { value: 'error', label: 'Failed' },
] as const;

/** One operation: its stats, its charts and the requests that hit it. */
export function OperationPage() {
  const scope = useScope();
  const [search, setSearch] = useTypedSearch(operationSearch);
  // The loader 404s without an operationId.
  const operationId = search.operationId ?? '';
  const filters = { operationId };

  const { data: overview } = useSuspenseQuery(
    overviewQueryOptions(scope, filters),
  );
  const previous = usePreviousOverview(scope, filters);
  const markers = useReleaseMarkers(scope);
  const { data: operations } = useSuspenseQuery(operationsQueryOptions(scope));
  const stats = operations.find(
    (op) =>
      op.operationId === operationId &&
      (!search.method || op.method?.toUpperCase() === search.method),
  );

  return (
    <Page>
      <PageHeader>
        <ProjectTitle subtitle="Throughput, latency and failures per operation.">
          Requests
        </ProjectTitle>
        <ScopeControls />
      </PageHeader>

      <div className="grid min-w-0 gap-6 xl:grid-cols-2">
        <Panel>
          <PanelHeader title="Details" />
          <PanelBody>
            <KeyValueList>
              <KeyValue label="Operation ID">
                <RoutePath value={operationId} />
              </KeyValue>
              <KeyValue label="Method">
                <MethodBadge method={stats?.method ?? search.method ?? null} />
              </KeyValue>
              <KeyValue label="Avg. Duration">
                {formatDuration(overview.requests.latency.avg)}
              </KeyValue>
              <KeyValue label="95th Percentile">
                {formatDuration(overview.requests.latency.p95)}
              </KeyValue>
              <KeyValue label="Count">
                {formatCount(overview.requests.count)}
              </KeyValue>
              <KeyValue label="Errors">
                {formatCount(overview.requests.status4xx)}{' '}
                <span className="text-muted-foreground">(4xx)</span> /{' '}
                {formatCount(overview.requests.status5xx)}{' '}
                <span className="text-muted-foreground">(5xx)</span>
              </KeyValue>
              <KeyValue label="Failure Rate">
                <FailureRate rate={overview.requests.errorRate} />
              </KeyValue>
              <KeyValue label="Last call">
                {stats ? formatRelative(stats.lastSeenAt) : '–'}
              </KeyValue>
            </KeyValueList>
          </PanelBody>
        </Panel>
        <div className="flex min-w-0 flex-col gap-6">
          <RequestsPanel
            overview={overview}
            previous={previous}
            timeWindow={scope}
            layout="header"
            markers={markers}
          />
          <DurationPanel
            overview={overview}
            previous={previous}
            layout="header"
            markers={markers}
          />
        </div>
      </div>

      <PageSection
        title="All requests"
        className="mt-4"
        actions={
          <FilterBar>
            <OptionFilter
              label="Status"
              value={search.status}
              options={STATUS_OPTIONS}
              onChange={(status) => setSearch({ status })}
            />
            <InputFilter
              label="Duration"
              value={
                search.minDuration === undefined
                  ? undefined
                  : String(search.minDuration)
              }
              format={(v) => `≥ ${v} ms`}
              placeholder="Minimum duration in ms"
              inputMode="numeric"
              onChange={(value) => {
                const ms = Number(value);
                setSearch({
                  minDuration:
                    value && Number.isFinite(ms) && ms > 0 ? ms : undefined,
                });
              }}
            />
          </FilterBar>
        }
      >
        <RequestTable
          filters={{
            operationId,
            status: search.status,
            minDuration: search.minDuration,
          }}
        />
      </PageSection>
    </Page>
  );
}
