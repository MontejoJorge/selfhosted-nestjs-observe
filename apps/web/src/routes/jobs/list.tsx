import { JobListPage } from '@/features/jobs/job-list-page';
import { jobListQueryOptions } from '@/features/jobs/queries';
import { toScope } from '@/lib/api/scope';
import { optionalEnum, optionalString } from '@/lib/search';
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

const searchSchema = z.object({
  queue: optionalString,
  name: optionalString,
  status: optionalEnum(['completed', 'failed']),
  traceId: optionalString,
});

export const Route = createFileRoute('/jobs/list')({
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => ({
    scope: toScope(search),
    filters: {
      queue: search.queue,
      name: search.name,
      status: search.status,
      traceId: search.traceId,
    },
  }),
  loader: ({ context, deps }) =>
    context.queryClient.ensureInfiniteQueryData(
      jobListQueryOptions(deps.scope, deps.filters),
    ),
  component: JobListPage,
});
