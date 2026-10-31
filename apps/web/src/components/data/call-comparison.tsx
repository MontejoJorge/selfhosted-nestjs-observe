import { Panel, PanelBody, PanelHeader } from '@/components/panel';
import { formatCount, formatDuration } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * "Compared to other calls": where this execution's duration falls on a track
 * that runs from 0 to a bit past the p95 of the same operation in the range.
 */
export function CallComparison({
  durationMs,
  avg,
  p95,
  count,
  rangePhrase,
}: {
  durationMs: number;
  avg: number;
  p95: number;
  count: number;
  /** The time window inside a sentence (`windowPhrase`). */
  rangePhrase: string;
}) {
  const max = Math.max(p95 * 1.15, durationMs * 1.05, 1);
  const at = (ms: number) => `${Math.min(100, (ms / max) * 100)}%`;
  const verdict =
    durationMs <= avg
      ? { label: 'Faster than average', tone: 'ok' as const }
      : durationMs <= p95
        ? { label: 'Slower than average', tone: 'warn' as const }
        : { label: 'Slower than p95', tone: 'error' as const };
  const dot =
    verdict.tone === 'ok'
      ? 'bg-teal'
      : verdict.tone === 'warn'
        ? 'bg-status-warn'
        : 'bg-primary';

  return (
    <Panel>
      <PanelHeader
        title="Compared to other calls"
        aside={
          <span
            className={cn(
              'rounded-md border px-3 py-1.5 font-mono text-[10px] font-semibold tracking-wider uppercase',
              verdict.tone === 'ok' && 'border-teal/40 bg-teal/10 text-teal',
              verdict.tone === 'warn' &&
                'border-status-warn/40 bg-status-warn/10 text-status-warn',
              verdict.tone === 'error' &&
                'border-primary/40 bg-primary/10 text-primary',
            )}
          >
            {verdict.label}
          </span>
        }
      >
        <span className="font-mono text-xs text-muted-foreground">
          {formatCount(count)} calls · {rangePhrase}
        </span>
      </PanelHeader>
      <PanelBody>
        <div className="relative mx-2 pt-12 pb-12">
          {[
            { label: 'AVG', ms: avg },
            { label: 'P95', ms: p95 },
          ].map((mark) => (
            <div
              key={mark.label}
              className="absolute top-0 flex -translate-x-1/2 flex-col items-center gap-1.5 font-mono"
              style={{ left: at(mark.ms) }}
            >
              <span className="text-[9px] tracking-wider text-muted-foreground">
                {mark.label}
              </span>
              <span className="text-xs whitespace-nowrap">
                {formatDuration(mark.ms)}
              </span>
            </div>
          ))}
          <div className="relative h-1 rounded-full bg-linear-to-r from-teal/40 via-bar to-primary/60">
            {[avg, p95].map((ms, i) => (
              <span
                key={i}
                className="absolute top-1/2 h-3 w-px -translate-y-1/2 bg-foreground/50"
                style={{ left: at(ms) }}
              />
            ))}
            <span
              className={cn(
                'absolute top-1/2 size-3 -translate-1/2 rounded-full ring-4 ring-card',
                dot,
              )}
              style={{ left: at(durationMs) }}
            />
          </div>
          <div
            className="absolute bottom-0 flex -translate-x-1/2 flex-col items-center gap-1 font-mono"
            style={{ left: at(durationMs) }}
          >
            <span className="text-sm font-semibold whitespace-nowrap">
              {formatDuration(durationMs)}
            </span>
            <span className="text-[9px] tracking-wider text-muted-foreground">
              THIS CALL
            </span>
          </div>
        </div>
      </PanelBody>
    </Panel>
  );
}
