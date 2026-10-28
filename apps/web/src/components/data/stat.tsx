import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

/** A dense row of KPI tiles: <StatGrid><Stat label="…" value="…" /></StatGrid>. */
export function StatGrid({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-3 lg:grid-cols-5',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Stat({
  label,
  value,
  detail,
  tone = 'default',
}: {
  label: ReactNode;
  value: ReactNode;
  detail?: ReactNode;
  tone?: 'default' | 'critical';
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1 bg-card px-4 py-3">
      <div className="truncate text-xs text-muted-foreground">{label}</div>
      <div
        className={cn(
          'truncate text-xl font-semibold tracking-tight',
          tone === 'critical' && 'text-status-error',
        )}
      >
        {value}
      </div>
      {detail ? (
        <div className="truncate text-xs text-muted-foreground">{detail}</div>
      ) : null}
    </div>
  );
}
