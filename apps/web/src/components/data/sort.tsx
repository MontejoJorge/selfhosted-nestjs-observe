import { TableHead } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { ArrowDownIcon, ArrowUpIcon, ChevronsUpDownIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import type { SortState } from './use-sorted-rows';

export function SortableHead<K extends string>({
  sortKey,
  sort,
  onToggle,
  children,
  className,
}: {
  sortKey: K;
  sort: SortState<K>;
  onToggle: (key: K) => void;
  children: ReactNode;
  className?: string;
}) {
  const active = sort.key === sortKey;
  const Icon = !active
    ? ChevronsUpDownIcon
    : sort.direction === 'asc'
      ? ArrowUpIcon
      : ArrowDownIcon;
  return (
    <TableHead
      className={className}
      aria-sort={
        active
          ? sort.direction === 'asc'
            ? 'ascending'
            : 'descending'
          : 'none'
      }
    >
      <button
        type="button"
        onClick={() => onToggle(sortKey)}
        className={cn(
          'inline-flex items-center gap-1 hover:text-foreground',
          active ? 'text-foreground' : 'text-muted-foreground',
        )}
      >
        {children}
        <Icon className="size-3" aria-hidden />
      </button>
    </TableHead>
  );
}
