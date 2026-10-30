import { JobStatusBadge } from '@/components/data/badges';
import { IdChip } from '@/components/data/copy';
import {
  LinkRow,
  stretchedLink,
  TableFrame,
} from '@/components/data/data-table';
import { FilterBar, OptionFilter } from '@/components/data/filters';
import { KeyValue, KeyValueList } from '@/components/data/key-value';
import { LoadMore } from '@/components/data/load-more';
import {
  DottedName,
  Duration,
  FailureRate,
} from '@/components/data/metric-cells';
import { ScopeControls } from '@/components/layout/scope-controls';
import { Page, PageHeader, PageSection } from '@/components/page';
import { Panel, PanelBody, PanelHeader } from '@/components/panel';
import { ScopedLink } from '@/components/scoped-link';
import { EmptyState } from '@/components/states';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
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
import { useReleaseMarkers } from '@/features/releases/use-release-markers';
import { formatCount, formatDuration, formatRelative } from '@/lib/format';
import { paths } from '@/lib/paths';
import { useScope, useTypedSearch } from '@/lib/scope-hooks';
import { cn } from '@/lib/utils';
import {
  useSuspenseInfiniteQuery,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { jobListQueryOptions, jobStatsQueryOptions } from './queries';
import { jobGroupSearch } from './search';

const STATUS_OPTIONS = [
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
] as const;

/** One queue + job name: stats, charts and its runs. */
export function JobGroupPage() {
  const scope = useScope();
  const [search, setSearch] = useTypedSearch(jobGroupSearch);
  // The loader 404s without both.
  const queue = search.queue ?? '';
  const name = search.name ?? '';
  const filters = { queue, name };

  const { data: overview } = useSuspenseQuery(
    overviewQueryOptions(scope, filters),
  );
  const previous = usePreviousOverview(scope, filters);
  const markers = useReleaseMarkers(scope);
  const { data: groups } = useSuspenseQuery(jobStatsQueryOptions(scope));
  const stats = groups.find((g) => g.queue === queue && g.name === name);
  const failed = overview.jobs.failed;

  return (
    <Page>
      <PageHeader>
        <ProjectTitle subtitle="Queue and cron runs: duration, wait time and failures.">
          Jobs
        </ProjectTitle>
        <ScopeControls />
      </PageHeader>

      <div className="grid min-w-0 gap-6 xl:grid-cols-2">
        <Panel>
          <PanelHeader title="Details" />
          <PanelBody>
            <KeyValueList>
              <KeyValue label="Name">
                <DottedName value={name} />
              </KeyValue>
              <KeyValue label="Queue">{queue}</KeyValue>
              <KeyValue label="Avg. Duration">
                {formatDuration(overview.jobs.latency.avg)}
              </KeyValue>
              <KeyValue label="95th Percentile">
                {formatDuration(overview.jobs.latency.p95)}
              </KeyValue>
              <KeyValue label="Avg. Wait">
                {formatDuration(stats?.avgWaitMs)}
              </KeyValue>
              <KeyValue label="Invocations">
                {formatCount(overview.jobs.count)}
              </KeyValue>
              <KeyValue label="Failed">{formatCount(failed)}</KeyValue>
              <KeyValue label="Failure Rate">
                <FailureRate rate={overview.jobs.failureRate} />
              </KeyValue>
              <KeyValue label="Last run">
                {stats ? formatRelative(stats.lastSeenAt) : '–'}
              </KeyValue>
            </KeyValueList>
          </PanelBody>
        </Panel>
        <div className="flex min-w-0 flex-col gap-6">
          <JobsPanel
            overview={overview}
            previous={previous}
            layout="header"
            markers={markers}
          />
          <JobsDurationPanel
            overview={overview}
            previous={previous}
            layout="header"
            markers={markers}
          />
        </div>
      </div>

      <PageSection
        title="All runs"
        className="mt-4"
        actions={
          <FilterBar>
            <OptionFilter
              label="Status"
              value={search.status}
              options={STATUS_OPTIONS}
              onChange={(status) => setSearch({ status })}
            />
          </FilterBar>
        }
      >
        <RunTable queue={queue} name={name} status={search.status} />
      </PageSection>
    </Page>
  );
}

function RunTable({
  queue,
  name,
  status,
}: {
  queue: string;
  name: string;
  status: 'completed' | 'failed' | undefined;
}) {
  const scope = useScope();
  const query = useSuspenseInfiniteQuery(
    jobListQueryOptions(scope, { queue, name, status }),
  );
  const rows = query.data.pages.flatMap((page) => page.items);

  if (rows.length === 0) {
    return <EmptyState title="No runs match these filters" />;
  }

  return (
    <TableFrame
      footer={
        <LoadMore
          shown={rows.length}
          hasNextPage={query.hasNextPage}
          isFetchingNextPage={query.isFetchingNextPage}
          fetchNextPage={query.fetchNextPage}
        />
      }
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Trace ID</TableHead>
            <TableHead>Job ID</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Duration</TableHead>
            <TableHead>Wait</TableHead>
            <TableHead>Attempts</TableHead>
            <TableHead className="text-right">Started at</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((job) => (
            <LinkRow key={job.id}>
              <TableCell className="w-40">
                <IdChip value={job.traceId} />
              </TableCell>
              <TableCell className="font-mono text-[13px]">
                <ScopedLink
                  to={paths.job(scope.project, job.id)}
                  className={cn(stretchedLink)}
                >
                  #{job.jobId ?? job.id.slice(0, 8)}
                </ScopedLink>
              </TableCell>
              <TableCell>
                <JobStatusBadge status={job.status} />
              </TableCell>
              <TableCell>
                <Duration ms={job.durationMs} />
              </TableCell>
              <TableCell>
                <Duration ms={job.waitMs} />
              </TableCell>
              <TableCell className="font-mono text-[13px]">
                {job.attemptsMade ?? '–'}
                {job.maxAttempts ? ` / ${job.maxAttempts}` : ''}
              </TableCell>
              <TableCell className="text-right text-sm whitespace-nowrap text-muted-foreground">
                {formatRelative(job.calledAt)}
              </TableCell>
            </LinkRow>
          ))}
        </TableBody>
      </Table>
    </TableFrame>
  );
}
