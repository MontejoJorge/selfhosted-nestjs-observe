import { MethodBadge } from '@/components/data/badges';
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
  DurationPill,
  FailureRate,
  RoutePath,
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
  DurationPanel,
  RequestsPanel,
} from '@/features/overview/overview-panels';
import { overviewQueryOptions } from '@/features/overview/queries';
import { usePreviousOverview } from '@/features/overview/use-previous-overview';
import { ProjectTitle } from '@/features/projects/project-title';
import { useReleaseMarkers } from '@/features/releases/use-release-markers';
import type { OperationStatsDto } from '@/lib/api/generated/api';
import { formatCount } from '@/lib/format';
import { paths } from '@/lib/paths';
import { useScope } from '@/lib/scope-hooks';
import { cn } from '@/lib/utils';
import { useSuspenseQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { operationsQueryOptions } from './queries';

type SortKey = 'operation' | 'method' | 'duration' | 'failureRate' | 'count';

const accessors: SortAccessors<OperationStatsDto, SortKey> = {
  operation: (row) => row.operationId,
  method: (row) => row.method ?? '',
  duration: (row) => row.latency.p95,
  failureRate: (row) => row.errorRate,
  count: (row) => row.count,
};

/** Client-side filters over the aggregated operations (the table is small). */
interface OperationFilters {
  method?: string;
  minP95?: string;
  minFailureRate?: string;
  q: string;
}

function applyFilters(rows: OperationStatsDto[], f: OperationFilters) {
  const needle = f.q.trim().toLowerCase();
  const minP95 = Number(f.minP95);
  const minRate = Number(f.minFailureRate) / 100;
  return rows.filter(
    (op) =>
      (!needle || op.operationId.toLowerCase().includes(needle)) &&
      (!f.method || op.method?.toUpperCase() === f.method) &&
      (!f.minP95 || op.latency.p95 >= minP95) &&
      (!f.minFailureRate || op.errorRate >= minRate),
  );
}

export function OperationsPage() {
  const scope = useScope();
  const { data: overview } = useSuspenseQuery(overviewQueryOptions(scope));
  const previous = usePreviousOverview(scope);
  const markers = useReleaseMarkers(scope);
  const { data } = useSuspenseQuery(operationsQueryOptions(scope));
  const [filters, setFilters] = useState<OperationFilters>({ q: '' });

  const methods = useMemo(
    () =>
      [...new Set(data.map((op) => op.method?.toUpperCase()).filter(Boolean))]
        .toSorted()
        .map((m) => ({ value: m as string, label: m as string })),
    [data],
  );
  const filtered = useMemo(() => applyFilters(data, filters), [data, filters]);
  const { sorted, sort, toggle } = useSortedRows(filtered, accessors, {
    key: 'count',
    direction: 'desc',
  });
  const patch = (next: Partial<OperationFilters>) =>
    setFilters((current) => ({ ...current, ...next }));

  return (
    <Page>
      <PageHeader>
        <ProjectTitle subtitle="Throughput, latency and failures per operation.">
          Requests
        </ProjectTitle>
        <ScopeControls />
      </PageHeader>

      <PanelGrid>
        <RequestsPanel
          overview={overview}
          previous={previous}
          timeWindow={scope}
          layout="header"
          markers={markers}
        />
        <DurationPanel
          overview={overview}
          previous={previous}
          layout="header"
          markers={markers}
        />
      </PanelGrid>

      <div className="mt-4 flex flex-col gap-3">
        <FilterBar
          aside={
            <DebouncedInput
              value={filters.q}
              onCommit={(q) => patch({ q })}
              aria-label="Search operations"
            />
          }
        >
          <OptionFilter
            label="Method"
            value={filters.method}
            options={methods}
            onChange={(method) => patch({ method })}
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
          <EmptyState title="No requests in this time range">
            <NoTelemetryHint />
          </EmptyState>
        ) : (
          <TableFrame>
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableHead
                    sortKey="operation"
                    sort={sort}
                    onToggle={toggle}
                  >
                    Operation ID
                  </SortableHead>
                  <SortableHead sortKey="method" sort={sort} onToggle={toggle}>
                    Method
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
                    Count
                  </SortableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((op) => (
                  <LinkRow
                    key={`${op.protocol}:${op.method}:${op.operationId}`}
                  >
                    <TableCell className="max-w-md">
                      <ScopedLink
                        to={paths.operation(scope.project)}
                        search={{
                          operationId: op.operationId,
                          method: op.method ?? undefined,
                        }}
                        className={cn(stretchedLink, 'block truncate')}
                      >
                        <RoutePath value={op.operationId} />
                      </ScopedLink>
                    </TableCell>
                    <TableCell>
                      <MethodBadge method={op.method ?? op.protocol} />
                    </TableCell>
                    <TableCell>
                      <DurationPill avg={op.latency.avg} p95={op.latency.p95} />
                    </TableCell>
                    <TableCell>
                      <FailureRate rate={op.errorRate} />
                    </TableCell>
                    <NumCell>{formatCount(op.count)}</NumCell>
                  </LinkRow>
                ))}
                {sorted.length === 0 ? (
                  <MessageRow colSpan={5}>
                    No operation matches these filters.
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
