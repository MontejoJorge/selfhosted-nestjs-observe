import { optionalString } from '@/lib/search';
import { z } from 'zod';

export const releasesSearch = z.object({
  /** A version to highlight (links from executions and instances). */
  version: optionalString,
});
