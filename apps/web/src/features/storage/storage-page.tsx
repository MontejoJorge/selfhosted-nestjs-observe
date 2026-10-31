import { DotPill } from '@/components/data/badges';
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
import {
  Page,
  PageActions,
  PageHeader,
  PageSection,
  PageTitle,
  PanelGrid,
} from '@/components/page';
import {
  ChartCaption,
  CountBadge,
  Panel,
  PanelBody,
  PanelHeader,
} from '@/components/panel';
import { EmptyState } from '@/components/states';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type {
  StorageOverviewDto,
  StorageTableKind,
} from '@/lib/api/generated/api';
import {
  formatBytes,
  formatCount,
  formatDay,
  formatLongDay,
} from '@/lib/format';
import { paths } from '@/lib/paths';
import { useSuspenseQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { storageOverviewQueryOptions } from './queries';
import {
  daysUntilDropped,
  splitValue,
  utcToday,
  type UsagePart,
} from './storage-math';
import { StorageStat, StorageStats } from './storage-stats';
import { UsageLegend, UsageList, UsageRow } from './usage-bars';

const KIND_OPTIONS = [
  { value: 'raw', label: 'Raw telemetry' },
  { value: 'rollup', label: 'Rollups' },
  { value: 'other', label: 'Other' },
] as const satisfies ReadonlyArray<{ value: StorageTableKind; label: string }>;

const KIND_LABELS: Record<StorageTableKind, string> = {
  raw: 'Raw',
  rollup: 'Rollup',
  other: 'Other',
};

function bytesOfKind(data: StorageOverviewDto, kind: StorageTableKind) {
  return data.tables
    .filter((table) => table.kind === kind)
    .reduce((sum, table) => sum + table.bytes, 0);
}

function Figure({
  label,
  bytes,
  hint,
}: {
  label: string;
  bytes: number;
  hint: string;
}) {
  const [value, unit] = splitValue(formatBytes(bytes));
  return <StorageStat label={label} value={value} unit={unit} hint={hint} />;
}

interface DayRow {
  day: string;
  parts: UsagePart[];
  bytes: number;
}

/** Raw-table partitions summed per UTC day up to today (later ones are created ahead, empty). */
function rawDays(data: StorageOverviewDto, today: string): DayRow[] {
  const raw = new Set(
    data.tables.filter((t) => t.kind === 'raw').map((t) => t.table),
  );
  const days = new Map<string, DayRow>();
  for (const partition of data.partitions) {
    if (!raw.has(partition.table) || partition.day > today) continue;
    let row = days.get(partition.day);
    if (!row) {
      row = { day: partition.day, parts: [], bytes: 0 };
      days.set(partition.day, row);
    }
    row.parts.push({
      table: partition.table,
      bytes: partition.bytes,
      rows: partition.approxRows,
    });
    row.bytes += partition.bytes;
  }
  return [...days.values()].sort((a, b) => a.day.localeCompare(b.day));
}

function dropNote(day: string, retentionDays: number, today: string) {
  const left = daysUntilDropped(day, retentionDays, today);
  if (left <= 0) return 'due now';
  return left === 1 ? 'drops in 1 day' : `drops in ${left} days`;
}

function DaysPanel({ data }: { data: StorageOverviewDto }) {
  const today = utcToday();
  const days = useMemo(() => rawDays(data, today), [data, today]);
  const max = Math.max(0, ...days.map((day) => day.bytes));
  return (
    <Panel>
      <PanelHeader title="Raw telemetry per day" aside={<UsageLegend />} />
      <PanelBody className="px-4">
        {days.length === 0 ? (
          <EmptyState title="No day partitions yet" />
        ) : (
          <UsageList>
            {days.map((day) => (
              <UsageRow
                key={day.day}
                label={day.day === today ? 'Today' : formatDay(day.day)}
                title={`${formatLongDay(day.day)} (UTC)`}
                parts={day.parts}
                max={max}
                note={dropNote(day.day, data.retentionDays, today)}
              />
            ))}
          </UsageList>
        )}
        <ChartCaption>
          Real partition sizes, indexes included. Each day is dropped after{' '}
          {data.retentionDays} days.
        </ChartCaption>
      </PanelBody>
    </Panel>
  );
}

function ProjectsSection({ data }: { data: StorageOverviewDto }) {
  const rawBytes = bytesOfKind(data, 'raw');
  const attributed = data.projects.reduce((sum, p) => sum + p.bytes, 0);
  const unattributed = Math.max(0, rawBytes - attributed);
  return (
    <PageSection
      title={
        <span className="flex items-center gap-2">
          Projects <CountBadge>{data.projects.length}</CountBadge>
        </span>
      }
    >
      <TableFrame>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Project</TableHead>
              <TableHead className="text-right">Rows</TableHead>
              <TableHead className="text-right">Size (est.)</TableHead>
              <TableHead className="hidden sm:table-cell">
                Of raw telemetry
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.projects.length === 0 ? (
              <MessageRow colSpan={4}>No project stores telemetry.</MessageRow>
            ) : (
              data.projects.map((project) => (
                <LinkRow key={project.projectId}>
                  <TableCell className="font-medium">
                    <Link
                      to={paths.projectStorage(project.slug)}
                      className={stretchedLink}
                    >
                      {project.name}
                    </Link>
                  </TableCell>
                  <NumCell>{formatCount(project.rows)}</NumCell>
                  <NumCell>{formatBytes(project.bytes)}</NumCell>
                  <TableCell className="hidden sm:table-cell">
                    <Meter
                      percent={
                        rawBytes > 0 ? (project.bytes / rawBytes) * 100 : 0
                      }
                    />
                  </TableCell>
                </LinkRow>
              ))
            )}
            {unattributed > 0 ? (
              <TableRow>
                <TableCell className="text-muted-foreground">
                  Not attributed
                </TableCell>
                <NumCell className="text-muted-foreground">–</NumCell>
                <NumCell className="text-muted-foreground">
                  {formatBytes(unattributed)}
                </NumCell>
                <TableCell className="hidden sm:table-cell">
                  <Meter
                    percent={rawBytes > 0 ? (unattributed / rawBytes) * 100 : 0}
                  />
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </TableFrame>
      <p className="text-xs text-muted-foreground">
        Project sizes are estimates: each day partition is split by the bytes
        counted at ingest. Space of deleted rows stays in the partition until it
        is reused or dropped, and counts as not attributed once no row of it is
        left.
      </p>
    </PageSection>
  );
}

function TablesSection({ data }: { data: StorageOverviewDto }) {
  const [kind, setKind] = useState<StorageTableKind>();
  const tables = kind
    ? data.tables.filter((table) => table.kind === kind)
    : data.tables;
  const retention: Record<StorageTableKind, string> = {
    raw: `${data.retentionDays} d`,
    rollup: `${data.aggregateRetentionDays} d`,
    other: '',
  };
  return (
    <PageSection
      title={
        <span className="flex items-center gap-2">
          Tables <CountBadge>{data.tables.length}</CountBadge>
        </span>
      }
    >
      <FilterBar>
        <OptionFilter
          label="Kind"
          value={kind}
          options={KIND_OPTIONS}
          onChange={setKind}
        />
      </FilterBar>
      <TableFrame>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Table</TableHead>
              <TableHead className="hidden sm:table-cell">Kind</TableHead>
              <TableHead className="hidden text-right md:table-cell">
                Partitions
              </TableHead>
              <TableHead className="hidden text-right md:table-cell">
                Rows (approx.)
              </TableHead>
              <TableHead className="text-right">Size</TableHead>
              <TableHead className="hidden sm:table-cell">
                Of database
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tables.length === 0 ? (
              <MessageRow colSpan={6}>No table of this kind.</MessageRow>
            ) : (
              tables.map((table) => (
                <TableRow key={table.table}>
                  <TableCell className="font-mono text-[13px]">
                    {table.table}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <DotPill tone="neutral">
                      {KIND_LABELS[table.kind]}
                      {retention[table.kind] ? (
                        <span className="text-muted-foreground">
                          {retention[table.kind]}
                        </span>
                      ) : null}
                    </DotPill>
                  </TableCell>
                  <NumCell className="hidden md:table-cell">
                    {table.partitions || '–'}
                  </NumCell>
                  <NumCell className="hidden md:table-cell">
                    {table.approxRows === null
                      ? '–'
                      : formatCount(table.approxRows)}
                  </NumCell>
                  <NumCell>{formatBytes(table.bytes)}</NumCell>
                  <TableCell className="hidden sm:table-cell">
                    <Meter
                      percent={
                        data.databaseBytes > 0
                          ? (table.bytes / data.databaseBytes) * 100
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
      <p className="text-xs text-muted-foreground">
        Sizes include indexes and TOAST. Row counts are planner estimates and
        show – until the table has been analyzed.
      </p>
    </PageSection>
  );
}

export function StoragePage() {
  const { data } = useSuspenseQuery(storageOverviewQueryOptions());
  return (
    <Page>
      <PageHeader>
        <PageTitle subtitle="What the database holds, table by table and day by day.">
          Storage
        </PageTitle>
        <PageActions>
          <RefreshButton />
        </PageActions>
      </PageHeader>

      <StorageStats>
        <Figure
          label="Database"
          bytes={data.databaseBytes}
          hint="All of PostgreSQL's files, free space inside tables included."
        />
        <Figure
          label="Raw telemetry"
          bytes={bytesOfKind(data, 'raw')}
          hint={`Requests, jobs, logs, errors, metrics. Kept ${data.retentionDays} days.`}
        />
        <Figure
          label="Rollups"
          bytes={bytesOfKind(data, 'rollup')}
          hint={`Aggregates behind charts and stats. Kept ${data.aggregateRetentionDays} days.`}
        />
        <Figure
          label="Other"
          bytes={bytesOfKind(data, 'other')}
          hint="Projects, keys, error groups and usage counters."
        />
      </StorageStats>

      <PanelGrid>
        <DaysPanel data={data} />
        <ProjectsSection data={data} />
      </PanelGrid>

      <TablesSection data={data} />
    </Page>
  );
}
