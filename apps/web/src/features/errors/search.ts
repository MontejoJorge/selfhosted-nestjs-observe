import { optionalEnum } from '@/lib/search';
import { z } from 'zod';

export const errorListSearch = z.object({
  source: optionalEnum(['request', 'job']),
});
