import {
  LinkRow,
  MessageRow,
  NumCell,
  stretchedLink,
  TableFrame,
} from '@/components/data/data-table';
import { FilterBar, OptionFilter } from '@/components/data/filters';
import { Meter } from '@/components/data/metric-cells';
import { RefreshButton } from '@/components/layout/scope-controls';
import { Page, PageActions, PageHeader, PageSection } from '@/components/page';
import {
  ChartCaption,
  CountBadge,
  Panel,
  PanelBody,
  PanelHeader,
} from '@/components/panel';
import { ScopedLink } from '@/components/scoped-link';
import { EmptyState } from '@/components/states';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ProjectTitle } from '@/features/projects/project-title';
import type { ProjectStorageDto } from '@/lib/api/generated/api';
import {
  formatBytes,
  formatCount,
  formatDay,
  formatLongDay,
} from '@/lib/format';
import { paths } from '@/lib/paths';
import { useProjectRef, useTypedSearch } from '@/lib/scope-hooks';
import { cn } from '@/lib/utils';
import { useSuspenseQuery } from '@tanstack/react-query';
import { ChevronRightIcon } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router';
import { projectStorageQueryOptions } from './queries';
import { projectStorageSearch } from './search';
import { splitValue, tableLabel, toSegments, utcToday } from './storage-math';
import { StorageStat, StorageStats } from './storage-stats';
import { TrimDialog } from './trim-dialog';
import { TrimsPanel } from './trims-panel';
import { StackedBar, UsageLegend, UsageList, UsageRow } from './usage-bars';

const ESTIMATE_HINT =
  'Sizes are estimates: each day partition is split between applications by the bytes counted at ingest. Rows are exact.';

function DailyPanel({ storage }: { storage: ProjectStorageDto }) {
  const today = utcToday();
  const max = Math.max(0, ...storage.days.map((day) => day.bytes));
  return (
    <Panel>
      <PanelHeader title="Size per day" aside={<UsageLegend />} />
      <PanelBody className="px-4">
        {storage.days.length === 0 ? (
          <EmptyState title="No telemetry stored" />
        ) : (
          <UsageList>
            {storage.days.map((day) => (
              <UsageRow
                key={day.day}
                label={day.day === today ? 'Today' : formatDay(day.day)}
                title={`${formatLongDay(day.day)} (UTC)`}
                parts={day.tables}
                max={max}
                note={`${formatCount(day.rows)} rows`}
              />
            ))}
          </UsageList>
        )}
        <ChartCaption>
          Oldest first, UTC days with stored rows. Kept {storage.retentionDays}{' '}
          days.
        </ChartCaption>
      </PanelBody>
    </Panel>
  );
}

