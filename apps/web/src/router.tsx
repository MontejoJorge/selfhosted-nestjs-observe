import { AppShell } from '@/components/layout/app-shell';
import { NotFound } from '@/components/not-found';
import { RouteError } from '@/components/route-error';
import { PageSkeleton } from '@/components/states';
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
import { jobListSearch } from '@/features/jobs/search';
import { logsQueryOptions } from '@/features/logs/queries';
import { logsSearch } from '@/features/logs/search';
import {
  customMetricsQueryOptions,
  runtimeMetricsQueryOptions,
} from '@/features/metrics/queries';
import { overviewQueryOptions } from '@/features/overview/queries';
import {
  operationsQueryOptions,
  requestDetailQueryOptions,
  requestListQueryOptions,
} from '@/features/requests/queries';
import { requestListSearch } from '@/features/requests/search';
import { traceQueryOptions } from '@/features/traces/queries';
import { ApiError } from '@/lib/api/client';
import { scopeFromParams } from '@/lib/api/scope';
import { parseRequestSearch } from '@/lib/search';
import { QueryClient } from '@tanstack/react-query';
import { createBrowserRouter, type LoaderFunctionArgs } from 'react-router';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      // Client errors (bad filter, not found) won't fix themselves on retry.
      retry: (failureCount, error) =>
        !(
          error instanceof ApiError &&
          error.status >= 400 &&
          error.status < 500
        ) && failureCount < 2,
    },
  },
});

const scopeOf = (request: Request) =>
  scopeFromParams(new URL(request.url).searchParams);

function param(params: LoaderFunctionArgs['params'], name: string): string {
  const value = params[name];
  if (!value) throw new Response('Not found', { status: 404 });
  return value;
}

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
          {
            index: true,
            loader: async ({ request }) => {
              await queryClient.ensureQueryData(
                overviewQueryOptions(scopeOf(request)),
              );
            },
            lazy: async () => ({
              Component: (await import('@/features/overview/overview-page'))
                .OverviewPage,
            }),
          },
          {
            path: 'requests',
            loader: async ({ request }) => {
              await queryClient.ensureQueryData(
                operationsQueryOptions(scopeOf(request)),
              );
            },
            lazy: async () => ({
              Component: (await import('@/features/requests/operations-page'))
                .OperationsPage,
            }),
          },
          {
            path: 'requests/list',
            loader: async ({ request }) => {
              const filters = parseRequestSearch(requestListSearch, request);
              await queryClient.ensureInfiniteQueryData(
                requestListQueryOptions(scopeOf(request), filters),
              );
            },
            lazy: async () => ({
              Component: (await import('@/features/requests/request-list-page'))
                .RequestListPage,
            }),
          },
          {
            path: 'requests/:requestId',
            loader: async ({ params }) => {
              await queryClient.ensureQueryData(
                requestDetailQueryOptions(param(params, 'requestId')),
              );
            },
            lazy: async () => ({
              Component: (
                await import('@/features/requests/request-detail-page')
              ).RequestDetailPage,
            }),
          },
          {
            path: 'jobs',
            loader: async ({ request }) => {
              await queryClient.ensureQueryData(
                jobStatsQueryOptions(scopeOf(request)),
              );
            },
            lazy: async () => ({
              Component: (await import('@/features/jobs/job-stats-page'))
                .JobStatsPage,
            }),
          },
          {
            path: 'jobs/list',
            loader: async ({ request }) => {
              const filters = parseRequestSearch(jobListSearch, request);
              await queryClient.ensureInfiniteQueryData(
                jobListQueryOptions(scopeOf(request), filters),
              );
            },
            lazy: async () => ({
              Component: (await import('@/features/jobs/job-list-page'))
                .JobListPage,
            }),
          },
          {
            path: 'jobs/:jobId',
            loader: async ({ params }) => {
              await queryClient.ensureQueryData(
                jobDetailQueryOptions(param(params, 'jobId')),
              );
            },
            lazy: async () => ({
              Component: (await import('@/features/jobs/job-detail-page'))
                .JobDetailPage,
            }),
          },
          {
            path: 'errors',
            loader: async ({ request }) => {
              const filters = parseRequestSearch(errorListSearch, request);
              await queryClient.ensureInfiniteQueryData(
                errorGroupsQueryOptions(scopeOf(request), filters),
              );
            },
            lazy: async () => ({
              Component: (await import('@/features/errors/error-groups-page'))
                .ErrorGroupsPage,
            }),
          },
          {
            path: 'errors/:errorId',
            loader: async ({ request, params }) => {
              await queryClient.ensureQueryData(
                errorGroupQueryOptions(
                  param(params, 'errorId'),
                  scopeOf(request),
                ),
              );
            },
            lazy: async () => ({
              Component: (await import('@/features/errors/error-group-page'))
                .ErrorGroupPage,
            }),
          },
          {
            path: 'logs',
            loader: async ({ request }) => {
              const filters = parseRequestSearch(logsSearch, request);
              await queryClient.ensureInfiniteQueryData(
                logsQueryOptions(scopeOf(request), filters),
              );
            },
            lazy: async () => ({
              Component: (await import('@/features/logs/logs-page')).LogsPage,
            }),
          },
          {
            path: 'traces/:traceId',
            loader: async ({ params }) => {
              await queryClient.ensureQueryData(
                traceQueryOptions(param(params, 'traceId')),
              );
            },
            lazy: async () => ({
              Component: (await import('@/features/traces/trace-page'))
                .TracePage,
            }),
          },
          {
            path: 'metrics',
            loader: async ({ request }) => {
              const scope = scopeOf(request);
              await Promise.all([
                queryClient.ensureQueryData(customMetricsQueryOptions(scope)),
                // Runtime series are per service.
                scope.service
                  ? queryClient.ensureQueryData(
                      runtimeMetricsQueryOptions(scope),
                    )
                  : undefined,
              ]);
            },
            lazy: async () => ({
              Component: (await import('@/features/metrics/metrics-page'))
                .MetricsPage,
            }),
          },
          { path: '*', Component: NotFound },
        ],
      },
    ],
  },
]);
