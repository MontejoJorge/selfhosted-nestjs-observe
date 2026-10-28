import { useSearch } from '@tanstack/react-router';
import { toScope, type Scope } from './api/scope';

/** The global service + time range from the root route's search params. */
export function useScope(): Scope {
  const search = useSearch({ from: '__root__' });
  return toScope(search);
}