function TablesPanel({ storage }: { storage: ProjectStorageDto }) {
  return (
    <PageSection title="By table">
      <TableFrame>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Table</TableHead>
              <TableHead className="text-right">Rows</TableHead>
              <TableHead className="text-right">Size (est.)</TableHead>
              <TableHead className="hidden sm:table-cell">Share</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {storage.tables.length === 0 ? (
              <MessageRow colSpan={4}>No telemetry stored.</MessageRow>
            ) : (
              storage.tables.map((table) => (
                <TableRow key={table.table}>
                  <TableCell className="font-medium">
                    {tableLabel(table.table)}
                  </TableCell>
                  <NumCell>{formatCount(table.rows)}</NumCell>
                  <NumCell>{formatBytes(table.bytes)}</NumCell>
                  <TableCell className="hidden sm:table-cell">
                    <Meter
                      percent={
                        storage.bytes > 0
                          ? (table.bytes / storage.bytes) * 100
                          : 0
                      }
                    />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableFrame>
    </PageSection>
  );
}

function ApplicationsSection({
  project,
  storage,
  selected,
}: {
  project: string;
  storage: ProjectStorageDto;
  selected: string | undefined;
}) {
  const total = storage.applications.reduce((sum, app) => sum + app.bytes, 0);
  const max = Math.max(0, ...storage.applications.map((app) => app.bytes));
  return (
    <PageSection
      title={
        <span className="flex items-center gap-2">
          Applications <CountBadge>{storage.applications.length}</CountBadge>
        </span>
      }
      actions={
        <div className="hidden md:block">
          <UsageLegend />
        </div>
      }
    >
      <TableFrame>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Application</TableHead>
              <TableHead className="hidden w-[40%] md:table-cell">
                By table
              </TableHead>
              <TableHead className="text-right">Rows</TableHead>
              <TableHead className="text-right">Size (est.)</TableHead>
              <TableHead className="hidden sm:table-cell">Share</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {storage.applications.length === 0 ? (
              <MessageRow colSpan={5}>
                This project has no application.
              </MessageRow>
            ) : (
              storage.applications.map((app) => (
                <LinkRow
                  key={app.applicationId}
                  className={cn(
                    app.applicationId === selected && 'bg-foreground/[0.04]',
                  )}
                >
                  <TableCell className="font-medium">
                    <ScopedLink
                      to={paths.projectStorage(project)}
                      search={{ application: app.applicationId }}
                      className={stretchedLink}
                      aria-current={
                        app.applicationId === selected ? 'true' : undefined
                      }
                    >
                      {app.name}
                    </ScopedLink>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <StackedBar segments={toSegments(app.tables)} max={max} />
                  </TableCell>
                  <NumCell>{formatCount(app.rows)}</NumCell>
                  <NumCell>{formatBytes(app.bytes)}</NumCell>
                  <TableCell className="hidden sm:table-cell">
                    <Meter
                      percent={total > 0 ? (app.bytes / total) * 100 : 0}
                    />
                  </TableCell>
                </LinkRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableFrame>
    </PageSection>
  );
}

export function ProjectStoragePage() {
  const project = useProjectRef();
  const [{ application }, setSearch] = useTypedSearch(projectStorageSearch);
  const { data: storage } = useSuspenseQuery(
    projectStorageQueryOptions(project, application),
  );
  const applicationNames = useMemo(
    () =>
      new Map(storage.applications.map((app) => [app.applicationId, app.name])),
    [storage.applications],
  );
  const applicationOptions = useMemo(
    () =>
      storage.applications.map((app) => ({
        value: app.applicationId,
        label: app.name,
      })),
    [storage.applications],
  );
  const [size, unit] = splitValue(formatBytes(storage.bytes));
  const oldest = storage.days[0]?.day;

  return (
    <Page>
      <PageHeader>
        <ProjectTitle
          eyebrow={
            <span className="flex items-center gap-1">
              <Link
                to={paths.settings(project)}
                className="text-primary hover:underline"
              >
                Settings
              </Link>
              <ChevronRightIcon className="size-3" aria-hidden />
              Storage
            </span>
          }
          subtitle="The raw telemetry this project keeps, and a way to delete old days early."
        >
          Storage
        </ProjectTitle>
        <PageActions>
          <RefreshButton />
          <TrimDialog
            project={project}
            applications={storage.applications}
            defaultApplication={application}
            retentionDays={storage.retentionDays}
          />
        </PageActions>
      </PageHeader>

      <FilterBar>
        <OptionFilter
          label="Application"
          value={application}
          options={applicationOptions}
          onChange={(value) => setSearch({ application: value })}
        />
      </FilterBar>

      <TrimsPanel project={project} applicationNames={applicationNames} />

      <StorageStats>
        <StorageStat
          label="Stored"
          value={size}
          unit={unit}
          hint="Estimated size on disk, indexes included."
        />
        <StorageStat
          label="Rows"
          value={formatCount(storage.rows)}
          hint="Requests, jobs, logs, errors, metrics and profiles."
        />
        <StorageStat
          label="Days stored"
          value={storage.days.length}
          hint={oldest ? `Oldest: ${formatLongDay(oldest)}` : 'Nothing yet.'}
        />
        <StorageStat
          label="Retention"
          value={storage.retentionDays}
          unit="days"
          hint="Older days are dropped for every project."
        />
      </StorageStats>

      <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <DailyPanel storage={storage} />
        <TablesPanel storage={storage} />
      </div>

      <ApplicationsSection
        project={project}
        storage={storage}
        selected={application}
      />

      <p className="text-xs text-muted-foreground">{ESTIMATE_HINT}</p>
    </Page>
  );
}
