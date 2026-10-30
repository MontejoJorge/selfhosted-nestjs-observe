import {
  DebouncedInput,
  FilterBar,
  InputFilter,
  OptionFilter,
} from '@/components/data/filters';
import { LoadMore } from '@/components/data/load-more';
import { ScopeControls } from '@/components/layout/scope-controls';
import { Page, PageHeader } from '@/components/page';
import { EmptyState, NoTelemetryHint } from '@/components/states';
import { ProjectTitle } from '@/features/projects/project-title';
import { shortId } from '@/lib/format';
import { useScope, useTypedSearch } from '@/lib/scope-hooks';
import { useSuspenseInfiniteQuery } from '@tanstack/react-query';
import { useCallback } from 'react';
import { LogStream } from './log-stream';
import { LOG_LEVELS, logsQueryOptions, type LogFilters } from './queries';
import { logsSearch } from './search';

const LEVEL_OPTIONS = LOG_LEVELS.map((level) => ({
  value: level,
  label: level.toUpperCase(),
}));

export function LogsPage() {
  const scope = useScope();
  const [filters, setSearch] = useTypedSearch(logsSearch);
  const query = useSuspenseInfiniteQuery(logsQueryOptions(scope, filters));
  const logs = query.data.pages.flatMap((page) => page.items);

  const setFilter = useCallback(
    (patch: Partial<LogFilters>) => setSearch(patch),
    [setSearch],
  );
  const commitQuery = useCallback(
    (q: string) => setFilter({ q: q.trim() || undefined }),
    [setFilter],
  );
  const hasFilters = Object.values(filters).some(
    (value) => value !== undefined,
  );

  return (
    <Page>
      <PageHeader>
        <ProjectTitle subtitle="Search log lines and jump to the trace behind each one.">
          Logs
        </ProjectTitle>
        <ScopeControls />
      </PageHeader>

      <div className="flex flex-col gap-3">
        <FilterBar
          aside={
            <DebouncedInput
              key={`q:${filters.q ?? ''}`}
              value={filters.q ?? ''}
              onCommit={commitQuery}
              aria-label="Search log text"
            />
          }
        >
          <OptionFilter
            label="Level"
            value={filters.level}
            options={LEVEL_OPTIONS}
            onChange={(level) => setFilter({ level })}
          />
          <InputFilter
            label="Context"
            value={filters.context}
            placeholder="e.g. OrdersController"
            onChange={(context) => setFilter({ context })}
          />
          <InputFilter
            label="Trace"
            value={filters.traceId}
            format={(v) => shortId(v, 12)}
            placeholder="Trace id"
            onChange={(traceId) => setFilter({ traceId })}
          />
        </FilterBar>

        {logs.length === 0 ? (
          <EmptyState
            title={
              hasFilters
                ? 'No logs match these filters'
                : 'No logs in this time range'
            }
          >
            {hasFilters ? null : (
              <>
                <p>
                  Logs are forwarded when the agent runs with log forwarding
                  enabled.
                </p>
                <NoTelemetryHint />
              </>
            )}
          </EmptyState>
        ) : (
          <LogStream
            logs={logs}
            footer={
              <LoadMore
                shown={logs.length}
                label="Load older logs"
                hasNextPage={query.hasNextPage}
                isFetchingNextPage={query.isFetchingNextPage}
                fetchNextPage={query.fetchNextPage}
              />
            }
          />
        )}
      </div>
    </Page>
  );
}
