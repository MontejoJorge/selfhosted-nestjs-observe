import { Page, PageHeader, PageTitle } from '@/components/page';
import { useSuspenseQuery } from '@tanstack/react-query';
import { getRouteApi, Link } from '@tanstack/react-router';
import { requestDetailQueryOptions } from './queries';
import { RequestDetailView, RequestSummary } from './request-detail';

const route = getRouteApi('/requests/$requestId');

export function RequestDetailPage() {
  const { requestId } = route.useParams();
  const { data: request } = useSuspenseQuery(
    requestDetailQueryOptions(requestId),
  );

  return (
    <Page>
      <PageHeader>
        <PageTitle
          eyebrow={
            <Link
              to="/requests/list"
              search={{ operationId: request.operationId }}
              className="hover:underline"
            >
              Requests / {request.operationId}
            </Link>
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
