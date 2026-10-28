import { MetricsPage } from '@/features/metrics/metrics-page';
import {
  customMetricsQueryOptions,
  runtimeMetricsQueryOptions,
} from '@/features/metrics/queries';
import { toScope } from '@/lib/api/scope';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/metrics')({
  loaderDeps: ({ search }) => ({ scope: toScope(search) }),
  loader: async ({ context, deps }) => {
    const { queryClient } = context;
    await Promise.all([
      queryClient.ensureQueryData(customMetricsQueryOptions(deps.scope)),
      // Runtime series are per service.
      deps.scope.service
        ? queryClient.ensureQueryData(runtimeMetricsQueryOptions(deps.scope))
        : undefined,
    ]);
  },
  component: MetricsPage,
});
