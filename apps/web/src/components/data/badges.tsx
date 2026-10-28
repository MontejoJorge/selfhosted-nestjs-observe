import { cn } from '@/lib/utils';
import type { LogLevel } from '@selfhosted-observe/contracts';
import { CheckCircle2Icon, XCircleIcon } from 'lucide-react';

const pill =
  'inline-flex h-5 shrink-0 items-center gap-1 rounded px-1.5 font-mono text-[11px] font-medium leading-none whitespace-nowrap';

export function MethodBadge({ method }: { method: string | null }) {
  if (!method) return null;
  return (
    <span className={cn(pill, 'bg-muted text-foreground')}>
      {method.toUpperCase()}
    </span>
  );
}

export function StatusCodeBadge({ code }: { code: number | null }) {
  if (code === null) return <span className="text-muted-foreground">–</span>;
  const tone =
    code >= 500
      ? 'bg-status-error/15 text-status-error'
      : code >= 400
        ? 'bg-status-warn/15 text-status-warn'
        : 'bg-status-ok/15 text-status-ok';
  return <span className={cn(pill, tone)}>{code}</span>;
}

/** Outcome of an execution: always icon + label, so color is never the only signal. */
export function OutcomeBadge({
  failed,
  label,
}: {
  failed: boolean;
  label: string;
}) {
  return (
    <span
      className={cn(
        pill,
        failed
          ? 'bg-status-error/15 text-status-error'
          : 'bg-status-ok/15 text-status-ok',
      )}
    >
      {failed ? (
        <XCircleIcon className="size-3" aria-hidden />
      ) : (
        <CheckCircle2Icon className="size-3" aria-hidden />
      )}
      {label}
    </span>
  );
}

export function RequestOutcomeBadge({ hasError }: { hasError: boolean }) {
  return <OutcomeBadge failed={hasError} label={hasError ? 'error' : 'ok'} />;
}

export function JobStatusBadge({
  status,
}: {
  status: 'completed' | 'failed' | null;
}) {
  if (status === null) {
    return (
      <span className={cn(pill, 'bg-muted text-muted-foreground')}>
        unknown
      </span>
    );
  }
  return <OutcomeBadge failed={status === 'failed'} label={status} />;
}

const levelTone: Record<LogLevel, string> = {
  fatal: 'bg-status-error text-white',
  error: 'bg-status-error/15 text-status-error',
  warn: 'bg-status-warn/15 text-status-warn',
  log: 'bg-primary/10 text-primary',
  debug: 'bg-muted text-muted-foreground',
  verbose: 'bg-muted text-muted-foreground',
};

export function LogLevelBadge({ level }: { level: LogLevel | null }) {
  return (
    <span
      className={cn(
        pill,
        'w-14 justify-center uppercase',
        level ? levelTone[level] : 'bg-muted text-muted-foreground',
      )}
    >
      {level ?? '–'}
    </span>
  );
}

export function SourceBadge({ source }: { source: 'request' | 'job' }) {
  return (
    <span className={cn(pill, 'bg-muted text-muted-foreground')}>{source}</span>
  );
}
