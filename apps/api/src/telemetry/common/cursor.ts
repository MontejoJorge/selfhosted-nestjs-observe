import { BadRequestException } from '@nestjs/common';
import type { Page } from '@selfhosted-observe/contracts';

/** Keyset position: the sort time and id of the last row of the previous page. */
export interface KeysetCursor {
  t: Date;
  id: string;
}

export function encodeCursor(cursor: KeysetCursor): string {
  return Buffer.from(
    JSON.stringify([cursor.t.toISOString(), cursor.id]),
  ).toString('base64url');
}

export const UUID_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const NUMERIC_ID = /^\d{1,18}$/;

/** Decodes a cursor; `idPattern` guards the id before it reaches a typed column. */
export function decodeCursor(
  raw: string | undefined,
  idPattern: RegExp,
): KeysetCursor | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(
      Buffer.from(raw, 'base64url').toString('utf8'),
    );
    if (
      Array.isArray(value) &&
      typeof value[0] === 'string' &&
      typeof value[1] === 'string' &&
      idPattern.test(value[1])
    ) {
      const t = new Date(value[0]);
      if (!Number.isNaN(t.getTime())) return { t, id: value[1] };
    }
  } catch {
    // fall through
  }
  throw new BadRequestException('Invalid cursor');
}

/**
 * Builds a page from `limit + 1` fetched rows: the extra row only signals that
 * another page exists.
 */
export function toPage<Row, Item>(
  rows: Row[],
  limit: number,
  keyOf: (row: Row) => KeysetCursor,
  map: (row: Row) => Item,
): Page<Item> {
  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  return {
    items: pageRows.map(map),
    nextCursor: hasMore
      ? encodeCursor(keyOf(pageRows[pageRows.length - 1]))
      : null,
  };
}

/** Keyset position for lists sorted by a text column: the sort value and the row id. */
export interface TextKeysetCursor {
  key: string;
  id: string;
}

export function encodeTextCursor(cursor: TextKeysetCursor): string {
  return Buffer.from(JSON.stringify([cursor.key, cursor.id])).toString(
    'base64url',
  );
}

export function decodeTextCursor(
  raw: string | undefined,
): TextKeysetCursor | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(
      Buffer.from(raw, 'base64url').toString('utf8'),
    );
    if (
      Array.isArray(value) &&
      typeof value[0] === 'string' &&
      typeof value[1] === 'string' &&
      UUID_ID.test(value[1])
    ) {
      return { key: value[0], id: value[1] };
    }
  } catch {
    // fall through
  }
  throw new BadRequestException('Invalid cursor');
}
