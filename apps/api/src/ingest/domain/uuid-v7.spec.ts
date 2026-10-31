import { describe, expect, it } from 'vitest';
import { uuidV7, uuidV7Timestamp } from './uuid-v7.js';

const UUID_V7 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('uuidV7', () => {
  it('produces RFC 9562 version 7 ids', () => {
    for (let i = 0; i < 50; i++) expect(uuidV7(Date.now())).toMatch(UUID_V7);
  });

  it('encodes the given event time, not the current time', () => {
    const eventTime = Date.parse('2026-10-30T12:34:56.789Z');
    expect(uuidV7Timestamp(uuidV7(eventTime))).toBe(eventTime);
  });

  it('floors fractional milliseconds and clamps negative times to 0', () => {
    expect(uuidV7Timestamp(uuidV7(1000.9))).toBe(1000);
    expect(uuidV7Timestamp(uuidV7(-5))).toBe(0);
  });

  it('sorts lexicographically by event time', () => {
    const ids = [3_000, 1_000, 2_000].map((ms) => uuidV7(ms));
    expect(ids.toSorted()).toEqual([ids[1], ids[2], ids[0]]);
  });

  it('gives distinct ids for the same millisecond', () => {
    const ids = new Set(Array.from({ length: 100 }, () => uuidV7(42)));
    expect(ids.size).toBe(100);
  });
});

describe('uuidV7Timestamp', () => {
  it('returns null for anything that is not a UUIDv7', () => {
    expect(uuidV7Timestamp('not-a-uuid')).toBeNull();
    // version 4
    expect(uuidV7Timestamp('3b241101-e2bb-4255-8caf-4136c566a962')).toBeNull();
    // bad variant nibble
    expect(uuidV7Timestamp('0192b8c2-1a2b-7c3d-0e4f-123456789abc')).toBeNull();
  });

  it('accepts upper-case ids', () => {
    const id = uuidV7(123_456).toUpperCase();
    expect(uuidV7Timestamp(id)).toBe(123_456);
  });
});
