import { requestDetailQueryOptions } from '@/features/requests/queries';
import { RequestDetailPage } from '@/features/requests/request-detail-page';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/requests/$requestId')({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(
      requestDetailQueryOptions(params.requestId),
    ),
  component: RequestDetailPage,
});
