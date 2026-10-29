import { CountBadge, Panel, PanelBody, PanelHeader } from '@/components/panel';
import { formatDuration, formatRate } from '@/lib/format';
import { categoryColor, categoryLabel, type OriginShare } from './origin';

/** Share of self time per kind (controller, provider, outgoing HTTP...): one 100% stacked bar and its legend. */
export function OriginSummary({
  shares,
  totalSelfMs,
}: {
  shares: readonly OriginShare[];
  totalSelfMs: number;
}) {
  return (
    <Panel>
      <PanelHeader title="By kind">
        <CountBadge>{formatDuration(totalSelfMs)}</CountBadge>
        <span className="font-mono text-sm text-muted-foreground">
          self time in total
        </span>
      </PanelHeader>
      <PanelBody>
        <div
          className="flex h-3 w-full gap-[2px] overflow-hidden rounded-full"
          role="img"
          aria-label={shares
            .map((s) => `${categoryLabel(s.category)} ${formatRate(s.share)}`)
            .join(', ')}
        >
          {shares.map((s) => (
            <span
              key={s.category}
              className="h-full first:rounded-l-full last:rounded-r-full"
              style={{
                width: `${s.share * 100}%`,
                background: categoryColor(s.category),
              }}
              title={`${categoryLabel(s.category)}: ${formatRate(s.share)}`}
            />
          ))}
        </div>
        <ul className="mt-5 grid gap-x-8 gap-y-2 sm:grid-cols-2 xl:grid-cols-4">
          {shares.map((s) => (
            <li
              key={s.category}
              className="flex min-w-0 items-center gap-2 text-[13px]"
            >
              <span
                className="h-3 w-[3px] shrink-0 rounded-full"
                style={{ background: categoryColor(s.category) }}
                aria-hidden
              />
              <span className="truncate">{categoryLabel(s.category)}</span>
              <span className="ml-auto font-mono font-semibold tabular-nums">
                {formatRate(s.share)}
              </span>
              <span className="w-20 text-right font-mono text-muted-foreground tabular-nums">
                {formatDuration(s.selfMs)}
              </span>
            </li>
          ))}
        </ul>
      </PanelBody>
    </Panel>
  );
}
