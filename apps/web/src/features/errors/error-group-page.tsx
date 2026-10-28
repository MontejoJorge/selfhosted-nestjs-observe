import { ChartCard } from '@/components/charts/chart-card';
import {
  TimeSeriesChart,
  type SeriesSpec,
} from '@/components/charts/time-series-chart';
import { SourceBadge } from '@/components/data/badges';
import { CodeBlock } from '@/components/data/code-block';
import {
  LinkRow,
  stretchedLink,
  TableFrame,
} from '@/components/data/data-table';
import { Stat, StatGrid } from '@/components/data/stat';
import { Page, PageHeader, PageSection, PageTitle } from '@/components/page';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  formatCount,
  formatDateTime,
  formatRelative,
  shortId,
} from '@/lib/format';
import { useScope } from '@/lib/scope-hooks';
import type { TimeBucket } from '@selfhosted-observe/contracts';
import { useSuspenseQuery } from '@tanstack/react-query';
import { getRouteApi, Link } from '@tanstack/react-router';
import { useMemo } from 'react';
import { errorGroupQueryOptions } from './queries';

const route = getRouteApi('/errors/$errorId');

const occurrenceSeries: SeriesSpec[] = [
  { key: 'count', label: 'Events', color: 'var(--status-error)', mark: 'bar' },
];

function OccurrenceChart({ buckets }: { buckets: readonly TimeBucket[] }) {
  const data = useMemo(
    () => buckets.map((b) => ({ t: b.t, count: b.count })),
    [buckets],
  );
  return (
    <TimeSeriesChart
      data={data}
      series={occurrenceSeries}
      formatValue={formatCount}
    />
  );
}

export function ErrorGroupPage() {
  const { errorId } = route.useParams();
  const scope = useScope();
  const { data: group } = useSuspenseQuery(
    errorGroupQueryOptions(errorId, scope),
  );

  return (
    <Page>
      <PageHeader>
        <PageTitle
          eyebrow={
            <Link to="/errors" className="hover:underline">
              Errors
            </Link>
          }
        >
          <span className="font-mono text-status-error">
            {group.errorClass ?? 'Error'}
          </span>
        </PageTitle>
        <SourceBadge source={group.source} />
      </PageHeader>

      <p className="text-sm break-words">{group.message}</p>

      <StatGrid className="lg:grid-cols-4">
        <Stat label="Events" value={formatCount(group.count)} />
        <Stat
          label="Culprit"
          value={
            <span className="font-mono text-sm">{group.culprit ?? '–'}</span>
          }
        />
        <Stat
          label="First seen"
          value={formatRelative(group.firstSeenAt)}
          detail={formatDateTime(group.firstSeenAt)}
        />
        <Stat
          label="Last seen"
          value={formatRelative(group.lastSeenAt)}
          detail={formatDateTime(group.lastSeenAt)}
        />
      </StatGrid>

      <ChartCard title="Occurrences" description={`Service ${group.serviceId}`}>
        <OccurrenceChart buckets={group.timeline} />
      </ChartCard>

      {group.stack ? (
        <PageSection title="Stack trace">
          <CodeBlock>{group.stack}</CodeBlock>
        </PageSection>
      ) : null}

      <PageSection title="Recent occurrences">
        {group.occurrences.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No occurrences in this time range.
          </p>
        ) : (
          <TableFrame>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Service</TableHead>
                  <TableHead>Trace</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {group.occurrences.map((occurrence) => (
                  <LinkRow key={occurrence.executionId}>
                    <TableCell className="font-mono text-xs">
                      {occurrence.source === 'request' ? (
                        <Link
                          to="/requests/$requestId"
                          params={{ requestId: occurrence.executionId }}
                          className={stretchedLink}
                        >
                          {formatDateTime(occurrence.occurredAt)}
                        </Link>
                      ) : (
                        <Link
                          to="/jobs/$jobId"
                          params={{ jobId: occurrence.executionId }}
                          className={stretchedLink}
                        >
                          {formatDateTime(occurrence.occurredAt)}
                        </Link>
                      )}
                    </TableCell>
                    <TableCell>
                      <SourceBadge source={occurrence.source} />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {occurrence.serviceId}
                    </TableCell>
                    <TableCell>
                      <Link
                        to="/traces/$traceId"
                        params={{ traceId: occurrence.traceId }}
                        className="relative z-10 font-mono text-xs text-primary hover:underline"
                      >
                        {shortId(occurrence.traceId)}
                      </Link>
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
