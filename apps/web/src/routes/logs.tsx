import { LogsPage } from '@/features/logs/logs-page';
import { LOG_LEVELS, logsQueryOptions } from '@/features/logs/queries';
import { toScope } from '@/lib/api/scope';
import { optionalEnum, optionalString } from '@/lib/search';
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

const searchSchema = z.object({
  level: optionalEnum(LOG_LEVELS),
  context: optionalString,
  traceId: optionalString,
  q: optionalString,
});

export const Route = createFileRoute('/logs')({
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => ({
    scope: toScope(search),
    filters: {
      level: search.level,
      context: search.context,
      traceId: search.traceId,
      q: search.q,
    },
  }),
  loader: ({ context, deps }) =>
    context.queryClient.ensureInfiniteQueryData(
      logsQueryOptions(deps.scope, deps.filters),
    ),
  component: LogsPage,
});
