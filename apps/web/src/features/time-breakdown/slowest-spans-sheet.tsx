import { SourceBadge } from '@/components/data/badges';
import {
  LinkRow,
  stretchedLink,
  TableFrame,
} from '@/components/data/data-table';
import { KeyValue, KeyValueList } from '@/components/data/key-value';
import { Duration, RoutePath } from '@/components/data/metric-cells';
import { ScopedLink } from '@/components/scoped-link';
import { EmptyState, ErrorState } from '@/components/states';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type {
  SlowSpanDto,
  TimeBreakdownItemDto,
} from '@/lib/api/generated/api';
import {
  formatCount,
  formatDuration,
  formatRate,
  formatRelative,
} from '@/lib/format';
import { paths } from '@/lib/paths';
import { useScope } from '@/lib/scope-hooks';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { categoryColor, categoryLabel, spanCategory } from './origin';
import {
  slowestSpansQueryOptions,
  type SpanTarget,
  type TimeBreakdownFilters,
} from './queries';

/**
 * Side sheet with the slowest calls of one class.method, linking to their
 * traces. The API keeps the slowest call per 5-minute window, instance and
 * operation, so a burst of slow calls shows once.
 */
export function SlowestSpansSheet({
  target,
  item,
  filters,
  onClose,
}: {
  target: SpanTarget | null;
  /** The breakdown row for `target`, when it is in the current results. */
  item: TimeBreakdownItemDto | undefined;
  filters: TimeBreakdownFilters;
  onClose: () => void;
}) {
  return (
    <Sheet
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent className="w-full gap-0 overflow-y-auto data-[side=right]:sm:max-w-2xl">
        {target ? (
          <>
            <SheetHeader className="border-b px-6 py-5">
              <SheetDescription className="inline-flex items-center gap-1.5 font-mono text-[11px] tracking-wider uppercase">
                <span
                  className="h-2.5 w-[3px] rounded-full"
                  style={{ background: categoryColor(spanCategory(target)) }}
                  aria-hidden
                />
                {categoryLabel(spanCategory(target))} · slowest calls
              </SheetDescription>
              <SheetTitle className="font-mono text-base break-all">
                {target.className}
                <span className="text-muted-foreground">.</span>
                {target.methodName}
              </SheetTitle>
            </SheetHeader>
            <div className="flex flex-col gap-6 px-6 py-5">
              {item ? <ItemStats item={item} /> : null}
              <section className="flex flex-col gap-2">
                <h3 className="text-[15px] font-semibold">Slowest calls</h3>
                <p className="text-xs text-muted-foreground">
                  The slowest call per 5-minute window, instance and operation.
                  Open one to see its trace.
                </p>
                <SpanList target={target} filters={filters} />
              </section>
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function ItemStats({ item }: { item: TimeBreakdownItemDto }) {
  return (
    <KeyValueList>
      <KeyValue label="Self time">
        {formatDuration(item.selfMs)}
        <span className="text-muted-foreground">
          {formatRate(item.share)} of all
        </span>
      </KeyValue>
      <KeyValue label="Total time">{formatDuration(item.totalMs)}</KeyValue>
      <KeyValue label="Calls">
        {formatCount(item.calls)}
        {item.errorCount > 0 ? (
          <span className="text-primary">
            {formatCount(item.errorCount)} failed
          </span>
        ) : null}
      </KeyValue>
      <KeyValue label="Avg. Duration">{formatDuration(item.avgMs)}</KeyValue>
      <KeyValue label="95th Percentile">{formatDuration(item.p95Ms)}</KeyValue>
    </KeyValueList>
  );
}

function SpanList({
  target,
  filters,
}: {
  target: SpanTarget;
  filters: TimeBreakdownFilters;
}) {
  const scope = useScope();
  const query = useQuery(slowestSpansQueryOptions(scope, filters, target));

  if (query.isPending) {
    return (
      <div
        className="flex flex-col gap-2"
        aria-busy="true"
        aria-label="Loading"
      >
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-12 rounded-lg" />
        ))}
      </div>
    );
  }
  if (query.isError) {
    return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  }
  if (query.data.length === 0) {
    return <EmptyState title="No calls of this method in this time range" />;
  }

  return (
    <TableFrame>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Operation</TableHead>
            <TableHead className="text-right">Duration</TableHead>
            <TableHead className="text-right">Self</TableHead>
            <TableHead className="text-right">Called at</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {query.data.map((span) => (
            <SpanRow
              key={`${span.executionId}:${span.calledAt}:${span.durationMs}`}
              span={span}
            />
          ))}
        </TableBody>
      </Table>
    </TableFrame>
  );
}

function SpanRow({ span }: { span: SlowSpanDto }) {
  const { project } = useScope();
  const to =
    span.source === 'request'
      ? paths.request(project, span.executionId)
      : paths.job(project, span.executionId);
  return (
    <LinkRow>
      <TableCell className="max-w-72">
        <ScopedLink
          to={to}
          className={cn(stretchedLink, 'flex min-w-0 flex-col gap-1')}
        >
          <span className="flex min-w-0 items-center gap-2">
            <SourceBadge source={span.source} />
            <RoutePath value={span.operationId} />
          </span>
          <span className="truncate font-mono text-[11px] text-muted-foreground">
            {span.serviceId}
          </span>
        </ScopedLink>
      </TableCell>
      <TableCell className="text-right">
        <Duration ms={span.durationMs} />
      </TableCell>
      <TableCell className="text-right">
        <Duration ms={span.selfMs} />
      </TableCell>
      <TableCell className="text-right text-sm whitespace-nowrap text-muted-foreground">
        {formatRelative(span.calledAt)}
      </TableCell>
    </LinkRow>
  );
}
