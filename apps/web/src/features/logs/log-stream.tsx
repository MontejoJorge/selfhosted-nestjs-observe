import { LogLevelBadge } from '@/components/data/badges';
import { RecordList } from '@/components/data/key-value';
import { ScopedLink } from '@/components/scoped-link';
import { formatPreciseTime, shortId } from '@/lib/format';
import { paths } from '@/lib/paths';
import { cn } from '@/lib/utils';
import type { LogItem } from '@selfhosted-observe/contracts';
import { ChevronDownIcon, ChevronRightIcon } from 'lucide-react';
import { memo, useState } from 'react';

/** A dense, monospace list of log lines. Lines with attributes expand on click. */
export function LogStream({
  logs,
  showTraceLinks = true,
}: {
  logs: readonly LogItem[];
  showTraceLinks?: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-lg border font-mono text-xs">
      {logs.map((log) => (
        <LogLine key={log.id} log={log} showTraceLink={showTraceLinks} />
      ))}
    </div>
  );
}

const LogLine = memo(function LogLine({
  log,
  showTraceLink,
}: {
  log: LogItem;
  showTraceLink: boolean;
}) {
  const [open, setOpen] = useState(false);
  const hasAttributes =
    log.attributes !== null && Object.keys(log.attributes).length > 0;

  return (
    <div className="border-b last:border-b-0 [content-visibility:auto] [contain-intrinsic-size:auto_28px]">
      <div
        className={cn(
          'flex items-start gap-2 px-2 py-1 hover:bg-muted/40',
          (log.level === 'error' || log.level === 'fatal') &&
            'bg-status-error/5',
        )}
      >
        <button
          type="button"
          className={cn(
            'mt-0.5 rounded text-muted-foreground hover:text-foreground',
            !hasAttributes && 'invisible',
          )}
          aria-label={open ? 'Hide attributes' : 'Show attributes'}
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? (
            <ChevronDownIcon className="size-3.5" />
          ) : (
            <ChevronRightIcon className="size-3.5" />
          )}
        </button>
        <time
          className="shrink-0 pt-0.5 text-muted-foreground tabular-nums"
          dateTime={log.timestamp}
          title={log.timestamp}
        >
          {formatPreciseTime(log.timestamp)}
        </time>
        <LogLevelBadge level={log.level} />
        <span
          className="w-32 shrink-0 truncate pt-0.5 text-muted-foreground"
          title={log.context ?? undefined}
        >
          {log.context ?? ''}
        </span>
        <span className="min-w-0 flex-1 pt-0.5 break-words whitespace-pre-wrap">
          {log.text}
        </span>
        {showTraceLink && log.traceId ? (
          <ScopedLink
            to={paths.trace(log.traceId)}
            className="shrink-0 pt-0.5 text-primary hover:underline"
            title={`Trace ${log.traceId}`}
          >
            {shortId(log.traceId)}
          </ScopedLink>
        ) : null}
      </div>
      {open && log.attributes ? (
        <div className="border-t bg-muted/30 px-8 py-2 font-sans">
          <RecordList record={log.attributes} />
        </div>
      ) : null}
    </div>
  );
});
