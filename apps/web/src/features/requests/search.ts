import { optionalEnum, optionalNumber, optionalString } from '@/lib/search';
import { z } from 'zod';

/** /requests/details: one operation, plus the request-list filters. */
export const operationSearch = z.object({
  operationId: optionalString,
  method: optionalString,
  status: optionalEnum(['ok', 'error']),
  minDuration: optionalNumber,
});
