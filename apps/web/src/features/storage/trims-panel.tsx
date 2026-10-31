import { DotPill } from '@/components/data/badges';
import { CountBadge, Panel, PanelBody, PanelHeader } from '@/components/panel';
import { InlineSpinner } from '@/components/states';
import type { StorageTrimDto } from '@/lib/api/generated/api';
import { formatLongDay, formatRelative } from '@/lib/format';
import { useSuspenseQuery } from '@tanstack/react-query';
import { storageTrimsQueryOptions } from './queries';
import { useFinishedTrims } from './use-finished-trims';

function TrimProgress({ trim }: { trim: StorageTrimDto }) {
  const total = trim.totalSteps;
  const percent =
    total && total > 0 ? Math.min(100, (trim.doneSteps / total) * 100) : 0;
  return (
    <div className="flex min-w-40 flex-1 items-center gap-3">
      <div
        role="progressbar"
        aria-label="Trim progress"
        aria-valuemin={0}
        aria-valuemax={total ?? undefined}
        aria-valuenow={total === null ? undefined : trim.doneSteps}
        className="h-1.5 flex-1 overflow-hidden rounded-full bg-bar"
      >
        <div
          className="h-full rounded-full bg-teal transition-[width]"
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="w-20 text-right font-mono text-xs text-muted-foreground tabular-nums">
        {total === null ? 'waiting' : `${trim.doneSteps} / ${total}`}
      </span>
    </div>
  );
}

/**
 * Pending and running trims of the project with their progress. Polls while
 * there is one and refreshes the storage figures when one finishes.
 */
export function TrimsPanel({
  project,
  applicationNames,
}: {
  project: string;
  applicationNames: ReadonlyMap<string, string>;
}) {
  const { data: trims } = useSuspenseQuery(storageTrimsQueryOptions(project));
  useFinishedTrims(trims);
  if (trims.length === 0) return null;

  return (
    <Panel className="border-status-warn/40">
      <PanelHeader title="Deleting old data" aside={<InlineSpinner />}>
        <CountBadge>{trims.length}</CountBadge>
      </PanelHeader>
      <PanelBody className="flex flex-col gap-4 py-4">
        {trims.map((trim) => (
          <div
            key={trim.id}
            className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm"
          >
            <DotPill tone={trim.status === 'running' ? 'warn' : 'neutral'}>
              {trim.status === 'running' ? 'Running' : 'Queued'}
            </DotPill>
            <div className="min-w-0">
              <p className="font-medium">
                {trim.applicationId
                  ? (applicationNames.get(trim.applicationId) ??
                    'Deleted application')
                  : 'Whole project'}
              </p>
              <p className="font-mono text-xs text-muted-foreground">
                before {formatLongDay(trim.cutoffDay)} · asked{' '}
                {formatRelative(trim.requestedAt)}
              </p>
            </div>
            <TrimProgress trim={trim} />
          </div>
        ))}
        <p className="text-xs text-muted-foreground">
          Steps are tables and day partitions. Space freed by a trim is reused
          by new telemetry first; the files on disk shrink only partly until the
          days age out of retention.
        </p>
      </PanelBody>
    </Panel>
  );
}
