import {
  DebouncedInput,
  FilterBar,
  InputFilter,
} from '@/components/data/filters';
import { ScopeControls } from '@/components/layout/scope-controls';
import { Page, PageHeader, PanelGrid } from '@/components/page';
import { EmptyState } from '@/components/states';
import { ProjectTitle } from '@/features/projects/project-title';
import type { UserStatsDto } from '@/lib/api/generated/api';
import { useScope, useTypedSearch } from '@/lib/scope-hooks';
import { useSuspenseQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { LatencyScatterPanel } from './latency-scatter-panel';
import { USERS_LIMIT, usersQueryOptions } from './queries';
import { usersSearch } from './search';
import { UserActivityPanel } from './user-activity-panel';
import { UserIdHint } from './user-id-hint';
import { UsersTable } from './users-table';

/** Client-side filters over the listed users. */
interface UserFilters {
  minP95?: string;
  minFailureRate?: string;
  minCount?: string;
}

function applyFilters(users: readonly UserStatsDto[], f: UserFilters) {
  const minP95 = Number(f.minP95);
  const minRate = Number(f.minFailureRate) / 100;
  const minCount = Number(f.minCount);
  return users.filter(
    (u) =>
      (!f.minP95 || u.latency.p95 >= minP95) &&
      (!f.minFailureRate || u.errorRate >= minRate) &&
      (!f.minCount || u.requestCount >= minCount),
  );
}

export function UsersPage() {
  const scope = useScope();
  const [search, setSearch] = useTypedSearch(usersSearch);
  const { data } = useSuspenseQuery(
    usersQueryOptions(scope, { search: search.q }),
  );
  const [filters, setFilters] = useState<UserFilters>({});
  const users = useMemo(
    () => applyFilters(data.items, filters),
    [data.items, filters],
  );
  const patch = (next: Partial<UserFilters>) =>
    setFilters((current) => ({ ...current, ...next }));
  const noUsers = data.items.length === 0 && !search.q;

  return (
    <Page>
      <PageHeader>
        <ProjectTitle subtitle="Who is calling your services and how their requests perform.">
          Users
        </ProjectTitle>
        <ScopeControls />
      </PageHeader>

      {noUsers ? (
        <EmptyState title="No users in this time range">
          <UserIdHint />
        </EmptyState>
      ) : (
        <>
          <PanelGrid>
            <UserActivityPanel
              userCount={data.userCount}
              timeline={data.timeline}
            />
            <LatencyScatterPanel users={users} />
          </PanelGrid>

          <div className="mt-4 flex flex-col gap-3">
            <FilterBar
              aside={
                <DebouncedInput
                  key={`q:${search.q ?? ''}`}
                  value={search.q ?? ''}
                  onCommit={(q) => setSearch({ q: q.trim() || undefined })}
                  placeholder="Search user id..."
                  aria-label="Search users"
                />
              }
            >
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
              <InputFilter
                label="Count"
                value={filters.minCount}
                format={(v) => `≥ ${v}`}
                placeholder="Minimum requests"
                inputMode="numeric"
                onChange={(minCount) => patch({ minCount })}
              />
            </FilterBar>

            <UsersTable
              key={`${search.q ?? ''}|${JSON.stringify(filters)}`}
              users={users}
              emptyMessage={
                search.q
                  ? `No user id contains “${search.q}”.`
                  : 'No user matches these filters.'
              }
              footnote={
                data.items.length >= USERS_LIMIT
                  ? `Top ${USERS_LIMIT} users by requests. Search to find others.`
                  : undefined
              }
            />
          </div>
        </>
      )}
    </Page>
  );
}
