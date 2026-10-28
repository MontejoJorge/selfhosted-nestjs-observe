/** Base URL of the collector's query API. */
export const API_URL = (
  import.meta.env.VITE_API_URL ?? 'http://localhost:3000'
).replace(/\/+$/, '');

export type QueryParams = Record<
  string,
  string | number | boolean | null | undefined
>;

/** A non-2xx response from the API, carrying Nest's `{ statusCode, message, error }` body. */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

function buildUrl(path: string, params?: QueryParams): string {
  const url = new URL(`${API_URL}/api${path}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: string | string[] };
    if (Array.isArray(body.message)) return body.message.join(', ');
    if (body.message) return body.message;
  } catch {
    // Not JSON: fall through to the status text.
  }
  return response.statusText || `Request failed with status ${response.status}`;
}

export async function apiGet<T>(
  path: string,
  params?: QueryParams,
  signal?: AbortSignal,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(buildUrl(path, params), {
      signal,
      headers: { Accept: 'application/json' },
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error;
    }
    throw new ApiError(0, `Cannot reach the API at ${API_URL}`);
  }
  if (!response.ok) {
    throw new ApiError(response.status, await readErrorMessage(response));
  }
  return (await response.json()) as T;
}
