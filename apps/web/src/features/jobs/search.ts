import { optionalEnum, optionalString } from '@/lib/search';
import { z } from 'zod';

/** /jobs/details: one queue + job name, plus the run-list status filter. */
export const jobGroupSearch = z.object({
  queue: optionalString,
  name: optionalString,
  status: optionalEnum(['completed', 'failed']),
});
