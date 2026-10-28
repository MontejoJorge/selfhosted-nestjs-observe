import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

/**
 * Detail list where each row reads "Label ......... value", the gap filled with
 * a dotted leader: <KeyValueList><KeyValue label="…">…</KeyValue></KeyValueList>.
 */
export function KeyValueList({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <dl className={cn('flex min-w-0 flex-col gap-1 text-sm', className)}>
      {children}
    </dl>
  );
}

export function KeyValue({
  label,
  children,
  tone = 'default',
}: {
  label: ReactNode;
  children: ReactNode;
  tone?: 'default' | 'error';
}) {
  return (
    <div className="flex min-h-10 min-w-0 items-center gap-3">
      <dt
        className={cn(
          'shrink-0',
          tone === 'error' ? 'text-primary' : 'text-muted-foreground',
        )}
      >
        {label}
      </dt>
      <span
        aria-hidden
        className={cn(
          'min-w-6 flex-1 self-center border-b border-dotted',
          tone === 'error' ? 'border-primary/50' : 'border-foreground/20',
        )}
      />
      <dd
        className={cn(
          'flex min-w-0 items-center justify-end gap-2 text-right font-mono text-[13px] font-medium break-all',
          tone === 'error' && 'text-primary',
        )}
      >
        {children}
      </dd>
    </div>
  );
}

function renderValue(value: unknown): string {
  if (value === null || value === undefined) return '–';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/** Renders an arbitrary tag/attribute record, sorted by key. */
export function RecordList({
  record,
  className,
}: {
  record: Record<string, unknown>;
  className?: string;
}) {
  const entries = Object.entries(record).toSorted(([a], [b]) =>
    a.localeCompare(b),
  );
  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">None.</p>;
  }
  return (
    <KeyValueList className={className}>
      {entries.map(([key, value]) => (
        <KeyValue key={key} label={<code className="text-xs">{key}</code>}>
          {renderValue(value)}
        </KeyValue>
      ))}
    </KeyValueList>
  );
}
