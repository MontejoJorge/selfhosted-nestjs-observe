import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import {
  decodeCursor,
  decodeTextCursor,
  encodeCursor,
  encodeTextCursor,
  NUMERIC_ID,
  toPage,
  UUID_ID,
} from './cursor.js';

const ID = '0192b8c2-1a2b-7c3d-8e4f-123456789abc';
const raw = (value: unknown) =>
  Buffer.from(JSON.stringify(value)).toString('base64url');

describe('keyset cursors', () => {
  it('round-trips the time and id', () => {
    const cursor = { t: new Date('2026-10-30T12:00:00.123Z'), id: ID };
    const encoded = encodeCursor(cursor);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeCursor(encoded, UUID_ID)).toEqual(cursor);
  });

  it('returns null when there is no cursor', () => {
    expect(decodeCursor(undefined, UUID_ID)).toBeNull();
    expect(decodeCursor('', UUID_ID)).toBeNull();
  });

  it.each([
    ['garbage', 'not-base64-json'],
    ['a non-array', raw({ t: '2026-10-30T12:00:00Z', id: ID })],
    ['an invalid date', raw(['yesterday', ID])],
    ['a non-string id', raw(['2026-10-30T12:00:00Z', 42])],
    [
      'an id that fails the pattern',
      raw(['2026-10-30T12:00:00Z', "1' or 1=1"]),
    ],
  ])('rejects %s with a 400', (_, value) => {
    expect(() => decodeCursor(value, UUID_ID)).toThrow(BadRequestException);
  });

  it('guards ids with the given pattern', () => {
    const numeric = raw(['2026-10-30T12:00:00Z', '12345']);
    expect(decodeCursor(numeric, NUMERIC_ID)?.id).toBe('12345');
    expect(() => decodeCursor(numeric, UUID_ID)).toThrow(BadRequestException);
    expect(NUMERIC_ID.test('1'.repeat(19))).toBe(false);
  });
});

describe('text cursors', () => {
  it('round-trips the key and id', () => {
    const cursor = { key: 'Ünïcode "name"', id: ID };
    expect(decodeTextCursor(encodeTextCursor(cursor))).toEqual(cursor);
  });

  it('rejects a non-uuid id', () => {
    expect(() => decodeTextCursor(raw(['name', 'nope']))).toThrow(
      BadRequestException,
    );
  });

  it('returns null without a cursor', () => {
    expect(decodeTextCursor(undefined)).toBeNull();
  });
});

describe('toPage', () => {
  const rows = [1, 2, 3].map((n) => ({
    at: new Date(Date.UTC(2026, 9, 30, 12, 0, n)),
    id: `${ID.slice(0, -1)}${n}`,
  }));
  const keyOf = (row: (typeof rows)[number]) => ({ t: row.at, id: row.id });
  const map = (row: (typeof rows)[number]) => row.id;

  it('uses the extra row only to signal another page', () => {
    const page = toPage(rows, 2, keyOf, map);
    expect(page.items).toEqual([rows[0].id, rows[1].id]);
    expect(decodeCursor(page.nextCursor!, UUID_ID)).toEqual(keyOf(rows[1]));
  });

  it('has no next cursor on the last page', () => {
    expect(toPage(rows, 3, keyOf, map).nextCursor).toBeNull();
    expect(toPage([], 3, keyOf, map)).toEqual({ items: [], nextCursor: null });
  });
});
