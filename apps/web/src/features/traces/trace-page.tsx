import { Page, PageHeader, PageSection, PageTitle } from '@/components/page';
import { ScopedLink } from '@/components/scoped-link';
import { EmptyState } from '@/components/states';
import { TraceWaterfall } from '@/components/trace/trace-waterfall';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { JobSummary } from '@/features/jobs/job-detail';
import { LogStream } from '@/features/logs/log-stream';
import { RequestSummary } from '@/features/requests/request-detail';
import { paths } from '@/lib/paths';
import { useSuspenseQuery } from '@tanstack/react-query';
import { useParams } from 'react-router';
import { traceQueryOptions } from './queries';

export function TracePage() {
  const { traceId = '' } = useParams();
  const { data: trace } = useSuspenseQuery(traceQueryOptions(traceId));
  const executions = trace.requests.length + trace.jobs.length;

  return (
    <Page>
      <PageHeader>
        <PageTitle eyebrow="Trace">
          <span className="font-mono">{trace.traceId}</span>
        </PageTitle>
        <span className="text-xs text-muted-foreground">
          {executions} {executions === 1 ? 'execution' : 'executions'} ·{' '}
          {trace.logs.length}{' '}
          {trace.logs.length === 1 ? 'log line' : 'log lines'}
        </span>
      </PageHeader>

      {executions === 0 && trace.logs.length === 0 ? (
        <EmptyState title="Nothing recorded for this trace">
          The trace may be older than the retention window, or its data has not
          arrived yet.
        </EmptyState>
      ) : null}

      {trace.requests.map((request) => (
        <Card key={request.id} size="sm">
          <CardHeader className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>
              <ScopedLink
                to={paths.request(request.id)}
                className="font-mono hover:underline"
              >
                {request.operationId}
              </ScopedLink>
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                request · {request.serviceId}
              </span>
            </CardTitle>
            <RequestSummary request={request} />
          </CardHeader>
          <CardContent>
            <TraceWaterfall
              rootLabel={request.operationId}
              durationMs={request.durationMs}
              rootFailed={request.hasError}
              spans={request.trace}
            />
          </CardContent>
        </Card>
      ))}

      {trace.jobs.map((job) => (
        <Card key={job.id} size="sm">
          <CardHeader className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>
              <ScopedLink
                to={paths.job(job.id)}
                className="font-mono hover:underline"
              >
                {job.queue}/{job.name}
              </ScopedLink>
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                job #{job.jobId} · {job.serviceId}
              </span>
            </CardTitle>
            <JobSummary job={job} />
          </CardHeader>
          <CardContent>
            <TraceWaterfall
              rootLabel={`${job.queue}/${job.name}`}
              durationMs={job.durationMs}
              rootFailed={job.status === 'failed'}
              spans={job.trace}
            />
          </CardContent>
        </Card>
      ))}

      <PageSection title="Correlated logs">
        {trace.logs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No logs carry this trace ID.
          </p>
        ) : (
          <LogStream logs={trace.logs} showTraceLinks={false} />
        )}
      </PageSection>
    </Page>
  );
}
