import { TableCell, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

/** Wraps a shadcn <Table> in a bordered, dense container. */
export function TableFrame({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-lg border [&_td]:py-1.5 [&_th]:h-8 [&_th]:text-xs',
        className,
      )}
    >
      {children}
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

/** Numeric cell: right-aligned, tabular figures. */
export function NumCell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <TableCell
      className={cn('text-right font-mono text-xs tabular-nums', className)}
    >
      {children}
    </TableCell>
  );
}
