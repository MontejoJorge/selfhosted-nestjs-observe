import {
  LinkRow,
  MessageRow,
  NumCell,
  stretchedLink,
  TableFrame,
} from '@/components/data/data-table';
import {
  DebouncedInput,
  FilterBar,
  InputFilter,
  OptionFilter,
} from '@/components/data/filters';
import {
  DottedName,
  DurationPill,
  FailureRate,
} from '@/components/data/metric-cells';
import { SortableHead } from '@/components/data/sort';
import {
  useSortedRows,
  type SortAccessors,
} from '@/components/data/use-sorted-rows';
import { ScopeControls } from '@/components/layout/scope-controls';
import { Page, PageHeader, PanelGrid } from '@/components/page';
import { ScopedLink } from '@/components/scoped-link';
import { EmptyState, NoTelemetryHint } from '@/components/states';
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  JobsDurationPanel,
  JobsPanel,
} from '@/features/overview/overview-panels';
import { overviewQueryOptions } from '@/features/overview/queries';
import { usePreviousOverview } from '@/features/overview/use-previous-overview';
import { ProjectTitle } from '@/features/projects/project-title';
import type { JobStatsDto } from '@/lib/api/generated/api';
import { formatCount } from '@/lib/format';
import { paths } from '@/lib/paths';
import { useScope } from '@/lib/scope-hooks';
import { cn } from '@/lib/utils';
import { useSuspenseQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { jobStatsQueryOptions } from './queries';

type SortKey = 'name' | 'duration' | 'failureRate' | 'count';

const accessors: SortAccessors<JobStatsDto, SortKey> = {
  name: (row) => `${row.name}/${row.queue}`,
  duration: (row) => row.latency.p95,
  failureRate: (row) => row.failureRate,
  count: (row) => row.count,
};

/** Client-side filters over the aggregated job groups. */
interface JobGroupFilters {
  queue?: string;
  minP95?: string;
  minFailureRate?: string;
  q: string;
}

export function JobStatsPage() {
  const scope = useScope();
  const { data: overview } = useSuspenseQuery(overviewQueryOptions(scope));
  const previous = usePreviousOverview(scope);
  const { data } = useSuspenseQuery(jobStatsQueryOptions(scope));
  const [filters, setFilters] = useState<JobGroupFilters>({ q: '' });
  const patch = (next: Partial<JobGroupFilters>) =>
    setFilters((current) => ({ ...current, ...next }));

  const queues = useMemo(
    () =>
      [...new Set(data.map((row) => row.queue))]
        .toSorted()
        .map((queue) => ({ value: queue, label: queue })),
    [data],
  );
  const filtered = useMemo(() => {
    const needle = filters.q.trim().toLowerCase();
    const minP95 = Number(filters.minP95);
    const minRate = Number(filters.minFailureRate) / 100;
    return data.filter(
      (row) =>
        (!needle ||
          `${row.queue} ${row.name}`.toLowerCase().includes(needle)) &&
        (!filters.queue || row.queue === filters.queue) &&
        (!filters.minP95 || row.latency.p95 >= minP95) &&
        (!filters.minFailureRate || row.failureRate >= minRate),
    );
  }, [data, filters]);
  const { sorted, sort, toggle } = useSortedRows(filtered, accessors, {
    key: 'count',
    direction: 'desc',
  });

  return (
    <Page>
      <PageHeader>
        <ProjectTitle subtitle="View and analyze jobs processed by your applications.">
          Jobs
        </ProjectTitle>
        <ScopeControls />
      </PageHeader>

      <PanelGrid>
        <JobsPanel overview={overview} previous={previous} layout="header" />
        <JobsDurationPanel
          overview={overview}
          previous={previous}
          layout="header"
        />
      </PanelGrid>

      <div className="mt-4 flex flex-col gap-3">
        <FilterBar
          aside={
            <DebouncedInput
              value={filters.q}
              onCommit={(q) => patch({ q })}
              aria-label="Search jobs"
            />
          }
        >
          <OptionFilter
            label="Queue name"
            value={filters.queue}
            options={queues}
            onChange={(queue) => patch({ queue })}
          />
          <InputFilter
            label="P95"
            value={filters.minP95}
            format={(v) => `≥ ${v} ms`}
            placeholder="Minimum p95 in ms"
            inputMode="numeric"
            onChange={(minP95) => patch({ minP95 })}
          />
          <InputFilter
            label="Failure rate"
            value={filters.minFailureRate}
            format={(v) => `≥ ${v}%`}
            placeholder="Minimum failure rate in %"
            inputMode="numeric"
            onChange={(minFailureRate) => patch({ minFailureRate })}
          />
        </FilterBar>

        {data.length === 0 ? (
          <EmptyState title="No jobs in this time range">
            <NoTelemetryHint />
          </EmptyState>
        ) : (
          <TableFrame>
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableHead sortKey="name" sort={sort} onToggle={toggle}>
                    Name
                  </SortableHead>
                  <SortableHead
                    sortKey="duration"
                    sort={sort}
                    onToggle={toggle}
                  >
                    Duration
                  </SortableHead>
                  <SortableHead
                    sortKey="failureRate"
                    sort={sort}
                    onToggle={toggle}
                  >
                    Failure rate
                  </SortableHead>
                  <SortableHead
                    sortKey="count"
                    sort={sort}
                    onToggle={toggle}
                    className="text-right"
                  >
                    Invocations
                  </SortableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((row) => (
                  <LinkRow key={`${row.queue}/${row.name}`}>
                    <TableCell className="h-16!">
                      <ScopedLink
                        to={paths.jobGroup(scope.project)}
                        search={{ queue: row.queue, name: row.name }}
                        className={cn(stretchedLink, 'flex flex-col gap-0.5')}
                      >
                        <DottedName value={row.name} />
                        <span className="font-mono text-[11px] text-muted-foreground">
                          {row.queue}
                        </span>
                      </ScopedLink>
                    </TableCell>
                    <TableCell>
                      <DurationPill
                        avg={row.latency.avg}
                        p95={row.latency.p95}
                      />
                    </TableCell>
                    <TableCell>
                      <FailureRate rate={row.failureRate} />
                    </TableCell>
                    <NumCell>{formatCount(row.count)}</NumCell>
                  </LinkRow>
                ))}
                {sorted.length === 0 ? (
                  <MessageRow colSpan={4}>
                    No job matches these filters.
                  </MessageRow>
                ) : null}
              </TableBody>
            </Table>
          </TableFrame>
        )}
      </div>
    </Page>
  );
}
