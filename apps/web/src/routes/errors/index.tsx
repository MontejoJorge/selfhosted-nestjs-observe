import { ErrorGroupsPage } from '@/features/errors/error-groups-page';
import { errorGroupsQueryOptions } from '@/features/errors/queries';
import { toScope } from '@/lib/api/scope';
import { optionalEnum } from '@/lib/search';
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

const searchSchema = z.object({
  source: optionalEnum(['request', 'job']),
});

export const Route = createFileRoute('/errors/')({
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => ({
    scope: toScope(search),
    filters: { source: search.source },
  }),
  loader: ({ context, deps }) =>
    context.queryClient.ensureInfiniteQueryData(
      errorGroupsQueryOptions(deps.scope, deps.filters),
    ),
  component: ErrorGroupsPage,
});
