import { createContext, use } from 'react';

export interface LiveContextValue {
  state: { live: boolean };
  actions: { setLive: (live: boolean) => void };
}

export const LiveContext = createContext<LiveContextValue | null>(null);

/** Auto-refresh ("LIVE") state shared by the page headers. */
export function useLive(): LiveContextValue {
  const context = use(LiveContext);
  if (!context) throw new Error('useLive must be used within LiveProvider');
  return context;
}
