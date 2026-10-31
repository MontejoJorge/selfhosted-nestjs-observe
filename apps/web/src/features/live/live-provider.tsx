import { useTimeWindow } from '@/lib/scope-hooks';
import { isFixedWindow } from '@/lib/time-window';
import { useQueryClient } from '@tanstack/react-query';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
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

/**
 * While live, refetches every active query on an interval (relative ranges slide
 * forward), unless a mounted page holds it (`useLiveHold`) or the URL has a
 * custom window with a fixed end (`from` + `to`), which never changes.
 */
export function LiveProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [live, setLiveState] = useState(readStoredLive);
  const holds = useRef(0);
  const paused = isFixedWindow(useTimeWindow());
  const refreshing = live && !paused;

  const hold = useCallback(() => {
    holds.current += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      holds.current -= 1;
    };
  }, []);

  useEffect(() => {
    if (!refreshing) return;
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible' && holds.current === 0) {
        void queryClient.invalidateQueries({ type: 'active' });
      }
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [refreshing, queryClient]);

  const value = useMemo<LiveContextValue>(
    () => ({
      state: { live, paused },
      actions: {
        hold,
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
    [live, paused, hold],
  );

  return <LiveContext value={value}>{children}</LiveContext>;
}
