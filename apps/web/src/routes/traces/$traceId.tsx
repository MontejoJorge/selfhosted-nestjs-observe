import { traceQueryOptions } from '@/features/traces/queries';
import { TracePage } from '@/features/traces/trace-page';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/traces/$traceId')({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(traceQueryOptions(params.traceId)),
  component: TracePage,
});
