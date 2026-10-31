import { describe, expect, it } from 'vitest';
import { asTags, asWireError, decodeTrace } from './trace-decoder.js';

describe('decodeTrace', () => {
  it('decodes the single-letter wire keys recursively', () => {
    expect(
      decodeTrace([
        {
          s: 'span-1',
          n: 'load',
          o: 'manual',
          c: 'UsersService',
          m: 'find',
          d: 12.5,
          so: 1,
          t: { cache: 'miss' },
          e: { cls: 'Error', message: 'boom' },
          ch: [{ o: 'auto', c: 'pg', m: 'query', e: true }],
        },
      ]),
    ).toEqual([
      {
        spanId: 'span-1',
        name: 'load',
        origin: 'manual',
        className: 'UsersService',
        methodName: 'find',
        durationMs: 12.5,
        startOffsetMs: 1,
        tags: { cache: 'miss' },
        error: { cls: 'Error', message: 'boom' },
        children: [
          {
            spanId: null,
            name: null,
            origin: 'auto',
            className: 'pg',
            methodName: 'query',
            durationMs: null,
            startOffsetMs: null,
            tags: {},
            error: true,
            children: [],
          },
        ],
      },
    ]);
  });

  it('tolerates malformed input', () => {
    expect(decodeTrace(null)).toEqual([]);
    expect(decodeTrace({})).toEqual([]);
    const [span] = decodeTrace([
      7,
      { o: 'weird', d: Number.NaN, t: [], e: 'x', ch: 'no' },
    ]);
    expect(span).toMatchObject({
      origin: 'auto',
      durationMs: null,
      tags: {},
      error: null,
      children: [],
    });
  });
});

describe('asTags and asWireError', () => {
  it('fall back to empty tags and no error', () => {
    expect(asTags({ a: 1 })).toEqual({ a: 1 });
    expect(asTags(null)).toEqual({});
    expect(asWireError({ message: 'x' })).toEqual({ message: 'x' });
    expect(asWireError([])).toBeNull();
  });
});
