import { useQueryErrorResetBoundary } from '@tanstack/react-query';
import { useRouter, type ErrorComponentProps } from '@tanstack/react-router';
import { useEffect } from 'react';
import { ErrorState } from './states';

/** Route-level error boundary: shows the error and retries loader + queries. */
export function RouteError({ error }: ErrorComponentProps) {
  const router = useRouter();
  const queryErrorResetBoundary = useQueryErrorResetBoundary();

  useEffect(() => {
    queryErrorResetBoundary.reset();
  }, [queryErrorResetBoundary]);

  return (
    <div className="p-4 md:p-6">
      <ErrorState error={error} onRetry={() => void router.invalidate()} />
    </div>
  );
}
