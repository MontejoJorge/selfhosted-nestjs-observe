import { Sparkline } from '@/components/charts/sparkline';
import { DotPill } from '@/components/data/badges';
import { stretchedLink } from '@/components/data/data-table';
import {
  FilterBar,
  InputFilter,
  OptionFilter,
} from '@/components/data/filters';
import { Page, PageActions, PageHeader, PageTitle } from '@/components/page';
import { CountBadge } from '@/components/panel';
import { EmptyState } from '@/components/states';
import type { ProjectSummaryDto } from '@/lib/api/generated/api';
import { formatDuration, formatRelative } from '@/lib/format';
import { paths } from '@/lib/paths';
import { useRange } from '@/lib/scope-hooks';
import { cn } from '@/lib/utils';
import { useSuspenseQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { CreateProjectDialog } from './create-project-dialog';
import { ProjectAvatar } from './project-avatar';
import { projectsQueryOptions } from './queries';

/** A project counts as active when one of its apps reported in this window. */
const ACTIVE_WINDOW_MS = 15 * 60_000;

function isActive(project: ProjectSummaryDto, now: number): boolean {
  return (
    project.lastSeenAt !== null &&
    now - new Date(project.lastSeenAt).getTime() < ACTIVE_WINDOW_MS
  );
}

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
] as const;

const SPARK_POINTS = 12;

/** Averages the avg-duration buckets into a dozen points: a calm trend line. */
function smooth(activity: ProjectSummaryDto['activity']): (number | null)[] {
  const size = Math.max(1, Math.ceil(activity.length / SPARK_POINTS));
  const points: (number | null)[] = [];
  for (let i = 0; i < activity.length; i += size) {
    let sum = 0;
    let weight = 0;
    for (const bucket of activity.slice(i, i + size)) {
      if (bucket.avgDurationMs === null) continue;
      sum += bucket.avgDurationMs * bucket.count;
      weight += bucket.count;
    }
    points.push(weight > 0 ? sum / weight : null);
  }
  return points;
}

function ProjectCard({
  project,
  active,
}: {
  project: ProjectSummaryDto;
  active: boolean;
}) {
  const [value, unit] = formatDuration(project.avgDurationMs).split(' ');
  const series = useMemo(() => smooth(project.activity), [project.activity]);
  const hasActivity = series.some((v) => v !== null);

  return (
    <article className="relative flex min-h-[370px] flex-col overflow-hidden rounded-2xl border bg-linear-to-b from-card-header to-card transition-colors hover:border-foreground/20">
      <div className="flex flex-col gap-5 p-5">
        <div className="flex items-center gap-3">
          <ProjectAvatar name={project.name} />
          <div className="min-w-0">
            <h2 className="truncate text-xl font-bold tracking-tight">
              <Link
                to={paths.project(project.slug)}
                className={cn(stretchedLink)}
              >
                {project.name}
              </Link>
            </h2>
            <p className="truncate text-sm text-muted-foreground">
              {project.description ?? project.slug}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
          <DotPill tone={active ? 'ok' : 'neutral'} className="font-sans">
            {active ? 'Active' : 'Inactive'}
          </DotPill>
          <span>
            <span className="font-semibold text-foreground">
              {project.applicationCount}
            </span>{' '}
            {project.applicationCount === 1 ? 'app' : 'apps'}
          </span>
          {project.lastSeenAt ? (
            <>
              <span>/</span>
              <span>seen {formatRelative(project.lastSeenAt)}</span>
            </>
          ) : null}
        </div>
        <p className="flex items-baseline gap-1.5">
          <span className="text-2xl font-semibold tabular-nums">
            {project.avgDurationMs === null ? '–' : value}
          </span>
          {project.avgDurationMs === null ? null : (
            <span className="font-mono text-xs text-muted-foreground">
              {unit}
            </span>
          )}
          <span className="ml-2 font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
            avg response
          </span>
        </p>
      </div>
      {hasActivity ? (
        <Sparkline values={series} endDot className="mt-auto h-40" />
      ) : (
        <p className="mt-auto px-5 pb-6 font-mono text-xs text-muted-foreground">
          No requests in this time range.
        </p>
      )}
    </article>
  );
}

export function ProjectsPage() {
  const range = useRange();
  // When the data was fetched: the reference for "active".
  const { data, dataUpdatedAt: now } = useSuspenseQuery(
    projectsQueryOptions(range),
  );
  const [name, setName] = useState<string>();
  const [status, setStatus] = useState<'active' | 'inactive'>();

  const projects = data.items.filter((project) => {
    if (name && !project.name.toLowerCase().includes(name.toLowerCase())) {
      return false;
    }
    if (status) return isActive(project, now) === (status === 'active');
    return true;
  });

  return (
    <Page>
      <PageHeader>
        <PageTitle subtitle="Group your applications into projects to manage them more effectively.">
          My projects <CountBadge>{data.items.length}</CountBadge>
        </PageTitle>
        <PageActions>
          <CreateProjectDialog />
        </PageActions>
      </PageHeader>

      <FilterBar>
        <InputFilter
          label="Name"
          value={name}
          placeholder="Project name contains…"
          onChange={setName}
        />
        <OptionFilter
          label="Status"
          value={status}
          options={STATUS_OPTIONS}
          onChange={setStatus}
        />
      </FilterBar>

      {data.items.length === 0 ? (
        <EmptyState title="No projects yet">
          Create a project, add an application to it and generate an API key for
          the agent.
        </EmptyState>
      ) : projects.length === 0 ? (
        <EmptyState title="No project matches these filters" />
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              active={isActive(project, now)}
            />
          ))}
        </div>
      )}
    </Page>
  );
}
