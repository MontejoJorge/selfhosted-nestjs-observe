import { AppShell } from '@/components/layout/app-shell';
import { NotFound } from '@/components/not-found';
import { RouteError } from '@/components/route-error';
import { PageSkeleton } from '@/components/states';
import { apiKeysQueryOptions } from '@/features/api-keys/queries';
import { applicationsQueryOptions } from '@/features/applications/queries';
import {
  errorGroupQueryOptions,
  errorGroupsQueryOptions,
} from '@/features/errors/queries';
import { errorListSearch } from '@/features/errors/search';
import {
  jobDetailQueryOptions,
  jobListQueryOptions,
  jobStatsQueryOptions,
} from '@/features/jobs/queries';
import { jobGroupSearch } from '@/features/jobs/search';
import { logsQueryOptions } from '@/features/logs/queries';
import { logsSearch } from '@/features/logs/search';
import {
  overviewQueryOptions,
  previousOverviewQueryOptions,
} from '@/features/overview/queries';
import {
  runtimeInstancesQueryOptions,
  runtimeMetricsQueryOptions,
} from '@/features/profiler/queries';
import { profilerSearch } from '@/features/profiler/search';
import {
  projectQueryOptions,
  projectsQueryOptions,
} from '@/features/projects/queries';
import {
  operationsQueryOptions,
  requestDetailQueryOptions,
  requestListQueryOptions,
} from '@/features/requests/queries';
import { operationSearch } from '@/features/requests/search';
import {
  slowestSpansQueryOptions,
  timeBreakdownQueryOptions,
} from '@/features/time-breakdown/queries';
import {
  breakdownFilters,
  spanTarget,
  timeBreakdownSearch,
} from '@/features/time-breakdown/search';
import { traceQueryOptions } from '@/features/traces/queries';
import { userQueryOptions, usersQueryOptions } from '@/features/users/queries';
import { userSearch, usersSearch } from '@/features/users/search';
import { errorStatus } from '@/lib/api/client';
import { rangeFromParams, scopeFromParams } from '@/lib/api/scope';
import { paths } from '@/lib/paths';
import { parseRequestSearch } from '@/lib/search';
import { QueryClient } from '@tanstack/react-query';
import {
  createBrowserRouter,
  redirect,
  type LoaderFunctionArgs,
} from 'react-router';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      // Client errors (bad filter, not found) won't fix themselves on retry.
      retry: (failureCount, error) => {
        const status = errorStatus(error) ?? 0;
        return !(status >= 400 && status < 500) && failureCount < 2;
      },
    },
  },
});

function param(params: LoaderFunctionArgs['params'], name: string): string {
  const value = params[name];
  if (!value) throw new Response('Not found', { status: 404 });
  return value;
}

/** The project (from the path) + application and range (from the search params). */
const scopeOf = ({ request, params }: LoaderFunctionArgs) =>
  scopeFromParams(
    param(params, 'projectId'),
    new URL(request.url).searchParams,
  );

const projectOf = ({ params }: LoaderFunctionArgs) =>
  param(params, 'projectId');

/*
 * Loaders only warm the TanStack Query cache (they return nothing). Components
 * read the same queryOptions with useSuspenseQuery, so the cache stays the
 * single source of truth. Page components are lazy-loaded per route.
 */
