import {
  LinkRow,
  MessageRow,
  NumCell,
  stretchedLink,
  TableFrame,
} from '@/components/data/data-table';
import { DurationPill, FailureRate } from '@/components/data/metric-cells';
import { SortableHead } from '@/components/data/sort';
import {
  useSortedRows,
  type SortAccessors,
} from '@/components/data/use-sorted-rows';
import { ScopedLink } from '@/components/scoped-link';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { UserStatsDto } from '@/lib/api/generated/api';
import { formatCount, formatRelative } from '@/lib/format';
import { paths } from '@/lib/paths';
import { useProjectRef } from '@/lib/scope-hooks';
import { cn } from '@/lib/utils';
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { ANONYMOUS_LABEL, USERS_PAGE_SIZE } from './users-math';

type SortKey = 'user' | 'duration' | 'failureRate' | 'count' | 'lastSeen';

const accessors: SortAccessors<UserStatsDto, SortKey> = {
  user: (row) => row.userId ?? '',
  duration: (row) => row.latency.p95,
  failureRate: (row) => row.errorRate,
  count: (row) => row.requestCount,
  lastSeen: (row) => row.lastSeenAt,
};

/**
 * Users with sortable headers and client-side pages. The anonymous row
 * (requests without a user id) is listed but does not link anywhere.
 * Remount with a `key` to go back to the first page when the rows change.
 */
export function UsersTable({
  users,
  emptyMessage,
  footnote,
}: {
  users: readonly UserStatsDto[];
  emptyMessage: ReactNode;
  footnote?: ReactNode;
}) {
  const project = useProjectRef();
  const { sorted, sort, toggle } = useSortedRows(users, accessors, {
    key: 'count',
    direction: 'desc',
  });
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(sorted.length / USERS_PAGE_SIZE));
  const current = Math.min(page, pageCount - 1);
  const rows = sorted.slice(
    current * USERS_PAGE_SIZE,
    (current + 1) * USERS_PAGE_SIZE,
  );

  return (
    <TableFrame
      footer={
        pageCount > 1 || footnote ? (
          <>
            <Button
              variant="outline"
              size="sm"
              disabled={current === 0}
              onClick={() => setPage(current - 1)}
            >
              <ChevronLeftIcon /> Previous
            </Button>
            <span className="flex flex-col items-center gap-0.5 text-center text-sm">
              Page {current + 1} of {pageCount}
              {footnote ? (
                <span className="font-mono text-xs text-muted-foreground">
                  {footnote}
                </span>
              ) : null}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={current >= pageCount - 1}
              onClick={() => setPage(current + 1)}
            >
              Next <ChevronRightIcon />
            </Button>
          </>
        ) : undefined
      }
    >
      <Table>
        <TableHeader>
          <TableRow>
            <SortableHead sortKey="user" sort={sort} onToggle={toggle}>
              User
            </SortableHead>
            <SortableHead sortKey="duration" sort={sort} onToggle={toggle}>
              Duration
            </SortableHead>
            <SortableHead sortKey="failureRate" sort={sort} onToggle={toggle}>
              Failure rate
            </SortableHead>
            <SortableHead
              sortKey="count"
              sort={sort}
              onToggle={toggle}
              className="text-right"
            >
              Count
            </SortableHead>
            <SortableHead
              sortKey="lastSeen"
              sort={sort}
              onToggle={toggle}
              className="text-right"
            >
              Last interaction
            </SortableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((user) => (
            <UserRow key={user.userId ?? ''} user={user} project={project} />
          ))}
          {rows.length === 0 ? (
            <MessageRow colSpan={5}>{emptyMessage}</MessageRow>
          ) : null}
        </TableBody>
      </Table>
    </TableFrame>
  );
}

function UserRow({ user, project }: { user: UserStatsDto; project: string }) {
  const cells = (
    <>
      <TableCell>
        <DurationPill avg={user.latency.avg} p95={user.latency.p95} />
      </TableCell>
      <TableCell>
        <FailureRate rate={user.errorRate} />
      </TableCell>
      <NumCell>{formatCount(user.requestCount)}</NumCell>
      <TableCell className="text-right text-sm whitespace-nowrap text-muted-foreground">
        {formatRelative(user.lastSeenAt)}
      </TableCell>
    </>
  );

  if (user.userId === null) {
    return (
      <TableRow>
        <TableCell
          className="font-mono text-[13px] text-muted-foreground italic"
          title="Requests without a user id"
        >
          {ANONYMOUS_LABEL}
        </TableCell>
        {cells}
      </TableRow>
    );
  }

  return (
    <LinkRow>
      <TableCell className="max-w-md">
        <ScopedLink
          to={paths.user(project, user.userId)}
          className={cn(stretchedLink, 'block truncate font-mono text-[13px]')}
        >
          {user.userId}
        </ScopedLink>
      </TableCell>
      {cells}
    </LinkRow>
  );
}
