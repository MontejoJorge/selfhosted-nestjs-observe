import { Page, PageHeader, PageTitle } from '@/components/page';
import { useSuspenseQuery } from '@tanstack/react-query';
import { getRouteApi, Link } from '@tanstack/react-router';
import { JobDetailView, JobSummary } from './job-detail';
import { jobDetailQueryOptions } from './queries';

const route = getRouteApi('/jobs/$jobId');

export function JobDetailPage() {
  const { jobId } = route.useParams();
  const { data: job } = useSuspenseQuery(jobDetailQueryOptions(jobId));

  return (
    <Page>
      <PageHeader>
        <PageTitle
          eyebrow={
            <Link
              to="/jobs/list"
              search={{ queue: job.queue, name: job.name }}
              className="hover:underline"
            >
              Jobs / {job.queue}/{job.name}
            </Link>
          }
        >
          <span className="font-mono">
            {job.name} #{job.jobId}
          </span>
        </PageTitle>
        <JobSummary job={job} />
      </PageHeader>
      <JobDetailView job={job} />
    </Page>
  );
}
