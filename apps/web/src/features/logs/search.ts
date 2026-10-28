import { optionalEnum, optionalString } from '@/lib/search';
import { z } from 'zod';
import { LOG_LEVELS } from './queries';

export const logsSearch = z.object({
  level: optionalEnum(LOG_LEVELS),
  context: optionalString,
  traceId: optionalString,
  q: optionalString,
});
