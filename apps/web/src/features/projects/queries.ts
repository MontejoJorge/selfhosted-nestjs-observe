import { api } from '@/lib/api/client';
import type {
  CreateProjectDto,
  UpdateProjectDto,
} from '@/lib/api/generated/api';
import { pickWindow, type TimeWindow } from '@/lib/api/scope';
import { mutationOptions, queryOptions } from '@tanstack/react-query';

/** Enough for a project grid; the list is cursor-paginated server side. */
const PROJECTS_LIMIT = 100;

export const projectsQueryOptions = (window: TimeWindow) =>
  queryOptions({
    queryKey: ['projects', 'list', pickWindow(window)],
    queryFn: ({ signal }) =>
      api.projects.listProjects(
        { ...pickWindow(window), limit: PROJECTS_LIMIT },
        { signal },
      ),
  });

/** One project by id or slug. */
export const projectQueryOptions = (project: string) =>
  queryOptions({
    queryKey: ['projects', 'detail', project],
    queryFn: ({ signal }) => api.projects.getProject({ project }, { signal }),
    staleTime: 5 * 60_000,
  });

/** The UTC days (`YYYY-MM-DD`) with telemetry in the last 90 days, for the range calendar. */
export const dataDaysQueryOptions = (
  project: string,
  application: string | undefined,
) =>
  queryOptions({
    queryKey: ['projects', 'data-days', project, application ?? null],
    queryFn: ({ signal }) =>
      api.projects.listDataDays({ project, application }, { signal }),
    staleTime: 5 * 60_000,
  });

export const createProjectMutation = () =>
  mutationOptions({
    mutationFn: (body: CreateProjectDto) => api.projects.createProject(body),
  });

export const updateProjectMutation = (project: string) =>
  mutationOptions({
    mutationFn: (body: UpdateProjectDto) =>
      api.projects.updateProject({ project }, body),
  });

export const deleteProjectMutation = (project: string) =>
  mutationOptions({
    mutationFn: () => api.projects.deleteProject({ project }),
  });
