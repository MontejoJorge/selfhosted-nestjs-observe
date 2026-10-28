import { InlineSpinner } from '@/components/states';
import { Button } from '@/components/ui/button';

/** Footer for cursor-paginated lists backed by useInfiniteQuery (put it in TableFrame's `footer`). */
export function LoadMore({
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
  shown,
  label = 'Load more',
}: {
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => unknown;
  shown: number;
  label?: string;
}) {
  return (
    <>
      <span className="font-mono text-xs text-muted-foreground">
        {shown} {shown === 1 ? 'row' : 'rows'}
      </span>
      {hasNextPage ? (
        <Button
          variant="inverse"
          size="sm"
          disabled={isFetchingNextPage}
          onClick={() => fetchNextPage()}
        >
          {isFetchingNextPage ? <InlineSpinner /> : null}
          {label}
        </Button>
      ) : (
        <span className="font-mono text-xs text-muted-foreground uppercase">
          End of results
        </span>
      )}
    </>
  );
}
