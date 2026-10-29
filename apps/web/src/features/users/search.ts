import { optionalEnum, optionalString } from '@/lib/search';
import { z } from 'zod';

/** /users: `q` is sent to the API as `search` (substring of the user id). */
export const usersSearch = z.object({
  q: optionalString,
});

/** /users/:userId: the request-list status filter. */
export const userSearch = z.object({
  status: optionalEnum(['ok', 'error']),
});
