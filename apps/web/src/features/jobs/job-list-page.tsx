import { JobStatusBadge } from '@/components/data/badges';
import {
  LinkRow,
  NumCell,
  stretchedLink,
  TableFrame,
} from '@/components/data/data-table';
import { FilterBar, FilterChip, OptionFilter } from '@/components/data/filters';
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
import { useSuspenseInfiniteQuery } from '@tanstack/react-query';
import { useCallback } from 'react';
import { jobListQueryOptions, type JobFilters } from './queries';
import { jobListSearch } from './search';

const STATUS_OPTIONS = [
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
] as const;

export function JobListPage() {
  const scope = useScope();
  const [filters, setSearch] = useTypedSearch(jobListSearch);
  const query = useSuspenseInfiniteQuery(jobListQueryOptions(scope, filters));
  const rows = query.data.pages.flatMap((page) => page.items);

  const setFilter = useCallback(
    (patch: Partial<JobFilters>) => setSearch(patch),
    [setSearch],
  );
  const hasFilters = Object.values(filters).some(
    (value) => value !== undefined,
  );
  const title =
    filters.queue && filters.name
      ? `${filters.queue}/${filters.name}`
      : (filters.name ?? filters.queue ?? 'All jobs');

  return (
    <Page>
      <PageHeader>
        <PageTitle
          eyebrow={
            <ScopedLink to="/jobs" className="hover:underline">
              Jobs
            </ScopedLink>
          }
        >
          <span className="font-mono">{title}</span>
        </PageTitle>
      </PageHeader>

      <FilterBar>
        <OptionFilter
          label="Status"
          value={filters.status}
          options={STATUS_OPTIONS}
          onChange={(status) => setFilter({ status })}
        />
        {filters.queue ? (
          <FilterChip
            label="queue"
            value={filters.queue}
            onClear={() => setFilter({ queue: undefined })}
          />
        ) : null}
        {filters.name ? (
          <FilterChip
            label="name"
            value={filters.name}
            onClear={() => setFilter({ name: undefined })}
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
              ? 'No jobs match these filters'
              : 'No jobs in this time range'
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
                  <TableHead>Queue / job</TableHead>
                  <TableHead>Job ID</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Duration</TableHead>
                  <TableHead className="text-right">Wait</TableHead>
                  <TableHead className="text-right">Attempts</TableHead>
                  <TableHead>Trace</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((job) => (
                  <LinkRow key={job.id}>
                    <TableCell className="font-mono text-xs whitespace-nowrap">
                      <ScopedLink
                        to={paths.job(job.id)}
                        className={stretchedLink}
                      >
                        {formatDateTime(job.calledAt)}
                      </ScopedLink>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      <span className="text-muted-foreground">
                        {job.queue}/
                      </span>
                      {job.name}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {job.jobId}
                    </TableCell>
                    <TableCell>
                      <JobStatusBadge status={job.status} />
                    </TableCell>
                    <NumCell>{formatDuration(job.durationMs)}</NumCell>
                    <NumCell>{formatDuration(job.waitMs)}</NumCell>
                    <NumCell>
                      {job.attemptsMade ?? '–'}
                      {job.maxAttempts ? ` / ${job.maxAttempts}` : ''}
                    </NumCell>
                    <TableCell>
                      <ScopedLink
                        to={paths.trace(job.traceId)}
                        className="relative z-10 font-mono text-xs text-primary hover:underline"
                      >
                        {shortId(job.traceId)}
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
