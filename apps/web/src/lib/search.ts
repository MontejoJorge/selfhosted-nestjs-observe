import { z } from 'zod';

/**
 * URL search param helpers. Every page declares a zod object schema for its
 * params; invalid values fall back to `undefined` instead of failing the page.
 */

const blankToUndefined = (value: unknown) =>
  value === undefined || value === null || value === '' ? undefined : value;

export const optionalString = z
  .preprocess(blankToUndefined, z.string().optional())
  .catch(undefined);

export const optionalNumber = z
  .preprocess(blankToUndefined, z.coerce.number().nonnegative().optional())
  .catch(undefined);

export function optionalEnum<const T extends readonly [string, ...string[]]>(
  values: T,
) {
  return z
    .preprocess(blankToUndefined, z.enum(values).optional())
    .catch(undefined);
}

export type SearchSchema = z.ZodObject<z.ZodRawShape>;

/** Parses URLSearchParams with a page schema (first value wins per key). */
export function parseSearch<S extends SearchSchema>(
  schema: S,
  params: URLSearchParams,
): z.output<S> {
  return schema.parse(Object.fromEntries(params));
}

/** Parses the search params of a loader's `request`. */
export function parseRequestSearch<S extends SearchSchema>(
  schema: S,
  request: Request,
): z.output<S> {
  return parseSearch(schema, new URL(request.url).searchParams);
}

export type SearchPatch = Record<string, string | number | undefined>;

/** Returns a copy of `params` with `patch` applied; `undefined` removes a key. */
export function applySearchPatch(
  params: URLSearchParams,
  patch: SearchPatch,
): URLSearchParams {
  const next = new URLSearchParams(params);
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || value === '') next.delete(key);
    else next.set(key, String(value));
  }
  return next;
}
