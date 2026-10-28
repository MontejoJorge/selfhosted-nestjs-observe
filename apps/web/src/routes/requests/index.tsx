import { OperationsPage } from '@/features/requests/operations-page';
import { operationsQueryOptions } from '@/features/requests/queries';
import { toScope } from '@/lib/api/scope';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/requests/')({
  loaderDeps: ({ search }) => ({ scope: toScope(search) }),
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData(operationsQueryOptions(deps.scope)),
  component: OperationsPage,
});
