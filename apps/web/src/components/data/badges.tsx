import type { LogLevel } from '@/lib/api/generated/api';
import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

const pill =
  'inline-flex h-6 shrink-0 items-center gap-1.5 rounded-md border px-2 font-mono text-xs font-semibold leading-none whitespace-nowrap';

const methodTone: Record<string, string> = {
  GET: 'text-teal',
  POST: 'text-foreground',
  PUT: 'text-chart-4',
  PATCH: 'text-chart-4',
  DELETE: 'text-primary',
};

/** HTTP method as colored monospace text (GET teal, POST bold, DELETE red…). */
export function MethodBadge({
  method,
  variant = 'text',
}: {
  method: string | null;
  /** `chip` adds a grey background, as in compact lists. */
  variant?: 'text' | 'chip';
}) {
  if (!method) return null;
  const upper = method.toUpperCase();
  return (
    <span
      className={cn(
        'shrink-0 font-mono text-xs font-bold',
        methodTone[upper] ?? 'text-muted-foreground',
        variant === 'chip' && 'rounded bg-secondary px-1.5 py-0.5',
      )}
    >
      {upper}
    </span>
  );
}

/** A dot + label pill. `tone` picks the colors; the label always carries the meaning. */
export function DotPill({
  tone,
  children,
  className,
}: {
  tone: 'neutral' | 'error' | 'ok' | 'warn';
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        pill,
        tone === 'error' && 'border-primary/50 bg-primary/10 text-primary',
        tone === 'ok' && 'border-teal/40 bg-teal/10 text-foreground',
        tone === 'warn' &&
          'border-status-warn/40 bg-status-warn/10 text-status-warn',
        tone === 'neutral' && 'border-border bg-secondary text-foreground',
        className,
      )}
    >
      <span
        className={cn(
          'size-1.5 rounded-full',
          tone === 'error' && 'bg-primary',
          tone === 'ok' && 'bg-teal',
          tone === 'warn' && 'bg-status-warn',
          tone === 'neutral' && 'bg-muted-foreground',
        )}
        aria-hidden
      />
      {children}
    </span>
  );
}

export function StatusCodeBadge({ code }: { code: number | null }) {
  if (code === null) return <span className="text-muted-foreground">–</span>;
  return <DotPill tone={code >= 400 ? 'error' : 'neutral'}>{code}</DotPill>;
}

export function JobStatusBadge({
  status,
}: {
  status: 'completed' | 'failed' | null;
}) {
  if (status === null) return <DotPill tone="neutral">unknown</DotPill>;
  return (
    <DotPill tone={status === 'failed' ? 'error' : 'neutral'}>{status}</DotPill>
  );
}

export function RequestOutcomeBadge({ hasError }: { hasError: boolean }) {
  return (
    <DotPill tone={hasError ? 'error' : 'neutral'}>
      {hasError ? 'error' : 'ok'}
    </DotPill>
  );
}

const levelTone: Record<LogLevel, string> = {
  fatal: 'bg-primary text-primary-foreground',
  error: 'bg-primary/15 text-primary',
  warn: 'bg-secondary text-foreground',
  log: 'bg-secondary text-foreground',
  debug: 'bg-secondary/60 text-muted-foreground',
  verbose: 'bg-secondary/60 text-muted-foreground',
};

export function LogLevelBadge({ level }: { level: LogLevel | null }) {
  return (
    <span
      className={cn(
        'inline-flex h-5 w-14 items-center justify-center rounded font-mono text-[9px] font-bold tracking-wider uppercase',
        level ? levelTone[level] : 'bg-secondary text-muted-foreground',
      )}
    >
      {level ?? '–'}
    </span>
  );
}

export function SourceBadge({ source }: { source: 'request' | 'job' }) {
  return (
    <span className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
      {source}
    </span>
  );
}

/** Grey rounded tag, as in the applications table. */
export function TagChip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-6 items-center rounded-md border bg-secondary px-2 text-xs font-medium">
      {children}
    </span>
  );
}
