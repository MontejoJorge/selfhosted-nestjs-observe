import { ScopeControls } from '@/components/layout/scope-controls';
import { Page, PageHeader, PageSection } from '@/components/page';
import { EmptyState, NoTelemetryHint } from '@/components/states';
import { ProjectTitle } from '@/features/projects/project-title';
import type { TimeBreakdownItemDto } from '@/lib/api/generated/api';
import { useScope, useTypedSearch } from '@/lib/scope-hooks';
import { useSuspenseQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { BreakdownFilters } from './breakdown-filters';
import { BreakdownTable } from './breakdown-table';
import { originShares } from './origin';
import { OriginSummary } from './origin-summary';
import { timeBreakdownQueryOptions } from './queries';
import {
  breakdownFilters,
  spanTarget,
  targetKey,
  timeBreakdownSearch,
} from './search';
import { SlowestSpansSheet } from './slowest-spans-sheet';

const CLOSED_TARGET = {
  className: undefined,
  methodName: undefined,
  origin: undefined,
};

/** "Where the time goes": self time per class and method, from the spans of every trace. */
export function TimeBreakdownPage() {
  const scope = useScope();
  const [search, setSearch] = useTypedSearch(timeBreakdownSearch);
  const filters = useMemo(() => breakdownFilters(search), [search]);
  const target = useMemo(() => spanTarget(search), [search]);
  const { data } = useSuspenseQuery(timeBreakdownQueryOptions(scope, filters));
  const shares = useMemo(
    () => originShares(data.items, data.totalSelfMs),
    [data],
  );
  const selectedItem = target
    ? data.items.find((item) => targetKey(item) === targetKey(target))
    : undefined;
  const filtered =
    filters.source !== undefined ||
    filters.operationId !== undefined ||
    filters.queue !== undefined;

  const select = (item: TimeBreakdownItemDto) =>
    setSearch({
      className: item.className,
      methodName: item.methodName,
      origin: item.origin,
    });

  return (
    <Page>
      <PageHeader>
        <ProjectTitle subtitle="Self time per class and method across every trace: where your applications spend their time.">
          Where the time goes
        </ProjectTitle>
        <ScopeControls />
      </PageHeader>

      <BreakdownFilters
        search={search}
        onChange={(patch) => setSearch({ ...patch, ...CLOSED_TARGET })}
      />

      {data.items.length === 0 ? (
        <EmptyState
          title={
            filtered
              ? 'No spans match these filters'
              : 'No spans in this time range'
          }
        >
          {filtered ? (
            'Try another operation or job, or a wider time range.'
          ) : (
            <>
              <p className="mb-2">
                The breakdown is built from the spans of each request and job
                trace, starting from when the collector was upgraded to record
                them. Older telemetry is not included.
              </p>
              <NoTelemetryHint />
            </>
          )}
        </EmptyState>
      ) : (
        <>
          <OriginSummary shares={shares} totalSelfMs={data.totalSelfMs} />
          <PageSection title="Ranked by self time">
            <BreakdownTable
              items={data.items}
              selected={target}
              onSelect={select}
            />
          </PageSection>
        </>
      )}

      <SlowestSpansSheet
        target={target}
        item={selectedItem}
        filters={filters}
        onClose={() => setSearch(CLOSED_TARGET)}
      />
    </Page>
  );
}
