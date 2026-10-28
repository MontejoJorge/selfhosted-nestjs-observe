import { JobDetailPage } from '@/features/jobs/job-detail-page';
import { jobDetailQueryOptions } from '@/features/jobs/queries';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/jobs/$jobId')({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(jobDetailQueryOptions(params.jobId)),
  component: JobDetailPage,
});
