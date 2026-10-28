import { z } from 'zod';

/**
 * Search param helpers. TanStack Router JSON-parses search values, so a
 * hand-typed `?service=123` arrives as a number: coerce it back to a string.
 * Invalid values fall back to `undefined` instead of failing the route.
 */
export const optionalString = z
  .preprocess(
    (value) =>
      value === undefined || value === null || value === ''
        ? undefined
        : String(value),
    z.string().optional(),
  )
  .catch(undefined);

export const optionalNumber = z
  .preprocess(
    (value) =>
      value === undefined || value === null || value === ''
        ? undefined
        : Number(value),
    z.number().nonnegative().optional(),
  )
  .catch(undefined);

export function optionalEnum<const T extends readonly [string, ...string[]]>(
  values: T,
) {
  return z.enum(values).optional().catch(undefined);
}
