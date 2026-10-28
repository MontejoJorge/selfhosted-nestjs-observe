import { TableCell, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

/**
 * Wraps a shadcn <Table> in the dashboard's card: UPPERCASE monospace headers on
 * a slightly lighter band, tall rows with hairline separators.
 */
export function TableFrame({
  children,
  footer,
  className,
}: {
  children: ReactNode;
  /** Pagination or "load more" row rendered inside the card. */
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'min-w-0 overflow-hidden rounded-2xl border bg-card',
        '[&_thead_tr]:bg-card-header [&_thead_tr]:hover:bg-card-header',
        '[&_th]:h-14 [&_th]:px-4 [&_th]:font-mono [&_th]:text-[11px] [&_th]:font-medium [&_th]:tracking-[0.08em] [&_th]:text-muted-foreground [&_th]:uppercase',
        '[&_td]:h-14 [&_td]:px-4 [&_td]:py-2',
        '[&_tbody_tr]:hover:bg-foreground/[0.025]',
        className,
      )}
    >
      {children}
      {footer ? (
        <div className="flex items-center justify-between gap-3 border-t px-4 py-3">
          {footer}
        </div>
      ) : null}
    </div>
  );
}

/**
 * A table row whose whole surface is clickable. Put a <Link className={stretchedLink}>
 * in one of its cells: the link's ::after covers the row, so it stays a real,
 * keyboard-focusable link.
 */
export function LinkRow({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <TableRow
      className={cn(
        'relative cursor-pointer [transform:translateZ(0)]',
        className,
      )}
    >
      {children}
    </TableRow>
  );
}

export const stretchedLink =
  'outline-none after:absolute after:inset-0 after:content-[""] focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-inset';

/** Numeric cell: right-aligned, monospace, tabular figures. */
export function NumCell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <TableCell
      className={cn('text-right font-mono text-[13px] tabular-nums', className)}
    >
      {children}
    </TableCell>
  );
}

/** Full-width message row inside a table body (e.g. "no match"). */
export function MessageRow({
  colSpan,
  children,
}: {
  colSpan: number;
  children: ReactNode;
}) {
  return (
    <TableRow>
      <TableCell
        colSpan={colSpan}
        className="py-10 text-center text-sm text-muted-foreground"
      >
        {children}
      </TableCell>
    </TableRow>
  );
}
