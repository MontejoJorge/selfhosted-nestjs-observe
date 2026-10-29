import { MessageRow, NumCell, TableFrame } from '@/components/data/data-table';
import { SortableHead } from '@/components/data/sort';
import {
  useSortedRows,
  type SortAccessors,
} from '@/components/data/use-sorted-rows';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { ServiceDto, ServiceMethodDto } from '@/lib/api/generated/api';
import { formatCount, formatDuration, formatShare } from '@/lib/format';
import { cn } from '@/lib/utils';
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from 'lucide-react';
import { Fragment, useState, type ReactNode } from 'react';
import { avgOwnMs } from './search';

export const SERVICES_PAGE_SIZE = 8;
const COLUMNS = 7;

type SortKey =
  'className' | 'own' | 'avgOwn' | 'total' | 'calls' | 'errors' | 'methods';

const accessors: SortAccessors<ServiceDto, SortKey> = {
  className: (row) => row.className.toLowerCase(),
  own: (row) => row.selfMs,
  avgOwn: avgOwnMs,
  total: (row) => row.totalMs,
  calls: (row) => row.calls,
  errors: (row) => row.errorCount,
  methods: (row) => row.methods.length,
};

/**
 * Own time against the largest own time in the table: own time in the accent color,
 * total time (own plus everything awaited) as a darker track behind it.
 */
function TimeBar({
  ownMs,
  totalMs,
  maxMs,
  className,
}: {
  ownMs: number;
  totalMs: number;
  maxMs: number;
  className?: string;
}) {
  const width = (ms: number) =>
    maxMs > 0 ? `${Math.min(100, (ms / maxMs) * 100)}%` : '0%';
  return (
    <span
      aria-hidden
      className={cn(
        'relative block h-1 overflow-hidden rounded-full bg-foreground/10',
        className,
      )}
    >
      <span
        className="absolute inset-y-0 left-0 rounded-full bg-primary/30"
        style={{ width: width(totalMs) }}
      />
      <span
        className="absolute inset-y-0 left-0 rounded-full bg-primary"
        style={{ width: width(ownMs) }}
      />
    </span>
  );
}

function Errors({ count }: { count: number }) {
  return (
    <span className={cn(count > 0 && 'font-semibold text-primary')}>
      {formatCount(count)}
    </span>
  );
}

/**
 * Classes by own time with client-side pages; a row expands into its methods.
 * Remount with a `key` to go back to the first page when the rows change.
 */
