import { JobStatusBadge } from '@/components/data/badges';
import { CallComparison } from '@/components/data/call-comparison';
import { IdChip } from '@/components/data/copy';
import {
  KeyValue,
  KeyValueList,
  RecordList,
} from '@/components/data/key-value';
import { DottedName } from '@/components/data/metric-cells';
import { Page, PageActions, PageHeader } from '@/components/page';
import { Panel, PanelBody, PanelHeader } from '@/components/panel';
import { ScopedLink } from '@/components/scoped-link';
import { ErrorPanel } from '@/components/trace/error-panel';
import { TraceWaterfall } from '@/components/trace/trace-waterfall';
import { Button } from '@/components/ui/button';
import { useApplicationNames } from '@/features/applications/use-application-names';
import { ProjectTitle } from '@/features/projects/project-title';
import { TIME_RANGE_LABELS } from '@/lib/api/scope';
import { formatDuration, formatRelative } from '@/lib/format';
import { paths } from '@/lib/paths';
import { useScope } from '@/lib/scope-hooks';
import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { SquareTerminalIcon } from 'lucide-react';
import { useParams } from 'react-router';
import { jobDetailQueryOptions, jobStatsQueryOptions } from './queries';

export function JobDetailPage() {
  const scope = useScope();
  const { jobId = '' } = useParams();
  const { data: job } = useSuspenseQuery(
    jobDetailQueryOptions(scope.project, jobId),
  );
  const names = useApplicationNames();
  // Optional context: the same job's stats over the current range.
  const { data: groups } = useQuery(jobStatsQueryOptions(scope));
  const stats = groups?.find(
    (g) => g.queue === job.queue && g.name === job.name,
  );
  const tagCount = Object.keys(job.tags).length;

  return (
    <Page>
      <PageHeader>
        <ProjectTitle subtitle="Queue and cron runs: duration, wait time and failures.">
          Jobs
        </ProjectTitle>
        <PageActions>
          <Button variant="outline" size="xl" asChild>
            <ScopedLink
              to={paths.logs(scope.project)}
              search={{ traceId: job.traceId }}
            >
              <SquareTerminalIcon /> View logs
            </ScopedLink>
          </Button>
        </PageActions>
      </PageHeader>

      <Panel>
        <PanelHeader title="Details" />
        <PanelBody>
          <KeyValueList>
            <KeyValue label="Trace ID">
              <ScopedLink to={paths.trace(scope.project, job.traceId)}>
                <IdChip value={job.traceId} length={16} />
              </ScopedLink>
            </KeyValue>
            <KeyValue label="Job">
              <ScopedLink
                to={paths.jobGroup(scope.project)}
                search={{ queue: job.queue, name: job.name }}
                className="hover:underline"
              >
                <DottedName value={job.name} />
              </ScopedLink>
            </KeyValue>
            <KeyValue label="Queue">{job.queue}</KeyValue>
            <KeyValue label="Job ID">{job.jobId ?? '-'}</KeyValue>
            <KeyValue label="Status">
              <JobStatusBadge status={job.status} />
            </KeyValue>
            {job.error ? (
              <KeyValue label="Error" tone="error">
                {job.error.cls ? `${job.error.cls}: ` : ''}
                {job.error.message}
              </KeyValue>
            ) : null}
            <KeyValue label="Duration">
              {formatDuration(job.durationMs)}
            </KeyValue>
            <KeyValue label="Wait">{formatDuration(job.waitMs)}</KeyValue>
            <KeyValue label="Attempts">
              {job.attemptsMade ?? '–'}
              {job.maxAttempts ? ` of ${job.maxAttempts}` : ''}
            </KeyValue>
            <KeyValue label="Application">
              {names.get(job.applicationId) ?? job.serviceId}
            </KeyValue>
            <KeyValue label="Instance">{job.serviceId}</KeyValue>
            <KeyValue label="Enqueued at">{job.enqueuedAt ?? '-'}</KeyValue>
            <KeyValue label="Started at">
              {job.calledAt}
              <span className="font-normal text-muted-foreground">
                {formatRelative(job.calledAt)}
              </span>
            </KeyValue>
            <KeyValue label="Tags">
              {tagCount > 0 ? `${tagCount} captured` : '-'}
            </KeyValue>
          </KeyValueList>
        </PanelBody>
      </Panel>

      {job.error ? <ErrorPanel error={job.error} /> : null}

      {stats ? (
        <CallComparison
          durationMs={job.durationMs}
          avg={stats.latency.avg}
          p95={stats.latency.p95}
          count={stats.count}
          rangeLabel={TIME_RANGE_LABELS[scope.range]}
        />
      ) : null}

      <Panel>
        <PanelHeader title="Waterfall" />
        <PanelBody>
          <TraceWaterfall
            rootLabel={`${job.queue}/${job.name}`}
            durationMs={job.durationMs}
            rootFailed={job.status === 'failed'}
            spans={job.trace}
          />
        </PanelBody>
      </Panel>

      {tagCount > 0 ? (
        <Panel>
          <PanelHeader title="Tags" />
          <PanelBody>
            <RecordList record={job.tags} />
          </PanelBody>
        </Panel>
      ) : null}
    </Page>
  );
}
