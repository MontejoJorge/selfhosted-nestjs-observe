import { CopyButton } from '@/components/data/copy';
import { OptionFilter } from '@/components/data/filters';
import { KeyValue, KeyValueList } from '@/components/data/key-value';
import { FailureRate } from '@/components/data/metric-cells';
import { ScopeControls } from '@/components/layout/scope-controls';
import { Page, PageHeader, PageSection } from '@/components/page';
import { Panel, PanelBody, PanelHeader } from '@/components/panel';
import { EmptyState } from '@/components/states';
import {
  DurationPanelView,
  RequestsPanelView,
} from '@/features/overview/overview-panels';
import { ProjectTitle } from '@/features/projects/project-title';
import { RequestTable } from '@/features/requests/request-table';
import type { TimeBucketDto, UserDetailDto } from '@/lib/api/generated/api';
import { TIME_RANGE_LABELS } from '@/lib/api/scope';
import { formatCount, formatDuration, formatRelative } from '@/lib/format';
import { useScope, useTypedSearch } from '@/lib/scope-hooks';
import { useSuspenseQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useParams } from 'react-router';
import { userQueryOptions } from './queries';
import { userSearch } from './search';

const STATUS_OPTIONS = [
  { value: 'ok', label: 'Succeeded' },
  { value: 'error', label: 'Failed' },
] as const;

/** 4xx / 5xx totals from the timeline (the user stats only carry errorCount). */
function statusTotals(timeline: readonly TimeBucketDto[]) {
  let status4xx = 0;
  let status5xx = 0;
  for (const bucket of timeline) {
    status4xx += bucket.status4xx;
    status5xx += bucket.status5xx;
  }
  return { status4xx, status5xx };
}

/** One user: their stats, their traffic over time and the requests they made. */
export function UserPage() {
  const scope = useScope();
  const { userId = '' } = useParams();
  const [search, setSearch] = useTypedSearch(userSearch);
  const { data: user } = useSuspenseQuery(userQueryOptions(scope, userId));

  return (
    <Page>
      <PageHeader>
        <ProjectTitle subtitle="An overview of users interacting with your project.">
          Users
        </ProjectTitle>
        <ScopeControls />
      </PageHeader>

      {user ? (
        <UserOverview userId={userId} user={user} />
      ) : (
        <EmptyState title={`No requests from ${userId} in this time range`}>
          Nothing in the {TIME_RANGE_LABELS[scope.range].toLowerCase()}. Pick a
          wider range to find their requests.
        </EmptyState>
      )}

      {user ? (
        <PageSection
          title="Requests"
          className="mt-4"
          actions={
            <OptionFilter
              label="Status"
              value={search.status}
              options={STATUS_OPTIONS}
              onChange={(status) => setSearch({ status })}
            />
          }
        >
          <RequestTable filters={{ userId, status: search.status }} />
        </PageSection>
      ) : null}
    </Page>
  );
}

function UserOverview({
  userId,
  user,
}: {
  userId: string;
  user: UserDetailDto;
}) {
  const { range } = useScope();
  const totals = useMemo(() => statusTotals(user.timeline), [user.timeline]);

  return (
    <div className="grid min-w-0 gap-6 xl:grid-cols-2">
      <Panel>
        <PanelHeader title="Details" />
        <PanelBody>
          <KeyValueList>
            <KeyValue label="User ID">
              <span className="truncate">{userId}</span>
              <CopyButton value={userId} label="Copy user id" />
            </KeyValue>
            <KeyValue label="Requests">
              {formatCount(user.requestCount)}
            </KeyValue>
            <KeyValue label="Errors">{formatCount(user.errorCount)}</KeyValue>
            <KeyValue label="Error rate">
              <FailureRate rate={user.errorRate} />
            </KeyValue>
            <KeyValue label="Avg. Duration">
              {formatDuration(user.latency.avg)}
            </KeyValue>
            <KeyValue label="50th Percentile">
              {formatDuration(user.latency.p50)}
            </KeyValue>
            <KeyValue label="95th Percentile">
              {formatDuration(user.latency.p95)}
            </KeyValue>
            <KeyValue label="99th Percentile">
              {formatDuration(user.latency.p99)}
            </KeyValue>
            <KeyValue label="First seen">
              {formatRelative(user.firstSeenAt)}
            </KeyValue>
            <KeyValue label="Last seen">
              {formatRelative(user.lastSeenAt)}
            </KeyValue>
          </KeyValueList>
        </PanelBody>
      </Panel>
      <div className="flex min-w-0 flex-col gap-6">
        <RequestsPanelView
          requests={{ count: user.requestCount, ...totals }}
          previousCount={undefined}
          timeline={user.timeline}
          range={range}
          layout="header"
        />
        <DurationPanelView
          title="Duration"
          avg={user.latency.avg}
          p95={user.latency.p95}
          previousAvg={undefined}
          buckets={user.timeline}
          layout="header"
        />
      </div>
    </div>
  );
}
