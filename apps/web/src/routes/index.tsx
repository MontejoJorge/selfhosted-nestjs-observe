import { OverviewPage } from '@/features/overview/overview-page';
import { overviewQueryOptions } from '@/features/overview/queries';
import { toScope } from '@/lib/api/scope';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  loaderDeps: ({ search }) => ({ scope: toScope(search) }),
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData(overviewQueryOptions(deps.scope)),
  component: OverviewPage,
});
