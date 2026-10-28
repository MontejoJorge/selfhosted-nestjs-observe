import {
  DebouncedInput,
  FilterBar,
  FilterChip,
  OptionFilter,
} from '@/components/data/filters';
import { LoadMore } from '@/components/data/load-more';
import { Page, PageHeader, PageTitle } from '@/components/page';
import { EmptyState, NoTelemetryHint } from '@/components/states';
import { useScope, useTypedSearch } from '@/lib/scope-hooks';
import { useSuspenseInfiniteQuery } from '@tanstack/react-query';
import { useCallback } from 'react';
import { LogStream } from './log-stream';
import { LOG_LEVELS, logsQueryOptions, type LogFilters } from './queries';
import { logsSearch } from './search';

const LEVEL_OPTIONS = LOG_LEVELS.map((level) => ({
  value: level,
  label: level,
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
  const commitContext = useCallback(
    (context: string) => setFilter({ context: context.trim() || undefined }),
    [setFilter],
  );
  const hasFilters = Object.values(filters).some(
    (value) => value !== undefined,
  );

  return (
    <Page>
      <PageHeader>
        <PageTitle>Logs</PageTitle>
      </PageHeader>

      <FilterBar>
        <DebouncedInput
          key={`q:${filters.q ?? ''}`}
          value={filters.q ?? ''}
          onCommit={commitQuery}
          placeholder="Search log text…"
          aria-label="Search log text"
          className="w-72"
        />
        <OptionFilter
          label="Level"
          value={filters.level}
          options={LEVEL_OPTIONS}
          onChange={(level) => setFilter({ level })}
          className="w-32"
        />
        <DebouncedInput
          key={`context:${filters.context ?? ''}`}
          value={filters.context ?? ''}
          onCommit={commitContext}
          placeholder="Context"
          aria-label="Filter by context"
          icon={false}
          className="w-40"
        />
        {filters.traceId ? (
          <FilterChip
            label="trace"
            value={filters.traceId}
            onClear={() => setFilter({ traceId: undefined })}
          />
        ) : null}
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
        <>
          <LogStream logs={logs} />
          <LoadMore
            shown={logs.length}
            hasNextPage={query.hasNextPage}
            isFetchingNextPage={query.isFetchingNextPage}
            fetchNextPage={query.fetchNextPage}
          />
        </>
      )}
    </Page>
  );
}
