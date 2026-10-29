import { StatusCodeBadge } from '@/components/data/badges';
import { IdChip } from '@/components/data/copy';
import {
  LinkRow,
  stretchedLink,
  TableFrame,
} from '@/components/data/data-table';
import { LoadMore } from '@/components/data/load-more';
import { Duration, RoutePath } from '@/components/data/metric-cells';
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
import { formatRelative } from '@/lib/format';
import { paths } from '@/lib/paths';
import { useScope } from '@/lib/scope-hooks';
import { cn } from '@/lib/utils';
import { useSuspenseInfiniteQuery } from '@tanstack/react-query';
import { requestListQueryOptions, type RequestFilters } from './queries';

/**
 * The paginated request list for a set of filters (one operation, one user...).
 * Rows link to the request detail; the user id links to the user's page. When
 * the list is already scoped to one user, the user column is left out.
 */
export function RequestTable({ filters }: { filters: RequestFilters }) {
  const scope = useScope();
  const query = useSuspenseInfiniteQuery(
    requestListQueryOptions(scope, filters),
  );
  const rows = query.data.pages.flatMap((page) => page.items);
  const showUser = filters.userId === undefined;

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
            {showUser ? <TableHead>User</TableHead> : null}
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
              {showUser ? (
                <TableCell className="max-w-48 truncate text-sm">
                  {request.userId ? (
                    <ScopedLink
                      to={paths.user(scope.project, request.userId)}
                      className="relative z-10 hover:underline"
                    >
                      {request.userId}
                    </ScopedLink>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </TableCell>
              ) : null}
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
