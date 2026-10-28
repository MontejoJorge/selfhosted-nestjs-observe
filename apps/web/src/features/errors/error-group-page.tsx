import { ErrorStemChart } from '@/components/charts/bucket-charts';
import { SourceBadge } from '@/components/data/badges';
import { CodeBlock } from '@/components/data/code-block';
import { IdChip } from '@/components/data/copy';
import {
  LinkRow,
  stretchedLink,
  TableFrame,
} from '@/components/data/data-table';
import { KeyValue, KeyValueList } from '@/components/data/key-value';
import { ScopeControls } from '@/components/layout/scope-controls';
import { Page, PageHeader, PageSection } from '@/components/page';
import {
  ChartRange,
  CountBadge,
  Panel,
  PanelBody,
  PanelHeader,
} from '@/components/panel';
import { ScopedLink } from '@/components/scoped-link';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useApplicationNames } from '@/features/applications/use-application-names';
import { ProjectTitle } from '@/features/projects/project-title';
import type { TimeBucketDto } from '@/lib/api/generated/api';
import { formatCount, formatRelative } from '@/lib/format';
import { paths } from '@/lib/paths';
import { useScope } from '@/lib/scope-hooks';
import { formatLongDate } from '@/lib/stats';
import { cn } from '@/lib/utils';
import { useSuspenseQuery } from '@tanstack/react-query';
import { useParams } from 'react-router';
import { errorGroupQueryOptions } from './queries';

/** Occurrences per bucket: the group's timeline counts are its events. */
const pickCount = (bucket: TimeBucketDto) => bucket.count;

export function ErrorGroupPage() {
  const { errorId = '' } = useParams();
  const scope = useScope();
  const { data: group } = useSuspenseQuery(
    errorGroupQueryOptions(errorId, scope),
  );
  const names = useApplicationNames();
  const inRange = group.timeline.reduce((sum, b) => sum + b.count, 0);

  return (
    <Page>
      <PageHeader>
        <ProjectTitle subtitle="Analytics and insights on errors within your project.">
          Errors
        </ProjectTitle>
        <ScopeControls />
      </PageHeader>

      <div className="grid min-w-0 gap-6 xl:grid-cols-2">
        <Panel>
          <PanelHeader title="Details" />
          <PanelBody>
            <KeyValueList>
              <KeyValue label="Error" tone="error">
                {group.errorClass ?? 'Error'}
              </KeyValue>
              <KeyValue label="Message">{group.message}</KeyValue>
              <KeyValue label="Culprit">{group.culprit ?? '-'}</KeyValue>
              <KeyValue label="Source">
                <SourceBadge source={group.source} />
              </KeyValue>
              <KeyValue label="Application">
                {names.get(group.applicationId) ?? group.serviceId}
              </KeyValue>
              <KeyValue label="Events (all time)">
                {formatCount(group.count)}
              </KeyValue>
              <KeyValue label="First seen">
                {formatRelative(group.firstSeenAt)}
              </KeyValue>
              <KeyValue label="Last seen">
                {formatRelative(group.lastSeenAt)}
              </KeyValue>
            </KeyValueList>
          </PanelBody>
        </Panel>
        <Panel>
          <PanelHeader title="Occurrences">
            <CountBadge>{formatCount(inRange)}</CountBadge>
          </PanelHeader>
          <PanelBody>
            <ErrorStemChart
              buckets={group.timeline}
              pick={pickCount}
              className="h-56"
            />
            {group.timeline.length > 0 ? (
              <ChartRange
                from={formatLongDate(group.timeline[0].t)}
                to={formatLongDate(group.timeline[group.timeline.length - 1].t)}
              />
            ) : null}
          </PanelBody>
        </Panel>
      </div>

      {group.stack ? (
        <Panel>
          <PanelHeader title="Stack trace" />
          <PanelBody>
            <CodeBlock className="max-h-[32rem]">{group.stack}</CodeBlock>
          </PanelBody>
        </Panel>
      ) : null}

      <PageSection title="Recent occurrences" className="mt-4">
        {group.occurrences.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No occurrences in this time range.
          </p>
        ) : (
          <TableFrame>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Trace ID</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Instance</TableHead>
                  <TableHead className="text-right">Occurred</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {group.occurrences.map((occurrence) => (
                  <LinkRow key={occurrence.executionId}>
                    <TableCell className="w-40">
                      <IdChip value={occurrence.traceId} />
                    </TableCell>
                    <TableCell>
                      <ScopedLink
                        to={
                          occurrence.source === 'request'
                            ? paths.request(
                                scope.project,
                                occurrence.executionId,
                              )
                            : paths.job(scope.project, occurrence.executionId)
                        }
                        className={cn(stretchedLink)}
                      >
                        <SourceBadge source={occurrence.source} />
                      </ScopedLink>
                    </TableCell>
                    <TableCell className="font-mono text-[13px]">
                      {occurrence.serviceId}
                    </TableCell>
                    <TableCell className="text-right text-sm whitespace-nowrap text-muted-foreground">
                      {formatRelative(occurrence.occurredAt)}
                    </TableCell>
                  </LinkRow>
                ))}
              </TableBody>
            </Table>
          </TableFrame>
        )}
      </PageSection>
    </Page>
  );
}
