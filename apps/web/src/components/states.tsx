import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { API_URL, errorMessage, errorStatus } from '@/lib/api/client';
import { cn } from '@/lib/utils';
import { AlertTriangleIcon, InboxIcon, RefreshCwIcon } from 'lucide-react';
import type { ReactNode } from 'react';

/** Generic skeleton shown while a route's loader is pending (same frame as Page). */
export function PageSkeleton() {
  return (
    <div
      className="flex flex-col gap-6 px-4 pt-6 pb-16 md:px-8 lg:px-[60px]"
      aria-busy="true"
      aria-label="Loading"
    >
      <div className="mb-4 flex items-start gap-4">
        <Skeleton className="size-11 rounded-xl" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <Skeleton className="h-80 rounded-2xl" />
        <Skeleton className="h-80 rounded-2xl" />
      </div>
      <Skeleton className="h-64 rounded-2xl" />
    </div>
  );
}

export function InlineSpinner({ className }: { className?: string }) {
  return (
    <RefreshCwIcon
      className={cn('size-3.5 animate-spin text-muted-foreground', className)}
      aria-hidden
    />
  );
}

function describeError(error: unknown): { title: string; detail: string } {
  const status = errorStatus(error);
  if (status === 0) {
    return {
      title: 'API unreachable',
      detail: `Cannot reach the API at ${API_URL}. Check that the collector is running and VITE_API_URL is correct.`,
    };
  }
  if (status === 404) {
    return { title: 'Not found', detail: errorMessage(error) };
  }
  if (status !== undefined) {
    return { title: `API error ${status}`, detail: errorMessage(error) };
  }
  return { title: 'Something went wrong', detail: errorMessage(error) };
}

export function ErrorState({
  error,
  onRetry,
  className,
}: {
  error: unknown;
  onRetry?: () => void;
  className?: string;
}) {
  const { title, detail } = describeError(error);
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm',
        className,
      )}
    >
      <div className="flex items-center gap-2 font-medium text-destructive">
        <AlertTriangleIcon className="size-4" />
        {title}
      </div>
      <p className="text-muted-foreground">{detail}</p>
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCwIcon /> Retry
        </Button>
      ) : null}
    </div>
  );
}

export function EmptyState({
  title,
  children,
  className,
}: {
  title: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-6 py-10 text-center text-sm',
        className,
      )}
    >
      <InboxIcon className="size-6 text-muted-foreground" aria-hidden />
      <p className="font-medium">{title}</p>
      {children ? (
        <div className="max-w-md text-muted-foreground">{children}</div>
      ) : null}
    </div>
  );
}

/** The hint shown when nothing has been ingested yet. */
export function NoTelemetryHint() {
  return (
    <>
      <p>
        Point your app's{' '}
        <code className="text-foreground">OBSERVE_ENDPOINT</code> (or the{' '}
        <code className="text-foreground">endpoint</code> option of{' '}
        <code className="text-foreground">ObserveModule.forRoot</code>) here:
      </p>
      <pre className="mt-2 rounded-md bg-muted px-3 py-2 text-left text-xs text-foreground">
        OBSERVE_ENDPOINT={API_URL}
      </pre>
    </>
  );
}
