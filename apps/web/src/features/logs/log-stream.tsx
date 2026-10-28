import { LogLevelBadge } from '@/components/data/badges';
import { RecordList } from '@/components/data/key-value';
import { ScopedLink } from '@/components/scoped-link';
import type { LogItemDto } from '@/lib/api/generated/api';
import { formatPreciseTime, shortId } from '@/lib/format';
import { paths } from '@/lib/paths';
import { useProjectRef } from '@/lib/scope-hooks';
import { cn } from '@/lib/utils';
import { ChevronRightIcon } from 'lucide-react';
import { memo, useState, type ReactNode } from 'react';

const ROW =
  'grid grid-cols-[20px_96px_64px_minmax(0,180px)_minmax(0,1fr)_auto] items-start gap-x-3 px-4';

/**
 * Logs as a dense monospace table (TIME, LEVEL, CONTEXT, MESSAGE). Errors and
 * warnings are tinted; lines with attributes expand on click.
 */
export function LogStream({
  logs,
  showTraceLinks = true,
  footer,
}: {
  logs: readonly LogItemDto[];
  showTraceLinks?: boolean;
  footer?: ReactNode;
}) {
  return (
    <div className="min-w-0 overflow-hidden rounded-2xl border bg-card font-mono text-[13px]">
      <div className="overflow-x-auto">
        <div className="min-w-[48rem]">
          <div
            className={cn(
              ROW,
              'h-12 items-center border-b bg-card-header text-[11px] tracking-[0.08em] text-muted-foreground uppercase',
            )}
          >
            <span />
            <span>Time</span>
            <span>Level</span>
            <span>Context</span>
            <span>Message</span>
            <span />
          </div>
          {logs.map((log) => (
            <LogLine key={log.id} log={log} showTraceLink={showTraceLinks} />
          ))}
        </div>
      </div>
      {footer ? (
        <div className="flex items-center justify-between gap-3 border-t px-4 py-3 font-sans">
          {footer}
        </div>
      ) : null}
    </div>
  );
}

const LogLine = memo(function LogLine({
  log,
  showTraceLink,
}: {
  log: LogItemDto;
  showTraceLink: boolean;
}) {
  const project = useProjectRef();
  const [open, setOpen] = useState(false);
  const hasAttributes =
    log.attributes !== null && Object.keys(log.attributes).length > 0;
  const failed = log.level === 'error' || log.level === 'fatal';

  return (
    <div className="border-b last:border-b-0 [content-visibility:auto] [contain-intrinsic-size:auto_37px]">
      <div
        className={cn(
          ROW,
          'py-2 hover:bg-foreground/[0.025]',
          failed && 'bg-primary/[0.06]',
          log.level === 'warn' && 'bg-primary/[0.03]',
        )}
      >
        <button
          type="button"
          className={cn(
            'mt-0.5 text-muted-foreground hover:text-foreground',
            !hasAttributes && 'invisible',
          )}
          aria-label={open ? 'Hide attributes' : 'Show attributes'}
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <ChevronRightIcon
            className={cn('size-3.5 transition-transform', open && 'rotate-90')}
          />
        </button>
        <time
          className="text-muted-foreground tabular-nums"
          dateTime={log.timestamp}
          title={log.timestamp}
        >
          {formatPreciseTime(log.timestamp)}
        </time>
        <LogLevelBadge level={log.level} />
        <span
          className="truncate text-foreground/80"
          title={log.context ?? undefined}
        >
          {log.context ?? ''}
        </span>
        <span
          className={cn(
            'min-w-0 break-words whitespace-pre-wrap',
            failed && 'text-primary',
          )}
        >
          {log.text}
        </span>
        {showTraceLink && log.traceId ? (
          <ScopedLink
            to={paths.trace(project, log.traceId)}
            className="text-xs text-muted-foreground hover:text-primary hover:underline"
            title={`Trace ${log.traceId}`}
          >
            {shortId(log.traceId)}
          </ScopedLink>
        ) : (
          <span />
        )}
      </div>
      {open && log.attributes ? (
        <div className="border-t bg-background/40 px-12 py-3 font-sans">
          <RecordList record={log.attributes} />
        </div>
      ) : null}
    </div>
  );
});
