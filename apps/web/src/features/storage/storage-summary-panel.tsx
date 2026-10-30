import { Panel, PanelBody, PanelHeader } from '@/components/panel';
import { ScopedLink } from '@/components/scoped-link';
import { Button } from '@/components/ui/button';
import { formatBytes, formatCount } from '@/lib/format';
import { paths } from '@/lib/paths';
import { useQuery } from '@tanstack/react-query';
import { ArrowRightIcon } from 'lucide-react';
import { projectStorageQueryOptions } from './queries';

/** The Settings card that sums up the project's storage and links to its page. */
export function StorageSummaryPanel({ project }: { project: string }) {
  // Non-suspending: Settings renders without waiting for the storage figures.
  const { data } = useQuery(projectStorageQueryOptions(project, undefined));
  return (
    <Panel>
      <PanelHeader title="Storage" />
      <PanelBody className="flex flex-wrap items-center justify-between gap-4">
        <div className="max-w-xl text-sm">
          <p className="font-medium">
            {data
              ? `${formatBytes(data.bytes)} in ${formatCount(data.rows)} rows (estimated size)`
              : 'Measuring…'}
          </p>
          <p className="text-muted-foreground">
            See the size per application, table and day, and delete data older
            than a number of days.
          </p>
        </div>
        <Button asChild variant="outline" size="lg">
          <ScopedLink to={paths.projectStorage(project)}>
            Open storage <ArrowRightIcon />
          </ScopedLink>
        </Button>
      </PanelBody>
    </Panel>
  );
}
