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
import { Page, PageHeader, PageTitle } from '@/components/page';
import { EmptyState, NoTelemetryHint } from '@/components/states';
import {
  Table,
  TableBody,
  TableCell,
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
import type { JobStats } from '@selfhosted-observe/contracts';
import { useSuspenseQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { jobStatsQueryOptions } from './queries';

type SortKey =
  'job' | 'count' | 'failureRate' | 'p50' | 'p95' | 'wait' | 'lastSeen';

const accessors: SortAccessors<JobStats, SortKey> = {
  job: (row) => `${row.queue}/${row.name}`,
  count: (row) => row.count,
  failureRate: (row) => row.failureRate,
  p50: (row) => row.latency.p50,
  p95: (row) => row.latency.p95,
  wait: (row) => row.avgWaitMs,
  lastSeen: (row) => row.lastSeenAt,
};

export function JobStatsPage() {
  const scope = useScope();
  const { data } = useSuspenseQuery(jobStatsQueryOptions(scope));
  const { sorted, sort, toggle } = useSortedRows(data, accessors, {
    key: 'count',
    direction: 'desc',
  });

  return (
    <Page>
      <PageHeader>
        <PageTitle eyebrow="Jobs">Queues</PageTitle>
        <Link
          to="/jobs/list"
          className="text-xs text-muted-foreground hover:text-foreground hover:underline"
        >
          All jobs →
        </Link>
      </PageHeader>

      {data.length === 0 ? (
        <EmptyState title="No jobs in this time range">
          <p>
            Bull, BullMQ and scheduled jobs show up here once your app reports
            them.
          </p>
          <NoTelemetryHint />
        </EmptyState>
      ) : (
        <TableFrame>
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHead sortKey="job" sort={sort} onToggle={toggle}>
                  Queue / job
                </SortableHead>
                <SortableHead
                  sortKey="count"
                  sort={sort}
                  onToggle={toggle}
                  className="text-right"
                >
                  Runs
                </SortableHead>
                <SortableHead
                  sortKey="failureRate"
                  sort={sort}
                  onToggle={toggle}
                  className="text-right"
                >
                  Failure rate
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
                  sortKey="wait"
                  sort={sort}
                  onToggle={toggle}
                  className="text-right"
                >
                  Avg wait
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
              {sorted.map((job) => (
                <LinkRow key={`${job.queue}/${job.name}`}>
                  <TableCell>
                    <Link
                      to="/jobs/list"
                      search={{ queue: job.queue, name: job.name }}
                      className={cn(stretchedLink, 'font-mono text-xs')}
                    >
                      <span className="text-muted-foreground">
                        {job.queue}/
                      </span>
                      {job.name}
                    </Link>
                  </TableCell>
                  <NumCell>{formatCount(job.count)}</NumCell>
                  <NumCell
                    className={cn(job.failureRate > 0 && 'text-status-error')}
                  >
                    {formatRate(job.failureRate)}
                  </NumCell>
                  <NumCell>{formatDuration(job.latency.p50)}</NumCell>
                  <NumCell>{formatDuration(job.latency.p95)}</NumCell>
                  <NumCell>{formatDuration(job.avgWaitMs)}</NumCell>
                  <NumCell className="text-muted-foreground">
                    {formatRelative(job.lastSeenAt)}
                  </NumCell>
                </LinkRow>
              ))}
            </TableBody>
          </Table>
        </TableFrame>
      )}
    </Page>
  );
}
