import { requestListQueryOptions } from '@/features/requests/queries';
import { RequestListPage } from '@/features/requests/request-list-page';
import { toScope } from '@/lib/api/scope';
import { optionalEnum, optionalNumber, optionalString } from '@/lib/search';
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

const searchSchema = z.object({
  operationId: optionalString,
  status: optionalEnum(['ok', 'error']),
  minDuration: optionalNumber,
  traceId: optionalString,
});

export const Route = createFileRoute('/requests/list')({
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => ({
    scope: toScope(search),
    filters: {
      operationId: search.operationId,
      status: search.status,
      minDuration: search.minDuration,
      traceId: search.traceId,
    },
  }),
  loader: ({ context, deps }) =>
    context.queryClient.ensureInfiniteQueryData(
      requestListQueryOptions(deps.scope, deps.filters),
    ),
  component: RequestListPage,
});
