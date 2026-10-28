import { Page, PageHeader, PageTitle } from '@/components/page';
import { ScopedLink } from '@/components/scoped-link';
import { useSuspenseQuery } from '@tanstack/react-query';
import { useParams } from 'react-router';
import { JobDetailView, JobSummary } from './job-detail';
import { jobDetailQueryOptions } from './queries';

export function JobDetailPage() {
  const { jobId = '' } = useParams();
  const { data: job } = useSuspenseQuery(jobDetailQueryOptions(jobId));

  return (
    <Page>
      <PageHeader>
        <PageTitle
          eyebrow={
            <ScopedLink
              to="/jobs/list"
              search={{ queue: job.queue, name: job.name }}
              className="hover:underline"
            >
              Jobs / {job.queue}/{job.name}
            </ScopedLink>
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
