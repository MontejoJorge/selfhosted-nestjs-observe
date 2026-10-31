import { api } from '@/lib/api/client';
import type {
  CreateApplicationDto,
  UpdateApplicationDto,
} from '@/lib/api/generated/api';
import { pickWindow, type TimeWindow } from '@/lib/api/scope';
import { mutationOptions, queryOptions } from '@tanstack/react-query';

/** Projects hold a handful of apps; one page covers them. */
const APPLICATIONS_LIMIT = 100;

/** Applications with their activity stats for the time window (a Scope works too). */
export const applicationsQueryOptions = (project: string, window: TimeWindow) =>
  queryOptions({
    queryKey: ['applications', 'list', project, pickWindow(window)],
    queryFn: ({ signal }) =>
      api.projects.listApplications(
        { project, ...pickWindow(window), limit: APPLICATIONS_LIMIT },
        { signal },
      ),
  });

export const createApplicationMutation = (project: string) =>
  mutationOptions({
    mutationFn: (body: CreateApplicationDto) =>
      api.projects.createApplication({ project }, body),
  });

export const updateApplicationMutation = (project: string) =>
  mutationOptions({
    mutationFn: ({
      applicationId,
      ...body
    }: UpdateApplicationDto & { applicationId: string }) =>
      api.projects.updateApplication({ project, applicationId }, body),
  });

export const deleteApplicationMutation = (project: string) =>
  mutationOptions({
    mutationFn: (applicationId: string) =>
      api.projects.deleteApplication({ project, applicationId }),
  });
