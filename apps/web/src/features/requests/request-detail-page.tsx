import { MethodBadge, StatusCodeBadge } from '@/components/data/badges';
import { CallComparison } from '@/components/data/call-comparison';
import { JsonBlock } from '@/components/data/code-block';
import { IdChip } from '@/components/data/copy';
import {
  KeyValue,
  KeyValueList,
  RecordList,
} from '@/components/data/key-value';
import { RoutePath } from '@/components/data/metric-cells';
import { Page, PageActions, PageHeader } from '@/components/page';
import { Panel, PanelBody, PanelHeader } from '@/components/panel';
import { ScopedLink } from '@/components/scoped-link';
import { ErrorPanel } from '@/components/trace/error-panel';
import { TraceWaterfall } from '@/components/trace/trace-waterfall';
import { Button } from '@/components/ui/button';
import { useApplicationNames } from '@/features/applications/use-application-names';
import { useLiveHold } from '@/features/live/live-context';
import { ProjectTitle } from '@/features/projects/project-title';
import { VersionLink } from '@/features/releases/version-link';
import { formatDuration, formatRelative } from '@/lib/format';
import { paths } from '@/lib/paths';
import { useScope } from '@/lib/scope-hooks';
import { windowPhrase } from '@/lib/time-window';
import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { SquareTerminalIcon } from 'lucide-react';
import { useParams } from 'react-router';
import { operationsQueryOptions, requestDetailQueryOptions } from './queries';

export function RequestDetailPage() {
  const scope = useScope();
  const { requestId = '' } = useParams();
  useLiveHold();
  const { data: request } = useSuspenseQuery(
    requestDetailQueryOptions(scope.project, requestId),
  );
  const names = useApplicationNames();
  // Optional context: the same operation's stats over the current range.
  const { data: operations } = useQuery(operationsQueryOptions(scope));
  const stats = operations?.find(
    (op) =>
      op.operationId === request.operationId && op.method === request.method,
  );
  const tagCount = Object.keys(request.tags).length;

  return (
    <Page>
      <PageHeader>
        <ProjectTitle subtitle="Throughput, latency and failures per operation.">
          Requests
        </ProjectTitle>
        <PageActions>
          <Button variant="outline" size="xl" asChild>
            <ScopedLink
              to={paths.logs(scope.project)}
              search={{ traceId: request.traceId }}
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
              <ScopedLink
                to={paths.trace(scope.project, request.traceId)}
                className="relative hover:underline"
              >
                <IdChip value={request.traceId} length={16} />
              </ScopedLink>
            </KeyValue>
            <KeyValue label="Operation">
              <MethodBadge method={request.method} />
              <RoutePath value={request.url ?? request.operationId} />
            </KeyValue>
            <KeyValue label="Duration">
              {formatDuration(request.durationMs)}
            </KeyValue>
            <KeyValue label="Status code">
              <StatusCodeBadge code={request.statusCode} />
            </KeyValue>
            {request.error ? (
              <KeyValue label="Error" tone="error">
                {request.error.cls ? `${request.error.cls}: ` : ''}
                {request.error.message}
              </KeyValue>
            ) : null}
            <KeyValue label="User">
              {request.userId ? (
                <ScopedLink
                  to={paths.user(scope.project, request.userId)}
                  className="hover:underline"
                >
                  {request.userId}
                </ScopedLink>
              ) : (
                '-'
              )}
            </KeyValue>
            <KeyValue label="Protocol">
              {request.protocol.toUpperCase()}
            </KeyValue>
            <KeyValue label="Application">
              {names.get(request.applicationId) ?? request.serviceId}
            </KeyValue>
            <KeyValue label="Instance">{request.serviceId}</KeyValue>
            <KeyValue label="Version">
              <VersionLink version={request.serviceVersion} />
            </KeyValue>
            <KeyValue label="Called at">
              {request.calledAt}
              <span className="font-normal text-muted-foreground">
                {formatRelative(request.calledAt)}
              </span>
            </KeyValue>
            <KeyValue label="Tags">
              {tagCount > 0 ? `${tagCount} captured` : '-'}
            </KeyValue>
            <KeyValue label="Request">
              {request.request ? 'captured' : 'Not captured'}
            </KeyValue>
          </KeyValueList>
        </PanelBody>
      </Panel>

      {request.error ? <ErrorPanel error={request.error} /> : null}

      {stats ? (
        <CallComparison
          durationMs={request.durationMs}
          avg={stats.latency.avg}
          p95={stats.latency.p95}
          count={stats.count}
          rangePhrase={windowPhrase(scope)}
        />
      ) : null}

      <Panel>
        <PanelHeader title="Waterfall" />
        <PanelBody>
          <TraceWaterfall
            rootLabel={request.operationId}
            durationMs={request.durationMs}
            rootFailed={request.hasError}
            spans={request.trace}
          />
        </PanelBody>
      </Panel>

      {tagCount > 0 ? (
        <Panel>
          <PanelHeader title="Tags" />
          <PanelBody>
            <RecordList record={request.tags} />
          </PanelBody>
        </Panel>
      ) : null}

      {request.request ? (
        <Panel>
          <PanelHeader title="Captured request" />
          <PanelBody>
            <JsonBlock value={request.request} />
          </PanelBody>
        </Panel>
      ) : null}
    </Page>
  );
}
