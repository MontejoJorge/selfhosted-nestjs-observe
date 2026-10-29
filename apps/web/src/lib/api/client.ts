import { isAxiosError } from 'axios';
import { Api } from './generated/api';

/**
 * Base URL of the collector. The generated paths already start with `/api`.
 * An empty `VITE_API_URL` means same origin (the Docker image proxies the API through nginx).
 */
export const API_URL =
  (import.meta.env.VITE_API_URL ?? 'http://localhost:3000').replace(
    /\/+$/,
    '',
  ) || window.location.origin;

/** The single generated API client. Only queryOptions factories use it. */
export const api = new Api({ baseURL: API_URL });

/** HTTP status of a failed call, `0` when the API could not be reached, `undefined` otherwise. */
export function errorStatus(error: unknown): number | undefined {
  if (!isAxiosError(error)) return undefined;
  return error.response?.status ?? 0;
}

/** Nest's `{ message }` error body (string or string[]), or the error's own message. */
export function errorMessage(error: unknown): string {
  if (isAxiosError<{ message?: string | string[] }>(error)) {
    const message = error.response?.data?.message;
    if (Array.isArray(message)) return message.join(', ');
    if (message) return message;
  }
  return error instanceof Error ? error.message : String(error);
}
