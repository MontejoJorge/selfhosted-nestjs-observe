import { MethodBadge, StatusCodeBadge } from '@/components/data/badges';
import { IdChip } from '@/components/data/copy';
import {
  LinkRow,
  stretchedLink,
  TableFrame,
} from '@/components/data/data-table';
import {
  FilterBar,
  InputFilter,
  OptionFilter,
} from '@/components/data/filters';
import { KeyValue, KeyValueList } from '@/components/data/key-value';
import { LoadMore } from '@/components/data/load-more';
import {
  Duration,
  FailureRate,
  RoutePath,
} from '@/components/data/metric-cells';
import { ScopeControls } from '@/components/layout/scope-controls';
import { Page, PageHeader, PageSection } from '@/components/page';
import { Panel, PanelBody, PanelHeader } from '@/components/panel';
import { ScopedLink } from '@/components/scoped-link';
import { EmptyState } from '@/components/states';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DurationPanel,
  RequestsPanel,
} from '@/features/overview/overview-panels';
import { overviewQueryOptions } from '@/features/overview/queries';
import { usePreviousOverview } from '@/features/overview/use-previous-overview';
import { ProjectTitle } from '@/features/projects/project-title';
import { formatCount, formatDuration, formatRelative } from '@/lib/format';
import { paths } from '@/lib/paths';
import { useScope, useTypedSearch } from '@/lib/scope-hooks';
import { cn } from '@/lib/utils';
import {
  useSuspenseInfiniteQuery,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { operationsQueryOptions, requestListQueryOptions } from './queries';
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
  const { data: operations } = useSuspenseQuery(operationsQueryOptions(scope));
  const stats = operations.find(
    (op) =>
      op.operationId === operationId &&
      (!search.method || op.method?.toUpperCase() === search.method),
  );

  return (
    <Page>
      <PageHeader>
        <ProjectTitle subtitle="View and analyze requests made to your applications.">
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
            range={scope.range}
            layout="header"
          />
          <DurationPanel
            overview={overview}
            previous={previous}
            layout="header"
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
          operationId={operationId}
          status={search.status}
          minDuration={search.minDuration}
        />
      </PageSection>
    </Page>
  );
}

function RequestTable({
  operationId,
  status,
  minDuration,
}: {
  operationId: string;
  status: 'ok' | 'error' | undefined;
  minDuration: number | undefined;
}) {
  const scope = useScope();
  const query = useSuspenseInfiniteQuery(
    requestListQueryOptions(scope, { operationId, status, minDuration }),
  );
  const rows = query.data.pages.flatMap((page) => page.items);

  if (rows.length === 0) {
    return <EmptyState title="No requests match these filters" />;
  }

  return (
    <TableFrame
      footer={
        <LoadMore
          shown={rows.length}
          hasNextPage={query.hasNextPage}
          isFetchingNextPage={query.isFetchingNextPage}
          fetchNextPage={query.fetchNextPage}
        />
      }
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Trace ID</TableHead>
            <TableHead>URL</TableHead>
            <TableHead>Status code</TableHead>
            <TableHead>Duration</TableHead>
            <TableHead>User</TableHead>
            <TableHead className="text-right">Called at</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((request) => (
            <LinkRow key={request.id}>
              <TableCell className="w-40">
                <IdChip value={request.traceId} />
              </TableCell>
              <TableCell className="max-w-md">
                <ScopedLink
                  to={paths.request(scope.project, request.id)}
                  className={cn(stretchedLink, 'block truncate')}
                >
                  <RoutePath value={request.url ?? request.operationId} />
                </ScopedLink>
              </TableCell>
              <TableCell>
                <StatusCodeBadge code={request.statusCode} />
              </TableCell>
              <TableCell>
                <Duration ms={request.durationMs} />
              </TableCell>
              <TableCell className="max-w-48 truncate text-sm">
                {request.userId ?? (
                  <span className="text-muted-foreground">-</span>
                )}
              </TableCell>
              <TableCell className="text-right text-sm whitespace-nowrap text-muted-foreground">
                {formatRelative(request.calledAt)}
              </TableCell>
            </LinkRow>
          ))}
        </TableBody>
      </Table>
    </TableFrame>
  );
}