export const router = createBrowserRouter([
  {
    path: '/',
    Component: AppShell,
    HydrateFallback: PageSkeleton,
    ErrorBoundary: RouteError,
    children: [
      {
        // Pathless layout: page errors render inside the shell.
        ErrorBoundary: RouteError,
        children: [
          { index: true, loader: () => redirect(paths.projects) },
          {
            path: 'projects',
            loader: async ({ request }) => {
              await queryClient.ensureQueryData(
                projectsQueryOptions(
                  rangeFromParams(new URL(request.url).searchParams),
                ),
              );
            },
            lazy: async () => ({
              Component: (await import('@/features/projects/projects-page'))
                .ProjectsPage,
            }),
          },
          {
            path: 'projects/:projectId',
            // A missing project 404s here, before any child loader runs.
            loader: async (args) => {
              await queryClient.ensureQueryData(
                projectQueryOptions(projectOf(args)),
              );
            },
            children: [
              {
                index: true,
                loader: async (args) => {
                  const scope = scopeOf(args);
                  await Promise.all([
                    queryClient.ensureQueryData(overviewQueryOptions(scope)),
                    queryClient.ensureQueryData(operationsQueryOptions(scope)),
                    queryClient.ensureInfiniteQueryData(
                      errorGroupsQueryOptions(scope, {}),
                    ),
                  ]);
                  void queryClient.prefetchQuery(
                    previousOverviewQueryOptions(scope),
                  );
                },
                lazy: async () => ({
                  Component: (
                    await import('@/features/overview/dashboard-page')
                  ).DashboardPage,
                }),
              },
              {
                path: 'applications',
                loader: async (args) => {
                  const scope = scopeOf(args);
                  await queryClient.ensureQueryData(
                    applicationsQueryOptions(scope.project, scope.range),
                  );
                },
                lazy: async () => ({
                  Component: (
                    await import('@/features/applications/applications-page')
                  ).ApplicationsPage,
                }),
              },
              {
                path: 'requests',
                loader: async (args) => {
                  const scope = scopeOf(args);
                  await Promise.all([
                    queryClient.ensureQueryData(overviewQueryOptions(scope)),
                    queryClient.ensureQueryData(operationsQueryOptions(scope)),
                  ]);
                  void queryClient.prefetchQuery(
                    previousOverviewQueryOptions(scope),
                  );
                },
                lazy: async () => ({
                  Component: (
                    await import('@/features/requests/operations-page')
                  ).OperationsPage,
                }),
              },
              {
                path: 'requests/details',
                loader: async (args) => {
                  const scope = scopeOf(args);
                  const search = parseRequestSearch(
                    operationSearch,
                    args.request,
                  );
                  if (!search.operationId) {
                    throw new Response('Not found', { status: 404 });
                  }
                  const filters = { operationId: search.operationId };
                  await Promise.all([
                    queryClient.ensureQueryData(
                      overviewQueryOptions(scope, filters),
                    ),
                    queryClient.ensureQueryData(operationsQueryOptions(scope)),
                    queryClient.ensureInfiniteQueryData(
                      requestListQueryOptions(scope, {
                        operationId: search.operationId,
                        status: search.status,
                        minDuration: search.minDuration,
                      }),
                    ),
                  ]);
                  void queryClient.prefetchQuery(
                    previousOverviewQueryOptions(scope, filters),
                  );
                },
                lazy: async () => ({
                  Component: (
                    await import('@/features/requests/operation-page')
                  ).OperationPage,
                }),
              },
              {
                path: 'requests/:requestId',
                loader: async (args) => {
                  await queryClient.ensureQueryData(
                    requestDetailQueryOptions(
                      projectOf(args),
                      param(args.params, 'requestId'),
                    ),
                  );
                },
                lazy: async () => ({
                  Component: (
                    await import('@/features/requests/request-detail-page')
                  ).RequestDetailPage,
                }),
              },
              {
                path: 'profiler',
                loader: async (args) => {
                  const scope = scopeOf(args);
                  const applications = await queryClient.ensureQueryData(
                    applicationsQueryOptions(scope.project, scope.range),
                  );
                  // Runtime metrics are per application: default to the first.
                  const application =
                    scope.application ?? applications.items[0]?.id;
                  if (!application) return;
                  const { instance } = parseRequestSearch(
                    profilerSearch,
                    args.request,
                  );
                  const runtime = {
                    project: scope.project,
                    application,
                    range: scope.range,
                  };
                  await Promise.all([
                    queryClient.ensureQueryData(
                      runtimeInstancesQueryOptions(runtime),
                    ),
                    queryClient.ensureQueryData(
                      runtimeMetricsQueryOptions({ ...runtime, instance }),
                    ),
                  ]);
                },
                lazy: async () => ({
                  Component: (await import('@/features/profiler/profiler-page'))
                    .ProfilerPage,
                }),
              },
              {
                path: 'jobs',
                loader: async (args) => {
                  const scope = scopeOf(args);
                  await Promise.all([
                    queryClient.ensureQueryData(overviewQueryOptions(scope)),
                    queryClient.ensureQueryData(jobStatsQueryOptions(scope)),
                  ]);
                  void queryClient.prefetchQuery(
                    previousOverviewQueryOptions(scope),
                  );
                },
                lazy: async () => ({
                  Component: (await import('@/features/jobs/job-stats-page'))
                    .JobStatsPage,
                }),
              },
              {
                path: 'jobs/details',
                loader: async (args) => {
                  const scope = scopeOf(args);
                  const search = parseRequestSearch(
                    jobGroupSearch,
                    args.request,
                  );
                  if (!search.queue || !search.name) {
                    throw new Response('Not found', { status: 404 });
                  }
                  const filters = { queue: search.queue, name: search.name };
                  await Promise.all([
                    queryClient.ensureQueryData(
                      overviewQueryOptions(scope, filters),
                    ),
                    queryClient.ensureQueryData(jobStatsQueryOptions(scope)),
                    queryClient.ensureInfiniteQueryData(
                      jobListQueryOptions(scope, {
                        ...filters,
                        status: search.status,
                      }),
                    ),
                  ]);
                  void queryClient.prefetchQuery(
                    previousOverviewQueryOptions(scope, filters),
                  );
                },
                lazy: async () => ({
                  Component: (await import('@/features/jobs/job-group-page'))
                    .JobGroupPage,
                }),
              },
              {
                path: 'jobs/:jobId',
                loader: async (args) => {
                  await queryClient.ensureQueryData(
                    jobDetailQueryOptions(
                      projectOf(args),
                      param(args.params, 'jobId'),
                    ),
                  );
                },
                lazy: async () => ({
                  Component: (await import('@/features/jobs/job-detail-page'))
                    .JobDetailPage,
                }),
              },
              {
                path: 'users',
                loader: async (args) => {
                  const { q } = parseRequestSearch(usersSearch, args.request);
                  await queryClient.ensureQueryData(
                    usersQueryOptions(scopeOf(args), { search: q }),
                  );
                },
                lazy: async () => ({
                  Component: (await import('@/features/users/users-page'))
                    .UsersPage,
                }),
              },
              {
                path: 'users/:userId',
                loader: async (args) => {
                  const scope = scopeOf(args);
                  const userId = param(args.params, 'userId');
                  const { status } = parseRequestSearch(
                    userSearch,
                    args.request,
                  );
                  await Promise.all([
                    queryClient.ensureQueryData(
                      userQueryOptions(scope, userId),
                    ),
                    queryClient.ensureInfiniteQueryData(
                      requestListQueryOptions(scope, { userId, status }),
                    ),
                  ]);
                },
                lazy: async () => ({
                  Component: (await import('@/features/users/user-page'))
                    .UserPage,
                }),
              },
              {
                path: 'time-breakdown',
                loader: async (args) => {
                  const scope = scopeOf(args);
                  const search = parseRequestSearch(
                    timeBreakdownSearch,
                    args.request,
                  );
                  const filters = breakdownFilters(search);
                  const target = spanTarget(search);
                  // Filter options and the open drill-down load without blocking.
                  void queryClient.prefetchQuery(operationsQueryOptions(scope));
                  void queryClient.prefetchQuery(jobStatsQueryOptions(scope));
                  if (target) {
                    void queryClient.prefetchQuery(
                      slowestSpansQueryOptions(scope, filters, target),
                    );
                  }
                  await queryClient.ensureQueryData(
                    timeBreakdownQueryOptions(scope, filters),
                  );
                },
                lazy: async () => ({
                  Component: (
                    await import('@/features/time-breakdown/time-breakdown-page')
                  ).TimeBreakdownPage,
                }),
              },
              {
                path: 'errors',
                loader: async (args) => {
                  const scope = scopeOf(args);
                  const filters = parseRequestSearch(
                    errorListSearch,
                    args.request,
                  );
                  await Promise.all([
                    queryClient.ensureQueryData(overviewQueryOptions(scope)),
                    queryClient.ensureInfiniteQueryData(
                      errorGroupsQueryOptions(scope, filters),
                    ),
                  ]);
                  void queryClient.prefetchQuery(
                    previousOverviewQueryOptions(scope),
                  );
                },
                lazy: async () => ({
                  Component: (
                    await import('@/features/errors/error-groups-page')
                  ).ErrorGroupsPage,
                }),
              },
              {
                path: 'errors/:errorId',
                loader: async (args) => {
                  await queryClient.ensureQueryData(
                    errorGroupQueryOptions(
                      param(args.params, 'errorId'),
                      scopeOf(args),
                    ),
                  );
                },
                lazy: async () => ({
                  Component: (
                    await import('@/features/errors/error-group-page')
                  ).ErrorGroupPage,
                }),
              },
              {
                path: 'logs',
                loader: async (args) => {
                  const filters = parseRequestSearch(logsSearch, args.request);
                  await queryClient.ensureInfiniteQueryData(
                    logsQueryOptions(scopeOf(args), filters),
                  );
                },
                lazy: async () => ({
                  Component: (await import('@/features/logs/logs-page'))
                    .LogsPage,
                }),
              },
              {
                path: 'traces/:traceId',
                loader: async (args) => {
                  await queryClient.ensureQueryData(
                    traceQueryOptions(
                      projectOf(args),
                      param(args.params, 'traceId'),
                    ),
                  );
                },
                lazy: async () => ({
                  Component: (await import('@/features/traces/trace-page'))
                    .TracePage,
                }),
              },
              {
                path: 'keys',
                loader: async (args) => {
                  const project = projectOf(args);
                  await Promise.all([
                    queryClient.ensureInfiniteQueryData(
                      apiKeysQueryOptions(project),
                    ),
                    queryClient.ensureQueryData(
                      applicationsQueryOptions(project, scopeOf(args).range),
                    ),
                  ]);
                },
                lazy: async () => ({
                  Component: (await import('@/features/api-keys/api-keys-page'))
                    .ApiKeysPage,
                }),
              },
              {
                path: 'settings',
                lazy: async () => ({
                  Component: (await import('@/features/settings/settings-page'))
                    .SettingsPage,
                }),
              },
            ],
          },
          { path: '*', Component: NotFound },
        ],
      },
    ],
  },
]);
