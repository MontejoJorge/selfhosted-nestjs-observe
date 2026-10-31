import { BigNumber, Panel } from '@/components/panel';
import type { ReactNode } from 'react';

/** A row of headline figures: <StorageStats><StorageStat … /></StorageStats>. */
export function StorageStats({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-w-0 grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
      {children}
    </div>
  );
}

/** A label, a big figure (value + unit, e.g. from `splitValue`) and a hint line. */
export function StorageStat({
  label,
  value,
  unit,
  hint,
}: {
  label: ReactNode;
  value: ReactNode;
  unit?: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <Panel className="gap-3 px-4 py-4 sm:px-5 sm:py-5">
      <p className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase">
        {label}
      </p>
      <BigNumber value={value} unit={unit} />
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </Panel>
  );
}
