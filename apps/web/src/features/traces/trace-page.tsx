import {
  JobStatusBadge,
  MethodBadge,
  StatusCodeBadge,
} from '@/components/data/badges';
import { IdChip } from '@/components/data/copy';
import { Duration, RoutePath } from '@/components/data/metric-cells';
import { Page, PageHeader, PageSection } from '@/components/page';
import { CountBadge, Panel, PanelBody, PanelHeader } from '@/components/panel';
import { ScopedLink } from '@/components/scoped-link';
import { EmptyState } from '@/components/states';
import { TraceWaterfall } from '@/components/trace/trace-waterfall';
import { LogStream } from '@/features/logs/log-stream';
import { ProjectTitle } from '@/features/projects/project-title';
import { formatRelative } from '@/lib/format';
import { paths } from '@/lib/paths';
import { useProjectRef } from '@/lib/scope-hooks';
import { useSuspenseQuery } from '@tanstack/react-query';
import { useParams } from 'react-router';
import { traceQueryOptions } from './queries';

/** Every execution and log line that carried one trace id. */
export function TracePage() {
  const project = useProjectRef();
  const { traceId = '' } = useParams();
  const { data: trace } = useSuspenseQuery(traceQueryOptions(project, traceId));
  const executions = trace.requests.length + trace.jobs.length;

  return (
    <Page>
      <PageHeader>
        <ProjectTitle
          subtitle={
            <>
              {executions} {executions === 1 ? 'execution' : 'executions'} ·{' '}
              {trace.logs.length}{' '}
              {trace.logs.length === 1 ? 'log line' : 'log lines'}
            </>
          }
        >
          Trace
          <IdChip value={trace.traceId} length={20} className="text-sm" />
        </ProjectTitle>
      </PageHeader>

      {executions === 0 && trace.logs.length === 0 ? (
        <EmptyState title="Nothing recorded for this trace">
          The trace may be older than the retention window, or its data has not
          arrived yet.
        </EmptyState>
      ) : null}

      {trace.requests.map((request) => (
        <Panel key={request.id}>
          <PanelHeader
            title={
              <ScopedLink
                to={paths.request(project, request.id)}
                className="inline-flex items-center gap-2 hover:underline"
              >
                <MethodBadge method={request.method} />
                <RoutePath value={request.url ?? request.operationId} />
              </ScopedLink>
            }
            aside={
              <>
                <StatusCodeBadge code={request.statusCode} />
                <Duration ms={request.durationMs} />
                <span className="text-sm text-muted-foreground">
                  {formatRelative(request.calledAt)}
                </span>
              </>
            }
          >
            <span className="font-mono text-xs text-muted-foreground">
              request · {request.serviceId}
            </span>
          </PanelHeader>
          <PanelBody>
            <TraceWaterfall
              rootLabel={request.operationId}
              durationMs={request.durationMs}
              rootFailed={request.hasError}
              spans={request.trace}
            />
          </PanelBody>
        </Panel>
      ))}

      {trace.jobs.map((job) => (
        <Panel key={job.id}>
          <PanelHeader
            title={
              <ScopedLink
                to={paths.job(project, job.id)}
                className="font-mono hover:underline"
              >
                {job.queue}/{job.name}
              </ScopedLink>
            }
            aside={
              <>
                <JobStatusBadge status={job.status} />
                <Duration ms={job.durationMs} />
                <span className="text-sm text-muted-foreground">
                  {formatRelative(job.calledAt)}
                </span>
              </>
            }
          >
            <span className="font-mono text-xs text-muted-foreground">
              job #{job.jobId} · {job.serviceId}
            </span>
          </PanelHeader>
          <PanelBody>
            <TraceWaterfall
              rootLabel={`${job.queue}/${job.name}`}
              durationMs={job.durationMs}
              rootFailed={job.status === 'failed'}
              spans={job.trace}
            />
          </PanelBody>
        </Panel>
      ))}

      <PageSection
        title={
          <span className="inline-flex items-center gap-2">
            Correlated logs <CountBadge>{trace.logs.length}</CountBadge>
          </span>
        }
      >
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
