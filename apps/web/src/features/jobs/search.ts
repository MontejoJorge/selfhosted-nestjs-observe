import { optionalEnum, optionalString } from '@/lib/search';
import { z } from 'zod';

export const jobListSearch = z.object({
  queue: optionalString,
  name: optionalString,
  status: optionalEnum(['completed', 'failed']),
  traceId: optionalString,
});
