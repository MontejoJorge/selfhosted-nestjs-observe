import { JobStatsPage } from '@/features/jobs/job-stats-page';
import { jobStatsQueryOptions } from '@/features/jobs/queries';
import { toScope } from '@/lib/api/scope';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/jobs/')({
  loaderDeps: ({ search }) => ({ scope: toScope(search) }),
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData(jobStatsQueryOptions(deps.scope)),
  component: JobStatsPage,
});
