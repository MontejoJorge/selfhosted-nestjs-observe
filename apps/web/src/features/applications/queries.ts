import { api } from '@/lib/api/client';
import type {
  CreateApplicationDto,
  TimeRange,
  UpdateApplicationDto,
} from '@/lib/api/generated/api';
import { mutationOptions, queryOptions } from '@tanstack/react-query';

/** Projects hold a handful of apps; one page covers them. */
const APPLICATIONS_LIMIT = 100;

/** Applications with their activity stats for the range. */
export const applicationsQueryOptions = (project: string, range: TimeRange) =>
  queryOptions({
    queryKey: ['applications', 'list', project, range],
    queryFn: ({ signal }) =>
      api.projects.listApplications(
        { project, range, limit: APPLICATIONS_LIMIT },
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
