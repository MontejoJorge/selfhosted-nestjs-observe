import { MethodBadge } from '@/components/data/badges';
import {
  LinkRow,
  NumCell,
  stretchedLink,
  TableFrame,
} from '@/components/data/data-table';
import { SortableHead } from '@/components/data/sort';
import {
  useSortedRows,
  type SortAccessors,
} from '@/components/data/use-sorted-rows';
import { Page, PageActions, PageHeader, PageTitle } from '@/components/page';
import { EmptyState, NoTelemetryHint } from '@/components/states';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  formatCount,
  formatDuration,
  formatRate,
  formatRelative,
} from '@/lib/format';
import { useScope } from '@/lib/scope-hooks';
import { cn } from '@/lib/utils';
import type { OperationStats } from '@selfhosted-observe/contracts';
import { useSuspenseQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useDeferredValue, useMemo, useState } from 'react';
import { operationsQueryOptions } from './queries';

type SortKey =
  'operation' | 'count' | 'errorRate' | 'p50' | 'p95' | 'p99' | 'lastSeen';

const accessors: SortAccessors<OperationStats, SortKey> = {
  operation: (row) => row.operationId,
  count: (row) => row.count,
  errorRate: (row) => row.errorRate,
  p50: (row) => row.latency.p50,
  p95: (row) => row.latency.p95,
  p99: (row) => row.latency.p99,
  lastSeen: (row) => row.lastSeenAt,
};

export function OperationsPage() {
  const scope = useScope();
  const { data } = useSuspenseQuery(operationsQueryOptions(scope));
  const [filter, setFilter] = useState('');
  const deferredFilter = useDeferredValue(filter);

  const filtered = useMemo(() => {
    const needle = deferredFilter.trim().toLowerCase();
    return needle
      ? data.filter((op) => op.operationId.toLowerCase().includes(needle))
      : data;
  }, [data, deferredFilter]);

  const { sorted, sort, toggle } = useSortedRows(filtered, accessors, {
    key: 'count',
    direction: 'desc',
  });

  return (
    <Page>
      <PageHeader>
        <PageTitle eyebrow="Requests">Operations</PageTitle>
        <PageActions>
          <Input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Filter operations…"
            aria-label="Filter operations"
            className="h-7 w-64 text-xs"
          />
          <Link
            to="/requests/list"
            className="text-xs text-muted-foreground hover:text-foreground hover:underline"
          >
            All requests →
          </Link>
        </PageActions>
      </PageHeader>

      {data.length === 0 ? (
        <EmptyState title="No requests in this time range">
          <NoTelemetryHint />
        </EmptyState>
      ) : (
        <TableFrame>
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHead sortKey="operation" sort={sort} onToggle={toggle}>
                  Operation
                </SortableHead>
                <TableHead className="text-xs">Protocol</TableHead>
                <SortableHead
                  sortKey="count"
                  sort={sort}
                  onToggle={toggle}
                  className="text-right"
                >
                  Requests
                </SortableHead>
                <SortableHead
                  sortKey="errorRate"
                  sort={sort}
                  onToggle={toggle}
                  className="text-right"
                >
                  Error rate
                </SortableHead>
                <SortableHead
                  sortKey="p50"
                  sort={sort}
                  onToggle={toggle}
                  className="text-right"
                >
                  p50
                </SortableHead>
                <SortableHead
                  sortKey="p95"
                  sort={sort}
                  onToggle={toggle}
                  className="text-right"
                >
                  p95
                </SortableHead>
                <SortableHead
                  sortKey="p99"
                  sort={sort}
                  onToggle={toggle}
                  className="text-right"
                >
                  p99
                </SortableHead>
                <SortableHead
                  sortKey="lastSeen"
                  sort={sort}
                  onToggle={toggle}
                  className="text-right"
                >
                  Last seen
                </SortableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((op) => (
                <LinkRow key={`${op.protocol}:${op.operationId}`}>
                  <TableCell className="max-w-md">
                    <div className="flex items-center gap-2">
                      <MethodBadge method={op.method} />
                      <Link
                        to="/requests/list"
                        search={{ operationId: op.operationId }}
                        className={cn(
                          stretchedLink,
                          'truncate font-mono text-xs',
                        )}
                      >
                        {op.operationId}
                      </Link>
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {op.protocol}
                  </TableCell>
                  <NumCell>{formatCount(op.count)}</NumCell>
                  <NumCell
                    className={cn(op.errorRate > 0 && 'text-status-error')}
                  >
                    {formatRate(op.errorRate)}
                  </NumCell>
                  <NumCell>{formatDuration(op.latency.p50)}</NumCell>
                  <NumCell>{formatDuration(op.latency.p95)}</NumCell>
                  <NumCell>{formatDuration(op.latency.p99)}</NumCell>
                  <NumCell className="text-muted-foreground">
                    {formatRelative(op.lastSeenAt)}
                  </NumCell>
                </LinkRow>
              ))}
              {sorted.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="py-6 text-center text-muted-foreground"
                  >
                    No operation matches “{deferredFilter}”.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </TableFrame>
      )}
    </Page>
  );
}
