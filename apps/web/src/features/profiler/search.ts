import { optionalString } from '@/lib/search';
import { z } from 'zod';

/** /profiler: `instance` picks one service node of the application. */
export const profilerSearch = z.object({
  instance: optionalString,
});
