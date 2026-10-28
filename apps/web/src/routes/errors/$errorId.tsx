import { ErrorGroupPage } from '@/features/errors/error-group-page';
import { errorGroupQueryOptions } from '@/features/errors/queries';
import { toScope } from '@/lib/api/scope';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/errors/$errorId')({
  loaderDeps: ({ search }) => ({ scope: toScope(search) }),
  loader: ({ context, params, deps }) =>
    context.queryClient.ensureQueryData(
      errorGroupQueryOptions(params.errorId, deps.scope),
    ),
  component: ErrorGroupPage,
});
