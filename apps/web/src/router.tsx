import { RouteError } from '@/components/route-error';
import { PageSkeleton } from '@/components/states';
import { ApiError } from '@/lib/api/client';
import { QueryClient } from '@tanstack/react-query';
import { createRouter } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen';

export interface RouterContext {
  queryClient: QueryClient;
}

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

export const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: 'intent',
  // Freshness is managed by TanStack Query, so the router always calls loaders.
  defaultPreloadStaleTime: 0,
  defaultPendingComponent: PageSkeleton,
  defaultErrorComponent: RouteError,
  scrollRestoration: true,
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
