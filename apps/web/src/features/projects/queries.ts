import { api } from '@/lib/api/client';
import type {
  CreateProjectDto,
  TimeRange,
  UpdateProjectDto,
} from '@/lib/api/generated/api';
import { mutationOptions, queryOptions } from '@tanstack/react-query';

/** Enough for a project grid; the list is cursor-paginated server side. */
const PROJECTS_LIMIT = 100;

export const projectsQueryOptions = (range: TimeRange) =>
  queryOptions({
    queryKey: ['projects', 'list', range],
    queryFn: ({ signal }) =>
      api.projects.listProjects({ range, limit: PROJECTS_LIMIT }, { signal }),
  });

/** One project by id or slug. */
export const projectQueryOptions = (project: string) =>
  queryOptions({
    queryKey: ['projects', 'detail', project],
    queryFn: ({ signal }) => api.projects.getProject({ project }, { signal }),
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
