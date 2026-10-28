import { formatDuration } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Fragment } from 'react';

/** p95 at or above this reads as slow and gets the red outline. */
const SLOW_P95_MS = 1000;

/**
 * "AVG 327 ms —•— P95 1.02 s" in one pill. The marker on the track shows where
 * the average sits relative to p95.
 */
export function DurationPill({
  avg,
  p95,
  className,
}: {
  avg: number | null | undefined;
  p95: number | null | undefined;
  className?: string;
}) {
  const slow = (p95 ?? 0) >= SLOW_P95_MS;
  const ratio = avg && p95 ? Math.min(1, Math.max(0, avg / p95)) : 0;
  return (
    <span
      className={cn(
        'inline-flex h-7 items-center gap-2.5 rounded-md border px-3 font-mono text-[13px] whitespace-nowrap tabular-nums',
        slow ? 'border-primary/50 bg-primary/5' : 'border-border',
        className,
      )}
    >
      <span className="text-[10px] tracking-wider text-muted-foreground">
        AVG
      </span>
      <span className="font-medium">{formatDuration(avg)}</span>
      <span className="relative h-[3px] w-8 rounded-full bg-bar" aria-hidden>
        <span
          className="absolute inset-y-0 left-0 rounded-full bg-primary"
          style={{ width: `${Math.max(12, ratio * 100)}%` }}
        />
        <span
          className="absolute top-1/2 h-2.5 w-[2px] -translate-y-1/2 rounded-full bg-foreground"
          style={{ left: `${Math.max(12, ratio * 100)}%` }}
        />
      </span>
      <span className="text-[10px] tracking-wider text-muted-foreground">
        P95
      </span>
      <span className={cn('font-medium', slow && 'text-primary')}>
        {formatDuration(p95)}
      </span>
    </span>
  );
}

const TICKS = 10;

/** Ten thin ticks, the first `lit` of them colored. */
function Ticks({ lit, tone }: { lit: number; tone: 'error' | 'teal' }) {
  return (
    <span className="inline-flex h-3.5 items-stretch gap-[3px]" aria-hidden>
      {Array.from({ length: TICKS }, (_, i) => (
        <span
          key={i}
          className={cn(
            'w-[2px] rounded-full',
            i < lit ? (tone === 'error' ? 'bg-primary' : 'bg-teal') : 'bg-bar',
          )}
        />
      ))}
    </span>
  );
}

/** "9.58% ||||||||||" with one red tick per started 10%. */
export function FailureRate({ rate }: { rate: number }) {
  const percent = rate * 100;
  return (
    <span className="inline-flex items-center gap-2 font-mono text-[13px] tabular-nums">
      <span className="w-14">{percent.toFixed(2)}%</span>
      <Ticks lit={Math.min(TICKS, Math.ceil(percent / 10))} tone="error" />
    </span>
  );
}

/** A 0..100 percentage with a teal tick meter (CPU, memory). */
export function Meter({ percent }: { percent: number | null | undefined }) {
  if (percent === null || percent === undefined) {
    return <span className="font-mono text-muted-foreground">–</span>;
  }
  const clamped = Math.min(100, Math.max(0, percent));
  return (
    <span className="inline-flex items-center gap-2 font-mono text-[13px] tabular-nums">
      <span className="w-14">{percent.toFixed(2)}%</span>
      <Ticks lit={Math.round(clamped / 10)} tone="teal" />
    </span>
  );
}

/**
 * A route like `/dashboards/:id/widgets`: dim slashes, bold `:params`. A leading
 * HTTP method ("GET /orders") is dropped; anything else that isn't a path is
 * shown as-is.
 */
export function RoutePath({
  value,
  className,
}: {
  value: string;
  className?: string;
}) {
  // HTTP operation ids look like "GET /orders/:id": the method is shown apart.
  const path = value.replace(/^[A-Z]+\s+(?=\/)/, '');
  if (!path.startsWith('/')) {
    return (
      <span className={cn('truncate font-mono text-[13px]', className)}>
        {value}
      </span>
    );
  }
  const parts = path.split('/').slice(1);
  return (
    <span
      className={cn('truncate font-mono text-[13px]', className)}
      title={path}
    >
      {parts.map((part, i) => (
        <Fragment key={i}>
          <span className="text-muted-foreground">/</span>
          <span className={cn(part.startsWith(':') && 'font-semibold')}>
            {part}
          </span>
        </Fragment>
      ))}
    </span>
  );
}

/** Dotted-name like `reports.schedule`: dim dots. */
export function DottedName({ value }: { value: string }) {
  const parts = value.split('.');
  return (
    <span className="font-mono text-[13px]">
      {parts.map((part, i) => (
        <Fragment key={i}>
          {i > 0 ? <span className="text-muted-foreground">.</span> : null}
          {part}
        </Fragment>
      ))}
    </span>
  );
}

/** "167 ms" with the unit dimmed. */
export function Duration({ ms }: { ms: number | null | undefined }) {
  const [value, unit] = formatDuration(ms).split(' ');
  return (
    <span className="font-mono text-[13px] font-semibold tabular-nums">
      {value}
      {unit ? (
        <span className="ml-0.5 font-normal text-muted-foreground">{unit}</span>
      ) : null}
    </span>
  );
}
