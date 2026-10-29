import { api, errorStatus } from '@/lib/api/client';
import type { Scope } from '@/lib/api/scope';
import { queryOptions } from '@tanstack/react-query';

/** The API returns at most this many users (top by request count). */
export const USERS_LIMIT = 200;

export interface UserFilters {
  /** Substring of the user id (server-side). */
  search?: string;
}

export const usersQueryOptions = (scope: Scope, filters: UserFilters) =>
  queryOptions({
    queryKey: ['users', 'list', scope, filters],
    queryFn: ({ signal }) =>
      api.users.listUsers(
        { ...scope, ...filters, limit: USERS_LIMIT },
        { signal },
      ),
  });

/**
 * One user's stats and timeline. The API 404s when the user has no requests in
 * the range; that is an empty page here (the range can be widened), not an error.
 */
export const userQueryOptions = (scope: Scope, userId: string) =>
  queryOptions({
    queryKey: ['users', 'detail', scope, userId],
    queryFn: async ({ signal }) => {
      try {
        return await api.users.getUser({ ...scope, userId }, { signal });
      } catch (error) {
        if (errorStatus(error) === 404) return null;
        throw error;
      }
    },
  });
