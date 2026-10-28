import { useQueryErrorResetBoundary } from '@tanstack/react-query';
import {
  isRouteErrorResponse,
  useRevalidator,
  useRouteError,
} from 'react-router';
import { NotFound } from './not-found';
import { ErrorState } from './states';

/** Route error boundary: shows the error and retries the loaders and queries. */
export function RouteError() {
  const error = useRouteError();
  const revalidator = useRevalidator();
  const { reset } = useQueryErrorResetBoundary();

  if (isRouteErrorResponse(error) && error.status === 404) {
    return <NotFound />;
  }

  return (
    <div className="p-4 md:p-6">
      <ErrorState
        error={error}
        onRetry={() => {
          reset();
          void revalidator.revalidate();
        }}
      />
    </div>
  );
}
