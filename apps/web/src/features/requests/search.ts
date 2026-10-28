import { optionalEnum, optionalNumber, optionalString } from '@/lib/search';
import { z } from 'zod';

export const requestListSearch = z.object({
  operationId: optionalString,
  status: optionalEnum(['ok', 'error']),
  minDuration: optionalNumber,
  traceId: optionalString,
});
