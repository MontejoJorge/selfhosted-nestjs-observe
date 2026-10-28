import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

/** Two-column metadata list: <KeyValueList><KeyValue label="…">…</KeyValue></KeyValueList>. */
export function KeyValueList({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <dl
      className={cn(
        'grid grid-cols-[minmax(7rem,max-content)_1fr] gap-x-4 gap-y-1.5 text-sm',
        className,
      )}
    >
      {children}
    </dl>
  );
}

export function KeyValue({
  label,
  children,
}: {
  label: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-all">{children}</dd>
    </>
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
          <code className="text-xs">{renderValue(value)}</code>
        </KeyValue>
      ))}
    </KeyValueList>
  );
}
