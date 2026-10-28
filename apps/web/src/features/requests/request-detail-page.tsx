import { Page, PageHeader, PageTitle } from '@/components/page';
import { ScopedLink } from '@/components/scoped-link';
import { useSuspenseQuery } from '@tanstack/react-query';
import { useParams } from 'react-router';
import { requestDetailQueryOptions } from './queries';
import { RequestDetailView, RequestSummary } from './request-detail';

export function RequestDetailPage() {
  const { requestId = '' } = useParams();
  const { data: request } = useSuspenseQuery(
    requestDetailQueryOptions(requestId),
  );

  return (
    <Page>
      <PageHeader>
        <PageTitle
          eyebrow={
            <ScopedLink
              to="/requests/list"
              search={{ operationId: request.operationId }}
              className="hover:underline"
            >
              Requests / {request.operationId}
            </ScopedLink>
          }
        >
          <span className="font-mono">
            {request.url ?? request.operationId}
          </span>
        </PageTitle>
        <RequestSummary request={request} />
      </PageHeader>
      <RequestDetailView request={request} />
    </Page>
  );
}
