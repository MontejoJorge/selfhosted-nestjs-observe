import { BadRequestException } from '@nestjs/common';
import { decodeCursor, encodeCursor, UUID_ID } from '../common/cursor.js';
import type { ReleaseCursor } from './releases.repository.js';

/** The cursor's id is `["<application uuid>", "<version>"]`. */
const RELEASE_ID = /^\[".*\]$/s;

export function encodeReleaseCursor(cursor: ReleaseCursor): string {
  return encodeCursor({
    t: cursor.at,
    id: JSON.stringify([cursor.applicationId, cursor.version]),
  });
}

export function decodeReleaseCursor(
  raw: string | undefined,
): ReleaseCursor | null {
  const cursor = decodeCursor(raw, RELEASE_ID);
  if (!cursor) return null;
  try {
    const value: unknown = JSON.parse(cursor.id);
    if (
      Array.isArray(value) &&
      value.length === 2 &&
      typeof value[0] === 'string' &&
      UUID_ID.test(value[0]) &&
      typeof value[1] === 'string'
    )
      return { at: cursor.t, applicationId: value[0], version: value[1] };
  } catch {
    // fall through
  }
  throw new BadRequestException('Invalid cursor');
}
