import {
  MethodBadge,
  RequestOutcomeBadge,
  StatusCodeBadge,
} from '@/components/data/badges';
import {
  LinkRow,
  NumCell,
  stretchedLink,
  TableFrame,
} from '@/components/data/data-table';
import {
  DebouncedInput,
  FilterBar,
  FilterChip,
  OptionFilter,
} from '@/components/data/filters';
import { LoadMore } from '@/components/data/load-more';
import { Page, PageHeader, PageTitle } from '@/components/page';
import { ScopedLink } from '@/components/scoped-link';
import { EmptyState, NoTelemetryHint } from '@/components/states';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatDateTime, formatDuration, shortId } from '@/lib/format';
import { paths } from '@/lib/paths';
import { useScope, useTypedSearch } from '@/lib/scope-hooks';
import { cn } from '@/lib/utils';
import { useSuspenseInfiniteQuery } from '@tanstack/react-query';
import { useCallback } from 'react';
import { requestListQueryOptions, type RequestFilters } from './queries';
import { requestListSearch } from './search';

const STATUS_OPTIONS = [
  { value: 'ok', label: 'Succeeded' },
  { value: 'error', label: 'Failed' },
] as const;

export function RequestListPage() {
  const scope = useScope();
  const [filters, setSearch] = useTypedSearch(requestListSearch);
  const query = useSuspenseInfiniteQuery(
    requestListQueryOptions(scope, filters),
  );
  const rows = query.data.pages.flatMap((page) => page.items);

  const setFilter = useCallback(
    (patch: Partial<RequestFilters>) => setSearch(patch),
    [setSearch],
  );
  const commitMinDuration = useCallback(
    (value: string) => {
      const ms = Number(value);
      setFilter({
        minDuration: value && Number.isFinite(ms) && ms > 0 ? ms : undefined,
      });
    },
    [setFilter],
  );
  const hasFilters = Object.values(filters).some(
    (value) => value !== undefined,
  );

  return (
    <Page>
      <PageHeader>
        <PageTitle
          eyebrow={
            <ScopedLink to="/requests" className="hover:underline">
              Requests
            </ScopedLink>
          }
        >
          {filters.operationId ?? 'All requests'}
        </PageTitle>
      </PageHeader>

      <FilterBar>
        <OptionFilter
          label="Status"
          value={filters.status}
          options={STATUS_OPTIONS}
          onChange={(status) => setFilter({ status })}
        />
        <DebouncedInput
          key={filters.minDuration ?? ''}
          value={filters.minDuration ? String(filters.minDuration) : ''}
          onCommit={commitMinDuration}
          placeholder="Min duration (ms)"
          aria-label="Minimum duration in milliseconds"
          inputMode="numeric"
          icon={false}
          className="w-36"
        />
        {filters.operationId ? (
          <FilterChip
            label="operation"
            value={filters.operationId}
            onClear={() => setFilter({ operationId: undefined })}
          />
        ) : null}
        {filters.traceId ? (
          <FilterChip
            label="trace"
            value={filters.traceId}
            onClear={() => setFilter({ traceId: undefined })}
          />
        ) : null}
      </FilterBar>

      {rows.length === 0 ? (
        <EmptyState
          title={
            hasFilters
              ? 'No requests match these filters'
              : 'No requests in this time range'
          }
        >
          {hasFilters ? null : <NoTelemetryHint />}
        </EmptyState>
      ) : (
        <>
          <TableFrame>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Operation</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Outcome</TableHead>
                  <TableHead className="text-right">Duration</TableHead>
                  <TableHead>Service</TableHead>
                  <TableHead>Trace</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((request) => (
                  <LinkRow key={request.id}>
                    <TableCell className="font-mono text-xs whitespace-nowrap">
                      <ScopedLink
                        to={paths.request(request.id)}
                        className={stretchedLink}
                      >
                        {formatDateTime(request.calledAt)}
                      </ScopedLink>
                    </TableCell>
                    <TableCell className="max-w-md">
                      <div className="flex items-center gap-2">
                        <MethodBadge method={request.method} />
                        <span
                          className="truncate font-mono text-xs"
                          title={request.url ?? undefined}
                        >
                          {request.url ?? request.operationId}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusCodeBadge code={request.statusCode} />
                    </TableCell>
                    <TableCell>
                      <RequestOutcomeBadge hasError={request.hasError} />
                    </TableCell>
                    <NumCell>{formatDuration(request.durationMs)}</NumCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {request.serviceId}
                    </TableCell>
                    <TableCell>
                      <ScopedLink
                        to={paths.trace(request.traceId)}
                        className={cn(
                          'relative z-10 font-mono text-xs text-primary hover:underline',
                        )}
                      >
                        {shortId(request.traceId)}
                      </ScopedLink>
                    </TableCell>
                  </LinkRow>
                ))}
              </TableBody>
            </Table>
          </TableFrame>
          <LoadMore
            shown={rows.length}
            hasNextPage={query.hasNextPage}
            isFetchingNextPage={query.isFetchingNextPage}
            fetchNextPage={query.fetchNextPage}
          />
        </>
      )}
    </Page>
  );
}
