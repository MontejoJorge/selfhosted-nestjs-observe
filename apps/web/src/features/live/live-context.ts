import { createContext, use, useEffect } from 'react';

export interface LiveContextValue {
  state: {
    /** The user's choice (kept across reloads). */
    live: boolean;
    /** The page shows a custom window with a fixed end: nothing slides, so LIVE is off. */
    paused: boolean;
  };
  actions: {
    setLive: (live: boolean) => void;
    /** Stops the auto-refresh until the returned release is called. */
    hold: () => () => void;
  };
}

export const LiveContext = createContext<LiveContextValue | null>(null);

/** Auto-refresh ("LIVE") state shared by the page headers. */
export function useLive(): LiveContextValue {
  const context = use(LiveContext);
  if (!context) throw new Error('useLive must be used within LiveProvider');
  return context;
}

/**
 * Keeps LIVE from refreshing while the calling page is mounted, for pages that show
 * one finished execution and have no LIVE control to tell the user it is on.
 */
export function useLiveHold(): void {
  const { hold } = useLive().actions;
  useEffect(() => hold(), [hold]);
}
