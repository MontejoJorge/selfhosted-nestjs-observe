import { InlineSpinner } from '@/components/states';
import { Button } from '@/components/ui/button';

/** Footer for cursor-paginated lists backed by useInfiniteQuery. */
export function LoadMore({
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
  shown,
}: {
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => unknown;
  shown: number;
}) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
      <span>
        {shown} {shown === 1 ? 'row' : 'rows'} shown
      </span>
      {hasNextPage ? (
        <Button
          variant="outline"
          size="sm"
          disabled={isFetchingNextPage}
          onClick={() => fetchNextPage()}
        >
          {isFetchingNextPage ? <InlineSpinner /> : null}
          Load more
        </Button>
      ) : (
        <span>End of results</span>
      )}
    </div>
  );
}
