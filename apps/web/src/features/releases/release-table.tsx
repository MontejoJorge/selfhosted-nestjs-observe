import { NumCell, TableFrame } from '@/components/data/data-table';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { ReleaseSummaryDto } from '@/lib/api/generated/api';
import { formatDateTime, formatRelative } from '@/lib/format';
import type { ReactNode } from 'react';
import { releaseKey, shortVersion } from './release-math';

/** Brings the highlighted row into view when it mounts. */
function scrollIntoView(row: HTMLTableRowElement | null) {
  row?.scrollIntoView({ block: 'center' });
}

function Version({ value }: { value: string }) {
  return (
    <span className="font-mono text-[13px] font-semibold" title={value}>
      {shortVersion(value)}
    </span>
  );
}

/** Releases newest first: when each version appeared and where it runs. */
export function ReleaseTable({
  releases,
  showApplication,
  highlight,
  footer,
}: {
  releases: readonly ReleaseSummaryDto[];
  showApplication: boolean;
  /** A version to mark (and scroll to). */
  highlight: string | undefined;
  footer: ReactNode;
}) {
  return (
    <TableFrame footer={footer}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Version</TableHead>
            {showApplication ? <TableHead>Application</TableHead> : null}
            <TableHead>Released</TableHead>
            <TableHead>Last seen</TableHead>
            <TableHead className="text-right">Instances</TableHead>
            <TableHead>Previous version</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {releases.map((release) => {
            const marked = release.version === highlight;
            return (
              <TableRow
                key={releaseKey(release)}
                ref={marked ? scrollIntoView : undefined}
                data-state={marked ? 'selected' : undefined}
                className="data-[state=selected]:bg-primary/[0.06] data-[state=selected]:shadow-[inset_3px_0_0_var(--primary)]"
              >
                <TableCell>
                  <Version value={release.version} />
                </TableCell>
                {showApplication ? (
                  <TableCell className="text-sm">
                    {release.applicationName}
                  </TableCell>
                ) : null}
                <TableCell>
                  <div className="flex flex-col gap-0.5 whitespace-nowrap">
                    <span className="font-mono text-[13px]">
                      {formatDateTime(release.firstSeenAt)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatRelative(release.firstSeenAt)}
                    </span>
                  </div>
                </TableCell>
                <TableCell
                  className="text-sm whitespace-nowrap text-muted-foreground"
                  title={formatDateTime(release.lastSeenAt)}
                >
                  {formatRelative(release.lastSeenAt)}
                </TableCell>
                <NumCell className="whitespace-nowrap">
                  <span
                    className={
                      release.activeInstances > 0
                        ? 'text-teal'
                        : 'text-muted-foreground'
                    }
                  >
                    {release.activeInstances}
                  </span>
                  <span className="text-muted-foreground">
                    {' '}
                    of {release.instanceCount} running
                  </span>
                </NumCell>
                <TableCell>
                  {release.previousVersion ? (
                    <span className="text-muted-foreground">
                      <Version value={release.previousVersion} />
                    </span>
                  ) : (
                    <span className="text-sm text-muted-foreground">
                      first seen
                    </span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableFrame>
  );
}
