import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { LiveContext, type LiveContextValue } from './live-context';

const STORAGE_KEY = 'observe-live';
/** The agent flushes every 5 s; refreshing every 10 s keeps up without hammering the API. */
const REFRESH_MS = 10_000;

function readStoredLive(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

/** While live, refetches every active query on an interval (relative ranges slide forward). */
export function LiveProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [live, setLiveState] = useState(readStoredLive);

  useEffect(() => {
    if (!live) return;
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') {
        void queryClient.invalidateQueries({ type: 'active' });
      }
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [live, queryClient]);

  const value = useMemo<LiveContextValue>(
    () => ({
      state: { live },
      actions: {
        setLive: (next) => {
          setLiveState(next);
          try {
            localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
          } catch {
            // Ignore: the choice just won't persist.
          }
        },
      },
    }),
    [live],
  );

  return <LiveContext value={value}>{children}</LiveContext>;
}
