import { optionalEnum, optionalString } from '@/lib/search';
import { z } from 'zod';

export const errorListSearch = z.object({
  source: optionalEnum(['request', 'job']),
  /** Substring of the message or error class (server-side). */
  q: optionalString,
});
