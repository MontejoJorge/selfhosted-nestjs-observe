import {
  KeyValue,
  KeyValueList,
  RecordList,
} from '@/components/data/key-value';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { TraceSpanDto } from '@/lib/api/generated/api';
import { formatDuration } from '@/lib/format';
import { cn } from '@/lib/utils';
import {
  ChevronDownIcon,
  ChevronRightIcon,
  CodeIcon,
  DatabaseIcon,
  GlobeIcon,
  type LucideIcon,
} from 'lucide-react';
import { memo, useMemo, useState } from 'react';
import { ErrorPanel } from './error-panel';
import {
  collectParentIds,
  countSpans,
  flattenSpans,
  maxSpanEnd,
  spanFailed,
  spanKind,
  spanLabel,
  spanSummary,
  type FlatSpan,
  type SpanKind,
} from './span-kind';

const kindIcon: Record<SpanKind, LucideIcon> = {
  db: DatabaseIcon,
  http: GlobeIcon,
  code: CodeIcon,
};

const kindBar: Record<SpanKind, string> = {
  db: 'bg-span-db',
  http: 'bg-span-http',
  code: 'bg-span-code',
};

const kindLabel: Record<SpanKind, string> = {
  db: 'Database',
  http: 'Outgoing HTTP',
  code: 'Code',
};

const TICKS = [0, 0.25, 0.5, 0.75, 1];
const ROW_GRID = 'grid grid-cols-[minmax(12rem,38%)_1fr] items-center gap-3';

interface TraceWaterfallProps {
  /** Label of the root execution, e.g. the operationId or `queue/name`. */
  rootLabel: string;
  /** Duration of the root execution in ms. */
  durationMs: number;
  rootFailed: boolean;
  spans: readonly TraceSpanDto[];
}

/**
 * Renders the span tree of one execution as a timeline: one row per span,
 * positioned by `startOffsetMs` and sized by `durationMs`. Rows with children
 * collapse; clicking a row reveals its tags and error.
 */
