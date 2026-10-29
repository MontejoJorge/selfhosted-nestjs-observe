import {
  NumCell,
  stretchedLink,
  TableFrame,
} from '@/components/data/data-table';
import { Duration } from '@/components/data/metric-cells';
import { SortableHead } from '@/components/data/sort';
import {
  useSortedRows,
  type SortAccessors,
} from '@/components/data/use-sorted-rows';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { TimeBreakdownItemDto } from '@/lib/api/generated/api';
import { formatCount, formatRate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { categoryColor, categoryLabel, spanCategory } from './origin';
import type { SpanTarget } from './queries';
import { targetKey as itemKey } from './search';

type SortKey = 'self' | 'total' | 'calls' | 'avg' | 'p95';

const accessors: SortAccessors<TimeBreakdownItemDto, SortKey> = {
  self: (row) => row.selfMs,
  total: (row) => row.totalMs,
  calls: (row) => row.calls,
  avg: (row) => row.avgMs,
  p95: (row) => row.p95Ms,
};

/**
 * Ranked self time per class.method. Each bar is the row's self time relative
 * to the top row, colored by kind; clicking a row opens its slowest calls.
 */
export function BreakdownTable({
  items,
  selected,
  onSelect,
}: {
  items: readonly TimeBreakdownItemDto[];
  selected: SpanTarget | null;
  onSelect: (item: TimeBreakdownItemDto) => void;
}) {
  const { sorted, sort, toggle } = useSortedRows(items, accessors, {
    key: 'self',
    direction: 'desc',
  });
  const maxSelf = items.reduce((max, item) => Math.max(max, item.selfMs), 0);
  const selectedKey = selected ? itemKey(selected) : null;

  return (
    <TableFrame>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12 text-right">#</TableHead>
            <TableHead>Class and method</TableHead>
            <SortableHead
              sortKey="self"
              sort={sort}
              onToggle={toggle}
              className="w-[30%] min-w-64"
            >
              Self time
            </SortableHead>
            <SortableHead
              sortKey="total"
              sort={sort}
              onToggle={toggle}
              className="text-right"
            >
              Total
            </SortableHead>
            <SortableHead
              sortKey="calls"
              sort={sort}
              onToggle={toggle}
              className="text-right"
            >
              Calls
            </SortableHead>
            <SortableHead
              sortKey="avg"
              sort={sort}
              onToggle={toggle}
              className="text-right"
            >
              Avg
            </SortableHead>
            <SortableHead
              sortKey="p95"
              sort={sort}
              onToggle={toggle}
              className="text-right"
            >
              P95
            </SortableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((item, index) => {
            const key = itemKey(item);
            const category = spanCategory(item);
            const color = categoryColor(category);
            return (
              <TableRow
                key={key}
                data-state={key === selectedKey ? 'selected' : undefined}
                className="relative cursor-pointer [transform:translateZ(0)] data-[state=selected]:bg-primary/5"
              >
                <NumCell className="text-muted-foreground">{index + 1}</NumCell>
                <TableCell className="max-w-md">
                  <button
                    type="button"
                    onClick={() => onSelect(item)}
                    className={cn(
                      stretchedLink,
                      'flex min-w-0 flex-col items-start gap-0.5 text-left',
                    )}
                    title={`${item.className}.${item.methodName}`}
                  >
                    <span className="max-w-full truncate font-mono text-[13px]">
                      {item.className}
                      <span className="text-muted-foreground">.</span>
                      <span className="font-semibold">{item.methodName}</span>
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span
                        className="h-2.5 w-[3px] rounded-full"
                        style={{ background: color }}
                        aria-hidden
                      />
                      {categoryLabel(category)}
                    </span>
                  </button>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <span
                      className="relative h-2 min-w-16 flex-1 overflow-hidden rounded-full bg-bar/40"
                      aria-hidden
                    >
                      <span
                        className="absolute inset-y-0 left-0 rounded-full"
                        style={{
                          width: `${maxSelf > 0 ? Math.max(1, (item.selfMs / maxSelf) * 100) : 0}%`,
                          background: color,
                        }}
                      />
                    </span>
                    <span className="w-20 text-right">
                      <Duration ms={item.selfMs} />
                    </span>
                    <span className="w-12 text-right font-mono text-xs text-muted-foreground tabular-nums">
                      {formatRate(item.share)}
                    </span>
                  </div>
                </TableCell>
                <NumCell>
                  <Duration ms={item.totalMs} />
                </NumCell>
                <NumCell>
                  {formatCount(item.calls)}
                  {item.errorCount > 0 ? (
                    <span className="block text-[11px] text-primary">
                      {formatCount(item.errorCount)} failed
                    </span>
                  ) : null}
                </NumCell>
                <NumCell>
                  <Duration ms={item.avgMs} />
                </NumCell>
                <NumCell>
                  <Duration ms={item.p95Ms} />
                </NumCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableFrame>
  );
}
