import { optionalString } from '@/lib/search';
import { z } from 'zod';

/** Project storage: narrow the totals, tables and days to one application. */
export const projectStorageSearch = z.object({
  application: optionalString,
});
