import { LegendChip } from '@/components/panel';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { formatBytes, formatCount } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';
import {
  seriesOf,
  tableLabel,
  toSegments,
  USAGE_SERIES,
  type UsagePart,
  type UsageSegment,
} from './storage-math';

/** One legend chip per storage series, in the fixed series order. */
export function UsageLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      {USAGE_SERIES.map((series) => (
        <LegendChip
          key={series.key}
          color={series.color}
          label={series.label}
        />
      ))}
    </div>
  );
}

/**
 * A thin horizontal bar split by series. Its length is `total / max` of the
 * track, so bars of a list compare at a glance.
 */
export function StackedBar({
  segments,
  max,
  className,
}: {
  segments: readonly UsageSegment[];
  max: number;
  className?: string;
}) {
  const total = segments.reduce((sum, segment) => sum + segment.bytes, 0);
  const width = max > 0 ? (total / max) * 100 : 0;
  return (
    <div
      className={cn(
        'h-2.5 w-full rounded-full bg-foreground/[0.04]',
        className,
      )}
      aria-hidden
    >
      <div
        className="flex h-full min-w-[3px] gap-[2px] overflow-hidden rounded-full"
        style={{ width: `${width}%` }}
      >
        {segments.map((segment) => (
          <span
            key={segment.key}
            className="h-full min-w-[2px] first:rounded-l-full last:rounded-r-full"
            style={{
              background: segment.color,
              flexGrow: segment.bytes,
              flexBasis: 0,
            }}
          />
        ))}
      </div>
    </div>
  );
}

/** Per-table bytes (and rows when known), colored by series. */
function PartsBreakdown({
  title,
  parts,
}: {
  title: ReactNode;
  parts: readonly UsagePart[];
}) {
  const colors = new Map<string, string>(
    USAGE_SERIES.map((series) => [series.key, series.color]),
  );
  const sorted = parts.toSorted((a, b) => b.bytes - a.bytes);
  return (
    <div className="flex min-w-48 flex-col gap-1.5">
      <p className="font-medium">{title}</p>
      {sorted.map((part) => (
        <div key={part.table} className="flex items-center gap-2">
          <span
            className="h-3 w-[3px] shrink-0 rounded-full"
            style={{ background: colors.get(seriesOf(part.table)) }}
            aria-hidden
          />
          <span className="text-muted-foreground">
            {tableLabel(part.table)}
          </span>
          <span className="ml-auto pl-3 font-mono tabular-nums">
            {formatBytes(part.bytes)}
            {part.rows !== undefined && part.rows !== null ? (
              <span className="text-muted-foreground">
                {' '}
                · {formatCount(part.rows)} rows
              </span>
            ) : null}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Rows of `UsageRow`: one per day, application or project. */
export function UsageList({ children }: { children: ReactNode }) {
  return <ul className="flex flex-col">{children}</ul>;
}

/**
 * Label, stacked bar and size on one line, with the per-table split on hover
 * or focus. `note` sits after the size (hidden on narrow screens when long).
 */
export function UsageRow({
  label,
  title,
  parts,
  max,
  note,
}: {
  label: ReactNode;
  /** Tooltip heading, e.g. the long date. */
  title: ReactNode;
  parts: readonly UsagePart[];
  max: number;
  note?: ReactNode;
}) {
  const segments = toSegments(parts);
  const total = parts.reduce((sum, part) => sum + part.bytes, 0);
  return (
    <li>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            tabIndex={0}
            className="grid grid-cols-[4.5rem_minmax(0,1fr)_4.75rem] items-center gap-3 rounded-md px-2 py-1.5 outline-none hover:bg-foreground/[0.03] focus-visible:ring-2 focus-visible:ring-ring sm:grid-cols-[5rem_minmax(0,1fr)_5.5rem_7rem]"
          >
            <span className="truncate font-mono text-xs text-muted-foreground uppercase">
              {label}
            </span>
            <StackedBar segments={segments} max={max} />
            <span className="text-right font-mono text-[13px] tabular-nums">
              {formatBytes(total)}
            </span>
            <span className="hidden text-right font-mono text-[11px] text-muted-foreground sm:block">
              {note}
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          className="flex-col items-start border bg-popover px-3 py-2.5 text-xs text-popover-foreground [&_svg]:hidden"
        >
          <PartsBreakdown title={title} parts={parts} />
        </TooltipContent>
      </Tooltip>
    </li>
  );
}
