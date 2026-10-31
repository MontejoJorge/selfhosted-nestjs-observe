import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { encodeCursor } from '../common/cursor.js';
import { decodeReleaseCursor, encodeReleaseCursor } from './release-cursor.js';

const APP = '0192b8c2-1a2b-7c3d-8e4f-123456789abc';

describe('release cursors', () => {
  it('round-trips versions with any characters', () => {
    for (const version of ['1.4.0', 'v2 "beta"', 'a/b\\c', 'üñí', '']) {
      const cursor = {
        at: new Date('2026-10-30T12:00:00Z'),
        applicationId: APP,
        version,
      };
      expect(decodeReleaseCursor(encodeReleaseCursor(cursor))).toEqual(cursor);
    }
  });

  it('returns null without a cursor', () => {
    expect(decodeReleaseCursor(undefined)).toBeNull();
  });

  it.each([
    ['a plain keyset cursor', encodeCursor({ t: new Date(), id: APP })],
    [
      'a non-uuid application',
      encodeCursor({ t: new Date(), id: JSON.stringify(['app', '1.0']) }),
    ],
    [
      'a three-element id',
      encodeCursor({ t: new Date(), id: JSON.stringify([APP, '1', '2']) }),
    ],
    [
      'a non-string version',
      encodeCursor({ t: new Date(), id: JSON.stringify([APP, 1]) }),
    ],
    ['broken JSON', encodeCursor({ t: new Date(), id: '["x' + ']' })],
  ])('rejects %s', (_, raw) => {
    expect(() => decodeReleaseCursor(raw)).toThrow(BadRequestException);
  });
});
