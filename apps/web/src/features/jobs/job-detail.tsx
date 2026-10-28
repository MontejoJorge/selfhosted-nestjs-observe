import { JobStatusBadge } from '@/components/data/badges';
import {
  KeyValue,
  KeyValueList,
  RecordList,
} from '@/components/data/key-value';
import { PageSection } from '@/components/page';
import { ErrorPanel } from '@/components/trace/error-panel';
import { TraceWaterfall } from '@/components/trace/trace-waterfall';
import { Card, CardContent } from '@/components/ui/card';
import { formatDateTime, formatDuration } from '@/lib/format';
import type { JobDetail } from '@selfhosted-observe/contracts';
import { Link } from '@tanstack/react-router';

export function JobSummary({ job }: { job: JobDetail }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <JobStatusBadge status={job.status} />
      <span className="font-mono">{formatDuration(job.durationMs)}</span>
      <span className="text-muted-foreground">
        {formatDateTime(job.calledAt)}
      </span>
    </div>
  );
}

export function JobMetadata({ job }: { job: JobDetail }) {
  return (
    <KeyValueList>
      <KeyValue label="Trace ID">
        <Link
          to="/traces/$traceId"
          params={{ traceId: job.traceId }}
          className="font-mono text-xs text-primary hover:underline"
        >
          {job.traceId}
        </Link>
      </KeyValue>
      <KeyValue label="Job ID">
        <code className="text-xs">{job.jobId}</code>
      </KeyValue>
      <KeyValue label="Service">{job.serviceId}</KeyValue>
      <KeyValue label="Queue">
        <code className="text-xs">{job.queue}</code>
      </KeyValue>
      <KeyValue label="Name">
        <code className="text-xs">{job.name}</code>
      </KeyValue>
      <KeyValue label="Enqueued at">
        {job.enqueuedAt ? formatDateTime(job.enqueuedAt) : '–'}
      </KeyValue>
      <KeyValue label="Started at">{formatDateTime(job.calledAt)}</KeyValue>
      <KeyValue label="Wait">{formatDuration(job.waitMs)}</KeyValue>
      <KeyValue label="Attempts">
        {job.attemptsMade ?? '–'}
        {job.maxAttempts ? ` of ${job.maxAttempts}` : ''}
      </KeyValue>
    </KeyValueList>
  );
}

export function JobDetailView({ job }: { job: JobDetail }) {
  return (
    <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="flex min-w-0 flex-col gap-4">
        {job.error ? (
          <PageSection title="Error">
            <ErrorPanel error={job.error} />
          </PageSection>
        ) : null}
        <PageSection title="Trace">
          <TraceWaterfall
            rootLabel={`${job.queue}/${job.name}`}
            durationMs={job.durationMs}
            rootFailed={job.status === 'failed'}
            spans={job.trace}
          />
        </PageSection>
      </div>
      <div className="flex min-w-0 flex-col gap-4">
        <Card size="sm">
          <CardContent>
            <JobMetadata job={job} />
          </CardContent>
        </Card>
        <PageSection
          title="Tags"
          actions={
            <Link
              to="/logs"
              search={{ traceId: job.traceId }}
              className="text-xs text-primary hover:underline"
            >
              Logs for this trace →
            </Link>
          }
        >
          <RecordList record={job.tags} />
        </PageSection>
      </div>
    </div>
  );
}
