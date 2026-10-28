import { NumCell, TableFrame } from '@/components/data/data-table';
import { Page, PageHeader, PageSection, PageTitle } from '@/components/page';
import { EmptyState } from '@/components/states';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatRelative } from '@/lib/format';
import { useScope } from '@/lib/scope-hooks';
import { useSuspenseQuery } from '@tanstack/react-query';
import { customMetricsQueryOptions } from './queries';
import { RuntimeCharts } from './runtime-charts';

const numberFormat = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 3,
});

export function MetricsPage() {
  const scope = useScope();

  return (
    <Page>
      <PageHeader>
        <PageTitle eyebrow={scope.service ?? 'All services'}>Metrics</PageTitle>
      </PageHeader>

      <PageSection title="Runtime">
        {scope.service ? (
          <RuntimeCharts service={scope.service} range={scope.range} />
        ) : (
          <EmptyState title="Select a service">
            Runtime metrics (CPU, memory, event loop, GC) are per service. Pick
            one in the service selector at the top.
          </EmptyState>
        )}
      </PageSection>

      <PageSection title="Custom metrics">
        <CustomMetricsTable />
      </PageSection>
    </Page>
  );
}

function CustomMetricsTable() {
  const scope = useScope();
  const { data } = useSuspenseQuery(customMetricsQueryOptions(scope));
  const metrics = data.toSorted((a, b) => a.name.localeCompare(b.name));

  if (metrics.length === 0) {
    return (
      <EmptyState title="No custom metrics in this time range">
        Counters, gauges and summaries you record with the agent's metrics API
        show up here.
      </EmptyState>
    );
  }

  return (
    <TableFrame>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Description</TableHead>
            <TableHead className="text-right">Last value</TableHead>
            <TableHead className="text-right">Last seen</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {metrics.map((metric) => (
            <TableRow key={metric.name}>
              <TableCell className="font-mono text-xs">{metric.name}</TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {metric.type}
              </TableCell>
              <TableCell className="max-w-md truncate text-xs text-muted-foreground">
                {metric.description ?? '–'}
              </TableCell>
              <NumCell>
                {metric.lastValue === null
                  ? '–'
                  : numberFormat.format(metric.lastValue)}
              </NumCell>
              <NumCell className="text-muted-foreground">
                {formatRelative(metric.lastSeenAt)}
              </NumCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableFrame>
  );
}
