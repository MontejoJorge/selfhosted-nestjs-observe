import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  applySearchPatch,
  optionalEnum,
  optionalNumber,
  optionalString,
  parseRequestSearch,
  parseSearch,
} from './search';

const schema = z.object({
  q: optionalString,
  min: optionalNumber,
  status: optionalEnum(['ok', 'error']),
});

const parse = (query: string) =>
  parseSearch(schema, new URLSearchParams(query));

describe('search param helpers', () => {
  it('parses valid values', () => {
    expect(parse('q=users&min=250&status=error')).toEqual({
      q: 'users',
      min: 250,
      status: 'error',
    });
  });

  it('turns missing, blank and invalid values into undefined', () => {
    expect(parse('')).toEqual({
      q: undefined,
      min: undefined,
      status: undefined,
    });
    expect(parse('q=&min=&status=')).toEqual({
      q: undefined,
      min: undefined,
      status: undefined,
    });
    expect(parse('min=abc&status=bogus')).toEqual({
      q: undefined,
      min: undefined,
      status: undefined,
    });
  });

  it('rejects negative and non-finite numbers', () => {
    expect(parse('min=-1').min).toBeUndefined();
    expect(parse('min=Infinity').min).toBeUndefined();
    expect(parse('min=1.5').min).toBe(1.5);
  });

  // BUG: parseSearch documents "first value wins per key", but it builds the input
  // with Object.fromEntries, which keeps the last one. useScope reads the scope keys
  // with URLSearchParams.get (the first), so a repeated param can disagree between
  // the two paths.
  it.fails('keeps the first value of a repeated key', () => {
    expect(parse('q=a&q=b').q).toBe('a');
  });

  it('ignores unknown params', () => {
    expect(parse('q=x&other=1')).toEqual({
      q: 'x',
      min: undefined,
      status: undefined,
    });
  });

  it('parses a loader request URL', () => {
    const request = new Request('http://localhost/projects/p/requests?q=x');
    expect(parseRequestSearch(schema, request).q).toBe('x');
  });
});

describe('applySearchPatch', () => {
  it('sets, replaces and removes keys without mutating the input', () => {
    const params = new URLSearchParams('a=1&b=2&c=3');
    const next = applySearchPatch(params, {
      a: 'x',
      b: undefined,
      c: '',
      d: 4,
    });
    expect(next.toString()).toBe('a=x&d=4');
    expect(params.toString()).toBe('a=1&b=2&c=3');
  });
});