export function ServicesTable({
  services,
  emptyMessage,
}: {
  services: readonly ServiceDto[];
  emptyMessage: ReactNode;
}) {
  const { sorted, sort, toggle } = useSortedRows(services, accessors, {
    key: 'own',
    direction: 'desc',
  });
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const pageCount = Math.max(1, Math.ceil(sorted.length / SERVICES_PAGE_SIZE));
  const current = Math.min(page, pageCount - 1);
  const rows = sorted.slice(
    current * SERVICES_PAGE_SIZE,
    (current + 1) * SERVICES_PAGE_SIZE,
  );
  const maxOwnMs = services.reduce(
    (max, service) => Math.max(max, service.selfMs),
    0,
  );
  const toggleRow = (className: string) =>
    setExpanded((open) => {
      const next = new Set(open);
      if (!next.delete(className)) next.add(className);
      return next;
    });

  return (
    <TableFrame
      footer={
        pageCount > 1 ? (
          <>
            <Button
              variant="outline"
              size="sm"
              disabled={current === 0}
              onClick={() => setPage(current - 1)}
            >
              <ChevronLeftIcon /> Previous
            </Button>
            <span className="text-sm">
              Page {current + 1} of {pageCount}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={current >= pageCount - 1}
              onClick={() => setPage(current + 1)}
            >
              Next <ChevronRightIcon />
            </Button>
          </>
        ) : undefined
      }
    >
      <Table>
        <TableHeader>
          <TableRow>
            <SortableHead sortKey="className" sort={sort} onToggle={toggle}>
              Class
            </SortableHead>
            <SortableHead
              sortKey="own"
              sort={sort}
              onToggle={toggle}
              className="w-56"
            >
              Own time
            </SortableHead>
            <SortableHead
              sortKey="avgOwn"
              sort={sort}
              onToggle={toggle}
              className="text-right"
            >
              Avg own / call
            </SortableHead>
            <SortableHead
              sortKey="total"
              sort={sort}
              onToggle={toggle}
              className="text-right"
            >
              Total time
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
              sortKey="errors"
              sort={sort}
              onToggle={toggle}
              className="text-right"
            >
              Errors
            </SortableHead>
            <SortableHead
              sortKey="methods"
              sort={sort}
              onToggle={toggle}
              className="text-right"
            >
              Methods
            </SortableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((service) => {
            const open = expanded.has(service.className);
            return (
              <Fragment key={service.className}>
                <TableRow className="[&>td:first-child]:border-l-2 [&>td:first-child]:border-l-primary/70">
                  <TableCell>
                    <button
                      type="button"
                      onClick={() => toggleRow(service.className)}
                      aria-expanded={open}
                      aria-label={`${open ? 'Collapse' : 'Expand'} ${service.className}`}
                      className="flex min-w-0 items-center gap-3 text-left"
                    >
                      <span
                        className={cn(
                          'grid size-6 shrink-0 place-items-center rounded-md border text-muted-foreground',
                          open && 'border-primary text-primary',
                        )}
                      >
                        <ChevronDownIcon
                          className={cn(
                            'size-3.5 transition-transform',
                            !open && '-rotate-90',
                          )}
                        />
                      </span>
                      <span className="truncate font-mono text-[13px]">
                        {service.className}
                      </span>
                    </button>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1.5">
                      <span className="font-mono text-[13px] tabular-nums">
                        <span className="font-semibold">
                          {formatDuration(service.selfMs)}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {' '}
                          · {formatShare(service.share)}%
                        </span>
                      </span>
                      <TimeBar
                        ownMs={service.selfMs}
                        totalMs={service.totalMs}
                        maxMs={maxOwnMs}
                        className="w-40"
                      />
                    </div>
                  </TableCell>
                  <NumCell>{formatDuration(avgOwnMs(service))}</NumCell>
                  <NumCell className="text-muted-foreground">
                    {formatDuration(service.totalMs)}
                  </NumCell>
                  <NumCell>{formatCount(service.calls)}</NumCell>
                  <NumCell>
                    <Errors count={service.errorCount} />
                  </NumCell>
                  <NumCell>{service.methods.length}</NumCell>
                </TableRow>
                {open ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={COLUMNS} className="h-auto! p-0!">
                      <MethodsTable methods={service.methods} />
                    </TableCell>
                  </TableRow>
                ) : null}
              </Fragment>
            );
          })}
          {rows.length === 0 ? (
            <MessageRow colSpan={COLUMNS}>{emptyMessage}</MessageRow>
          ) : null}
        </TableBody>
      </Table>
    </TableFrame>
  );
}

/** The methods of one class, by own time, under its expanded row. */
function MethodsTable({ methods }: { methods: readonly ServiceMethodDto[] }) {
  const maxOwnMs = methods.reduce(
    (max, method) => Math.max(max, method.selfMs),
    0,
  );
  return (
    <div className="ml-8 border-l py-2 pr-4 pl-4 [&_td]:h-8! [&_td]:py-1! [&_th]:h-8!">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Method</TableHead>
            <TableHead>Own time</TableHead>
            <TableHead className="text-right">Avg own / call</TableHead>
            <TableHead className="text-right">Total time</TableHead>
            <TableHead className="text-right">Calls</TableHead>
            <TableHead className="text-right">Errors</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {methods.map((method) => (
            <TableRow key={method.methodName}>
              <TableCell className="font-mono text-xs">
                {method.methodName}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-3">
                  <span className="w-16 font-mono text-[13px] font-semibold tabular-nums">
                    {formatDuration(method.selfMs)}
                  </span>
                  <TimeBar
                    ownMs={method.selfMs}
                    totalMs={method.selfMs}
                    maxMs={maxOwnMs}
                    className="w-36"
                  />
                </div>
              </TableCell>
              <NumCell className="text-muted-foreground">
                {formatDuration(
                  method.calls > 0 ? method.selfMs / method.calls : 0,
                )}
              </NumCell>
              <NumCell className="text-muted-foreground">
                {formatDuration(method.totalMs)}
              </NumCell>
              <NumCell className="text-muted-foreground">
                {formatCount(method.calls)}
              </NumCell>
              <NumCell>
                <Errors count={method.errorCount} />
              </NumCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
