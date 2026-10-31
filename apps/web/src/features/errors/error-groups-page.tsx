import { SourceBadge } from '@/components/data/badges';
import {
  LinkRow,
  NumCell,
  stretchedLink,
  TableFrame,
} from '@/components/data/data-table';
import {
  DebouncedInput,
  FilterBar,
  OptionFilter,
} from '@/components/data/filters';
import { LoadMore } from '@/components/data/load-more';
import { ScopeControls } from '@/components/layout/scope-controls';
import { Page, PageHeader } from '@/components/page';
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
import { useApplicationNames } from '@/features/applications/use-application-names';
import { ErrorsPanel } from '@/features/overview/overview-panels';
import { overviewQueryOptions } from '@/features/overview/queries';
import { usePreviousOverview } from '@/features/overview/use-previous-overview';
import { ProjectTitle } from '@/features/projects/project-title';
import { formatCount, formatRelative } from '@/lib/format';
import { paths } from '@/lib/paths';
import { useScope, useTypedSearch } from '@/lib/scope-hooks';
import { cn } from '@/lib/utils';
import {
  useSuspenseInfiniteQuery,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { errorGroupsQueryOptions } from './queries';
import { errorListSearch } from './search';

const SOURCE_OPTIONS = [
  { value: 'request', label: 'Requests' },
  { value: 'job', label: 'Jobs' },
] as const;

export function ErrorGroupsPage() {
  const scope = useScope();
  const [filters, setSearch] = useTypedSearch(errorListSearch);
  const { data: overview } = useSuspenseQuery(overviewQueryOptions(scope));
  const previous = usePreviousOverview(scope);
  const query = useSuspenseInfiniteQuery(
    errorGroupsQueryOptions(scope, filters),
  );
  const names = useApplicationNames();
  const groups = query.data.pages.flatMap((page) => page.items);
  const hasFilters = filters.source !== undefined || filters.q !== undefined;

  return (
    <Page>
      <PageHeader>
        <ProjectTitle subtitle="What is failing, how often and since when.">
          Errors
        </ProjectTitle>
        <ScopeControls />
      </PageHeader>

      <ErrorsPanel overview={overview} previous={previous} layout="header" />

      <div className="mt-4 flex flex-col gap-3">
        <FilterBar
          aside={
            <DebouncedInput
              key={`q:${filters.q ?? ''}`}
              value={filters.q ?? ''}
              onCommit={(q) => setSearch({ q: q.trim() || undefined })}
              aria-label="Search errors"
            />
          }
        >
          <OptionFilter
            label="Source"
            value={filters.source}
            options={SOURCE_OPTIONS}
            onChange={(source) => setSearch({ source })}
          />
        </FilterBar>

        {groups.length === 0 ? (
          <EmptyState
            title={
              hasFilters
                ? 'No errors match these filters'
                : 'No errors in this time range'
            }
          >
            {hasFilters ? null : <NoTelemetryHint />}
          </EmptyState>
        ) : (
          <TableFrame
            footer={
              <LoadMore
                shown={groups.length}
                hasNextPage={query.hasNextPage}
                isFetchingNextPage={query.isFetchingNextPage}
                fetchNextPage={query.fetchNextPage}
              />
            }
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Error</TableHead>
                  <TableHead className="text-right">Count</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Application</TableHead>
                  <TableHead>First seen</TableHead>
                  <TableHead className="text-right">Last occurrence</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.map((group) => (
                  <LinkRow key={group.id}>
                    <TableCell className="h-[70px]! max-w-xl">
                      <ScopedLink
                        to={paths.error(scope.project, group.id)}
                        className={cn(
                          stretchedLink,
                          'flex min-w-0 flex-col gap-1',
                        )}
                      >
                        <span className="truncate font-mono text-[13px]">
                          {group.message}
                        </span>
                        <span className="truncate font-mono text-xs text-primary">
                          {group.errorClass ?? 'Error'}
                          {group.culprit ? (
                            <span className="text-muted-foreground">
                              {' '}
                              · {group.culprit}
                            </span>
                          ) : null}
                        </span>
                      </ScopedLink>
                    </TableCell>
                    <NumCell>{formatCount(group.count)}</NumCell>
                    <TableCell>
                      <SourceBadge source={group.source} />
                    </TableCell>
                    <TableCell className="text-sm">
                      {names.get(group.applicationId) ?? group.serviceId}
                    </TableCell>
                    <TableCell className="text-sm whitespace-nowrap text-muted-foreground">
                      {formatRelative(group.firstSeenAt)}
                    </TableCell>
                    <TableCell className="text-right text-sm whitespace-nowrap text-muted-foreground">
                      {formatRelative(group.lastSeenAt)}
                    </TableCell>
                  </LinkRow>
                ))}
              </TableBody>
            </Table>
          </TableFrame>
        )}
      </div>
    </Page>
  );
}
