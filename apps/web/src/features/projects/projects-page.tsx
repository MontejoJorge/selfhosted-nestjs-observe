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
import type { TimeWindow } from '@/lib/api/scope';
import { formatDuration, formatRelative } from '@/lib/format';
import { paths } from '@/lib/paths';
import { useTimeWindow } from '@/lib/scope-hooks';
import { windowPhrase } from '@/lib/time-window';
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

const SPARK_POINTS = 24;

/**
 * Requests per bucket, summed into about two dozen points. Volume rather than
 * latency: a bucket without traffic is a real zero, so a quiet project still
 * draws a line across the whole range instead of one with holes.
 */
function requestSeries(activity: ProjectSummaryDto['activity']): number[] {
  const size = Math.max(1, Math.ceil(activity.length / SPARK_POINTS));
  const points: number[] = [];
  for (let i = 0; i < activity.length; i += size) {
    points.push(
      activity
        .slice(i, i + size)
        .reduce((total, bucket) => total + bucket.count, 0),
    );
  }
  return points;
}

function ProjectCard({
  project,
  active,
  timeWindow,
}: {
  project: ProjectSummaryDto;
  active: boolean;
  timeWindow: TimeWindow;
}) {
  const [value, unit] = formatDuration(project.avgDurationMs).split(' ');
  const series = useMemo(
    () => requestSeries(project.activity),
    [project.activity],
  );
  const hasActivity = series.some((count) => count > 0);

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
        <div className="mt-auto flex flex-col gap-2">
          <p className="px-5 font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
            Requests · {windowPhrase(timeWindow)}
          </p>
          <Sparkline values={series} className="h-36" />
        </div>
      ) : (
        <p className="mt-auto px-5 pb-6 font-mono text-xs text-muted-foreground">
          No requests in this time range.
        </p>
      )}
    </article>
  );
}

export function ProjectsPage() {
  const timeWindow = useTimeWindow();
  // When the data was fetched: the reference for "active".
  const { data, dataUpdatedAt: now } = useSuspenseQuery(
    projectsQueryOptions(timeWindow),
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
        <PageTitle subtitle="One project per environment or product, each with its own applications.">
          My projects <CountBadge>{data.items.length}</CountBadge>
        </PageTitle>
        {data.items.length > 0 ? (
          <PageActions>
            <CreateProjectDialog />
          </PageActions>
        ) : null}
      </PageHeader>

      {data.items.length === 0 ? (
        <EmptyState
          title="Create your first project"
          action={
            <CreateProjectDialog>Create your first project</CreateProjectDialog>
          }
          className="py-16"
        >
          A project groups the applications of one product. Create one, add an
          application to it and point the application's agent at this collector
          with the API key it gets.
        </EmptyState>
      ) : (
        <>
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
          {projects.length === 0 ? (
            <EmptyState title="No project matches these filters" />
          ) : (
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {projects.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  active={isActive(project, now)}
                  timeWindow={timeWindow}
                />
              ))}
            </div>
          )}
        </>
      )}
    </Page>
  );
}
