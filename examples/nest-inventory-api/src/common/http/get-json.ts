import { BadGatewayException } from '@nestjs/common';

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
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (response.status === 404) {
    throw new UpstreamNotFoundError(`Upstream 404 for ${url}`);
  }
  if (!response.ok) {
    throw new BadGatewayException(
      `Upstream ${url} answered ${response.status}`,
    );
  }
  return (await response.json()) as T;
}
