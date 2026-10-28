import { SourceBadge } from '@/components/data/badges';
import {
  LinkRow,
  NumCell,
  stretchedLink,
  TableFrame,
} from '@/components/data/data-table';
import { FilterBar } from '@/components/data/filters';
import { LoadMore } from '@/components/data/load-more';
import { Page, PageHeader, PageTitle } from '@/components/page';
import { EmptyState } from '@/components/states';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatCount, formatRelative } from '@/lib/format';
import { useScope } from '@/lib/scope-hooks';
import { useSuspenseInfiniteQuery } from '@tanstack/react-query';
import { getRouteApi, Link } from '@tanstack/react-router';
import { errorGroupsQueryOptions } from './queries';

const route = getRouteApi('/errors/');

const ALL = 'all';

export function ErrorGroupsPage() {
  const scope = useScope();
  const filters = route.useLoaderDeps({ select: (deps) => deps.filters });
  const navigate = route.useNavigate();
  const query = useSuspenseInfiniteQuery(
    errorGroupsQueryOptions(scope, filters),
  );
  const groups = query.data.pages.flatMap((page) => page.items);

  return (
    <Page>
      <PageHeader>
        <PageTitle>Errors</PageTitle>
      </PageHeader>

      <FilterBar>
        <Tabs
          value={filters.source ?? ALL}
          onValueChange={(value) =>
            void navigate({
              search: (prev) => ({
                ...prev,
                source:
                  value === ALL ? undefined : (value as 'request' | 'job'),
              }),
            })
          }
        >
          <TabsList>
            <TabsTrigger value={ALL}>All</TabsTrigger>
            <TabsTrigger value="request">Requests</TabsTrigger>
            <TabsTrigger value="job">Jobs</TabsTrigger>
          </TabsList>
        </Tabs>
      </FilterBar>

      {groups.length === 0 ? (
        <EmptyState title="No errors in this time range">
          Errors thrown by requests and jobs are grouped here by fingerprint.
        </EmptyState>
      ) : (
        <>
          <TableFrame>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Error</TableHead>
                  <TableHead>Culprit</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Service</TableHead>
                  <TableHead className="text-right">Events</TableHead>
                  <TableHead className="text-right">First seen</TableHead>
                  <TableHead className="text-right">Last seen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.map((group) => (
                  <LinkRow key={group.id}>
                    <TableCell className="max-w-lg">
                      <Link
                        to="/errors/$errorId"
                        params={{ errorId: group.id }}
                        className={stretchedLink}
                      >
                        <div className="truncate font-mono text-xs font-semibold text-status-error">
                          {group.errorClass ?? 'Error'}
                        </div>
                        <div className="truncate text-xs">{group.message}</div>
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-xs truncate font-mono text-xs text-muted-foreground">
                      {group.culprit ?? '–'}
                    </TableCell>
                    <TableCell>
                      <SourceBadge source={group.source} />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {group.serviceId}
                    </TableCell>
                    <NumCell>{formatCount(group.count)}</NumCell>
                    <NumCell className="text-muted-foreground">
                      {formatRelative(group.firstSeenAt)}
                    </NumCell>
                    <NumCell className="text-muted-foreground">
                      {formatRelative(group.lastSeenAt)}
                    </NumCell>
                  </LinkRow>
                ))}
              </TableBody>
            </Table>
          </TableFrame>
          <LoadMore
            shown={groups.length}
            hasNextPage={query.hasNextPage}
            isFetchingNextPage={query.isFetchingNextPage}
            fetchNextPage={query.fetchNextPage}
          />
        </>
      )}
    </Page>
  );
}
