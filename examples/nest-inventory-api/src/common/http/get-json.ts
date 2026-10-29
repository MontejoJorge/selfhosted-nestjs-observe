import { BadGatewayException } from '@nestjs/common';

/**
 * Upstream responses are reused for this long, so the self-generated load
 * (see load/) does not hammer the public APIs. Cache hits make no HTTP span.
 */
const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { value: unknown; expiresAt: number }>();

/** Thrown by `getJson` when the upstream answers 404. */
export class UpstreamNotFoundError extends Error {}

/**
 * GETs a JSON resource from a public upstream API.
 *
 * A plain function on purpose: every method of an injectable is traced by
 * `@nestjs/observe`, so keeping this helper outside any class avoids a
 * redundant span between each service step and its outbound HTTP span.
 */
export async function getJson<T>(url: string): Promise<T> {
  const cached = cache.get(url);
  if (cached && cached.expiresAt > Date.now()) return cached.value as T;

  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (response.status === 404) {
    throw new UpstreamNotFoundError(`Upstream 404 for ${url}`);
  }
  if (!response.ok) {
    throw new BadGatewayException(
      `Upstream ${url} answered ${response.status}`,
    );
  }
  const value = (await response.json()) as T;
  cache.set(url, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}
