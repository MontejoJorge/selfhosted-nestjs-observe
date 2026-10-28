import { cn } from '@/lib/utils';
import { TrendingDownIcon, TrendingUpIcon } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * The card used everywhere: <Panel><PanelHeader title="…">…</PanelHeader><PanelBody>…</PanelBody></Panel>.
 * PanelHeader children sit right after the title (badges, trend); `aside` sits on the right (legend).
 */
export function Panel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        'flex min-w-0 flex-col overflow-hidden rounded-2xl border bg-card shadow-[0_1px_0_0_rgb(255_255_255/0.03)_inset]',
        className,
      )}
    >
      {children}
    </section>
  );
}

export function PanelHeader({
  title,
  children,
  aside,
}: {
  title: ReactNode;
  children?: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <header className="flex min-h-[72px] flex-wrap items-center gap-x-3 gap-y-2 border-b bg-card-header px-6 py-4">
      <h2 className="text-[15px] font-semibold">{title}</h2>
      {children}
      {aside ? (
        <div className="ml-auto flex flex-wrap items-center gap-4">{aside}</div>
      ) : null}
    </header>
  );
}

export function PanelBody({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn('min-w-0 px-6 py-6', className)}>{children}</div>;
}

/** Grey count badge next to a panel title, e.g. "Requests [8772]". */
export function CountBadge({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center rounded-md bg-secondary px-2 font-mono text-xs font-semibold',
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Legend chip: a small vertical colored tick and a label (plus an optional value badge). */
export function LegendChip({
  color,
  label,
  value,
}: {
  color: string;
  label: ReactNode;
  value?: ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground">
      <span
        className="h-3 w-[3px] rounded-full"
        style={{ background: color }}
        aria-hidden
      />
      <span className="text-foreground/90">{label}</span>
      {value !== undefined ? <CountBadge>{value}</CountBadge> : null}
    </span>
  );
}

/** Small uppercase monospace caption under a chart. */
export function ChartCaption({ children }: { children: ReactNode }) {
  return (
    <p className="mt-4 font-mono text-[11px] tracking-wider text-muted-foreground uppercase">
      {children}
    </p>
  );
}

/** Start and end timestamps at the bottom corners of a chart panel. */
export function ChartRange({ from, to }: { from: string; to: string }) {
  return (
    <div className="mt-4 flex justify-between gap-4 text-[13px] text-muted-foreground">
      <span>{from}</span>
      <span>{to}</span>
    </div>
  );
}

/** The headline figure of a chart panel: "1.32 s AVG". */
export function BigNumber({
  value,
  unit,
  label,
}: {
  value: ReactNode;
  unit?: ReactNode;
  label?: ReactNode;
}) {
  return (
    <p className="flex items-baseline gap-1.5">
      <span className="text-[32px] leading-none font-medium tracking-tight tabular-nums">
        {value}
      </span>
      {unit ? (
        <span className="font-mono text-sm text-muted-foreground">{unit}</span>
      ) : null}
      {label ? (
        <span className="ml-1 font-mono text-[11px] tracking-wider text-muted-foreground uppercase">
          {label}
        </span>
      ) : null}
    </p>
  );
}

/** The line under a BigNumber: a mono detail and an optional trend. */
export function FigureDetail({ children }: { children: ReactNode }) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-sm text-muted-foreground">
      {children}
    </div>
  );
}

/**
 * Relative change vs the previous period. `goodWhen` says which direction is good
 * (more requests is neutral-good, more latency is bad); bad changes read in red.
 */
export function Trend({
  change,
  goodWhen = 'up',
  suffix,
}: {
  change: number | null;
  goodWhen?: 'up' | 'down';
  suffix?: string;
}) {
  if (change === null) return null;
  const percent = Math.round(change * 100);
  const up = percent >= 0;
  const good = percent === 0 || (goodWhen === 'up' ? up : !up);
  const Icon = up ? TrendingUpIcon : TrendingDownIcon;
  return (
    <span className="inline-flex items-center gap-1.5 font-sans text-sm text-muted-foreground">
      <Icon
        className={cn('size-3.5', good ? 'text-teal' : 'text-primary')}
        aria-hidden
      />
      <span>
        {up ? '+' : ''}
        {percent}%{suffix ? ` ${suffix}` : null}
      </span>
    </span>
  );
}