export const TraceWaterfall = memo(function TraceWaterfall({
  rootLabel,
  durationMs,
  rootFailed,
  spans,
}: TraceWaterfallProps) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [selected, setSelected] = useState<string | null>(null);

  const total = useMemo(
    () => Math.max(durationMs, maxSpanEnd(spans), 0.001),
    [durationMs, spans],
  );
  const rows = useMemo(
    () => flattenSpans(spans, collapsed),
    [spans, collapsed],
  );
  const spanCount = useMemo(() => countSpans(spans), [spans]);

  const toggleCollapsed = (id: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {spanCount} {spanCount === 1 ? 'span' : 'spans'} ·{' '}
          {formatDuration(total)}
        </span>
        <div className="flex items-center gap-3">
          <Legend />
          {spanCount > 0 ? (
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="xs"
                onClick={() => setCollapsed(new Set())}
              >
                Expand all
              </Button>
              <Button
                variant="ghost"
                size="xs"
                onClick={() => setCollapsed(new Set(collectParentIds(spans)))}
              >
                Collapse all
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <div className="min-w-[40rem] text-xs">
          <div
            className={cn(
              ROW_GRID,
              'border-b bg-muted/40 px-2 py-1.5 text-muted-foreground',
            )}
          >
            <span>Span</span>
            <div className="relative h-4">
              {TICKS.map((tick) => (
                <span
                  key={tick}
                  className={cn(
                    'absolute top-0 font-mono tabular-nums',
                    tick === 1
                      ? '-translate-x-full'
                      : tick > 0 && '-translate-x-1/2',
                  )}
                  style={{ left: `${tick * 100}%` }}
                >
                  {formatDuration(total * tick)}
                </span>
              ))}
            </div>
          </div>

          <div className={cn(ROW_GRID, 'border-b px-2 py-1.5')}>
            <span className="truncate font-medium" title={rootLabel}>
              {rootLabel}
            </span>
            <Bar
              left={0}
              width={durationMs / total}
              className={rootFailed ? 'bg-status-error' : 'bg-primary'}
              label={formatDuration(durationMs)}
            />
          </div>

          {rows.length === 0 ? (
            <p className="px-2 py-4 text-center text-muted-foreground">
              No spans were captured for this execution.
            </p>
          ) : (
            rows.map((row) => (
              <SpanRow
                key={row.id}
                row={row}
                total={total}
                isCollapsed={collapsed.has(row.id)}
                isSelected={selected === row.id}
                onToggleCollapsed={toggleCollapsed}
                onSelect={(id) =>
                  setSelected((current) => (current === id ? null : id))
                }
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
});

function Legend() {
  return (
    <div className="hidden items-center gap-3 sm:flex">
      {(Object.keys(kindLabel) as SpanKind[]).map((kind) => (
        <span key={kind} className="inline-flex items-center gap-1">
          <span className={cn('size-2 rounded-[2px]', kindBar[kind])} />
          {kindLabel[kind]}
        </span>
      ))}
      <span className="inline-flex items-center gap-1">
        <span className="size-2 rounded-[2px] bg-status-error" />
        Failed
      </span>
    </div>
  );
}

function Bar({
  left,
  width,
  className,
  label,
}: {
  left: number;
  width: number | null;
  className: string;
  label: string;
}) {
  const clampedLeft = Math.min(Math.max(left, 0), 1);
  return (
    <div className="relative h-4">
      <div
        className={cn('absolute top-1 h-2 rounded-[2px]', className)}
        style={{
          left: `${clampedLeft * 100}%`,
          width:
            width === null
              ? '2px'
              : `max(2px, ${Math.min(width, 1 - clampedLeft) * 100}%)`,
        }}
      />
      <span
        className={cn(
          'absolute top-0 font-mono text-[11px] whitespace-nowrap text-muted-foreground tabular-nums',
          clampedLeft > 0.7 ? '-translate-x-full pr-1' : 'pl-1',
        )}
        style={{
          left:
            clampedLeft > 0.7
              ? `${clampedLeft * 100}%`
              : `${(clampedLeft + (width ?? 0)) * 100}%`,
        }}
      >
        {label}
      </span>
    </div>
  );
}

const SpanRow = memo(function SpanRow({
  row,
  total,
  isCollapsed,
  isSelected,
  onToggleCollapsed,
  onSelect,
}: {
  row: FlatSpan;
  total: number;
  isCollapsed: boolean;
  isSelected: boolean;
  onToggleCollapsed: (id: string) => void;
  onSelect: (id: string) => void;
}) {
  const { span } = row;
  const kind = spanKind(span);
  const failed = spanFailed(span);
  const Icon = kindIcon[kind];
  const summary = spanSummary(span.tags);
  const hasChildren = span.children.length > 0;

  return (
    <div
      className={cn('border-b last:border-b-0', isSelected && 'bg-muted/50')}
    >
      <div className={cn(ROW_GRID, 'px-2 py-1 hover:bg-muted/40')}>
        <div
          className="flex min-w-0 items-center gap-1"
          style={{ paddingLeft: `${row.depth * 14}px` }}
        >
          {hasChildren ? (
            <button
              type="button"
              className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label={isCollapsed ? 'Expand span' : 'Collapse span'}
              aria-expanded={!isCollapsed}
              onClick={() => onToggleCollapsed(row.id)}
            >
              {isCollapsed ? (
                <ChevronRightIcon className="size-3.5" />
              ) : (
                <ChevronDownIcon className="size-3.5" />
              )}
            </button>
          ) : (
            <span className="w-4.5 shrink-0" />
          )}
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
            aria-expanded={isSelected}
            onClick={() => onSelect(row.id)}
          >
            <Icon
              className={cn(
                'size-3.5 shrink-0',
                failed ? 'text-status-error' : 'text-muted-foreground',
              )}
              aria-label={kindLabel[kind]}
            />
            <span className={cn('truncate', failed && 'text-status-error')}>
              {spanLabel(span)}
            </span>
            {summary ? (
              <span className="truncate font-mono text-muted-foreground">
                {summary}
              </span>
            ) : null}
          </button>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="block w-full text-left"
              onClick={() => onSelect(row.id)}
              aria-label={`${spanLabel(span)}: ${formatDuration(row.duration)}`}
            >
              <Bar
                left={row.start / total}
                width={row.duration === null ? null : row.duration / total}
                className={failed ? 'bg-status-error' : kindBar[kind]}
                label={formatDuration(row.duration)}
              />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" align="start" className="max-w-md">
            <SpanTooltip row={row} />
          </TooltipContent>
        </Tooltip>
      </div>
      {isSelected ? <SpanDetails row={row} /> : null}
    </div>
  );
});

function SpanTooltip({ row }: { row: FlatSpan }) {
  const { span } = row;
  const entries = Object.entries(span.tags).slice(0, 6);
  return (
    <div className="flex flex-col gap-1">
      <div className="font-medium">{spanLabel(span)}</div>
      <div className="font-mono">
        +{formatDuration(row.start)} · {formatDuration(row.duration)}
      </div>
      {entries.map(([key, value]) => (
        <div key={key} className="truncate font-mono">
          <span className="opacity-70">{key}:</span> {String(value)}
        </div>
      ))}
    </div>
  );
}

function SpanDetails({ row }: { row: FlatSpan }) {
  const { span } = row;
  return (
    <div className="flex flex-col gap-3 border-t bg-background px-4 py-3">
      <KeyValueList>
        <KeyValue label="Method">
          <code>
            {span.className}.{span.methodName}
          </code>
        </KeyValue>
        <KeyValue label="Origin">{span.origin}</KeyValue>
        <KeyValue label="Start">+{formatDuration(row.start)}</KeyValue>
        <KeyValue label="Duration">{formatDuration(row.duration)}</KeyValue>
        {span.spanId ? (
          <KeyValue label="Span ID">
            <code>{span.spanId}</code>
          </KeyValue>
        ) : null}
      </KeyValueList>
      <div className="flex flex-col gap-1">
        <div className="text-xs font-medium text-muted-foreground">Tags</div>
        <RecordList record={span.tags} />
      </div>
      {typeof span.error === 'object' && span.error !== null ? (
        <ErrorPanel error={span.error} />
      ) : span.error === true ? (
        <p className="text-sm text-status-error">
          This span failed, but no error details were captured.
        </p>
      ) : null}
    </div>
  );
}
