import {
  MethodBadge,
  RequestOutcomeBadge,
  StatusCodeBadge,
} from '@/components/data/badges';
import { JsonBlock } from '@/components/data/code-block';
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
import type { RequestDetail } from '@selfhosted-observe/contracts';
import { Link } from '@tanstack/react-router';

/** Headline of a request: method, operation, status and timing. */
export function RequestSummary({ request }: { request: RequestDetail }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <MethodBadge method={request.method} />
      <StatusCodeBadge code={request.statusCode} />
      <RequestOutcomeBadge hasError={request.hasError} />
      <span className="font-mono">{formatDuration(request.durationMs)}</span>
      <span className="text-muted-foreground">
        {formatDateTime(request.calledAt)}
      </span>
    </div>
  );
}

export function RequestMetadata({ request }: { request: RequestDetail }) {
  return (
    <KeyValueList>
      <KeyValue label="Trace ID">
        <Link
          to="/traces/$traceId"
          params={{ traceId: request.traceId }}
          className="font-mono text-xs text-primary hover:underline"
        >
          {request.traceId}
        </Link>
      </KeyValue>
      <KeyValue label="Request ID">
        <code className="text-xs">{request.id}</code>
      </KeyValue>
      <KeyValue label="Service">
        {request.serviceId}
        {request.serviceVersion ? (
          <span className="text-muted-foreground">
            {' '}
            @ {request.serviceVersion}
          </span>
        ) : null}
      </KeyValue>
      <KeyValue label="Protocol">{request.protocol}</KeyValue>
      <KeyValue label="Operation">
        <code className="text-xs">{request.operationId}</code>
      </KeyValue>
      {request.url ? (
        <KeyValue label="URL">
          <code className="text-xs">{request.url}</code>
        </KeyValue>
      ) : null}
      <KeyValue label="User">{request.userId ?? '–'}</KeyValue>
      <KeyValue label="Called at">{formatDateTime(request.calledAt)}</KeyValue>
    </KeyValueList>
  );
}

/** The body of a request detail: error, waterfall, metadata, captured request and tags. */
export function RequestDetailView({ request }: { request: RequestDetail }) {
  return (
    <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="flex min-w-0 flex-col gap-4">
        {request.error ? (
          <PageSection title="Error">
            <ErrorPanel error={request.error} />
          </PageSection>
        ) : null}
        <PageSection title="Trace">
          <TraceWaterfall
            rootLabel={request.operationId}
            durationMs={request.durationMs}
            rootFailed={request.hasError}
            spans={request.trace}
          />
        </PageSection>
        {request.request ? (
          <PageSection title="Captured request">
            <JsonBlock value={request.request} />
          </PageSection>
        ) : null}
      </div>
      <div className="flex min-w-0 flex-col gap-4">
        <Card size="sm">
          <CardContent>
            <RequestMetadata request={request} />
          </CardContent>
        </Card>
        <PageSection
          title="Tags"
          actions={
            <Link
              to="/logs"
              search={{ traceId: request.traceId }}
              className="text-xs text-primary hover:underline"
            >
              Logs for this trace →
            </Link>
          }
        >
          <RecordList record={request.tags} />
        </PageSection>
      </div>
    </div>
  );
}
