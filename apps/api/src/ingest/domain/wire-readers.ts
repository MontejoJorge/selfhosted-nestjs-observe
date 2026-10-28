import type { Tags, WireError } from '@selfhosted-observe/contracts';

/** Defensive readers for wire values: the agent is a third party, so never trust shapes. */

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

export function asTags(value: unknown): Tags | null {
  return isRecord(value) ? (value as Tags) : null;
}

export function asError(value: unknown): WireError | null {
  if (!isRecord(value)) return null;
  return {
    ...(value as Partial<WireError>),
    message: typeof value.message === 'string' ? value.message : '',
  };
}

export function asDate(value: unknown, fallback: Date): Date {
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date;
  }
  return fallback;
}
