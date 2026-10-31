import type { StorageTrimDto } from '@/lib/api/generated/api';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';

/**
 * Refreshes the storage figures when a trim leaves the list (the API removes a
 * trim once it is done).
 */
export function useFinishedTrims(trims: readonly StorageTrimDto[]) {
  const queryClient = useQueryClient();
  const previous = useRef<ReadonlySet<string>>(new Set());
  const ids = trims.map((trim) => trim.id).join(',');

  useEffect(() => {
    const current = new Set(ids ? ids.split(',') : []);
    const finished = [...previous.current].filter((id) => !current.has(id));
    previous.current = current;
    if (finished.length === 0) return;
    toast.success(
      finished.length === 1 ? 'Old data deleted' : 'Old data deletions done',
    );
    void queryClient.invalidateQueries({
      predicate: (query) =>
        query.queryKey[0] === 'storage' && query.queryKey[1] !== 'trims',
    });
  }, [ids, queryClient]);
}
