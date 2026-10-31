import { describe, expect, it } from 'vitest';
import {
  asDate,
  asError,
  asNumber,
  asRecord,
  asString,
  asTags,
  isRecord,
} from './wire-readers.js';

describe('wire readers', () => {
  it('isRecord accepts plain objects only', () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord({ a: 1 })).toBe(true);
    expect(isRecord(null)).toBe(false);
    expect(isRecord([])).toBe(false);
    expect(isRecord('x')).toBe(false);
    expect(isRecord(1)).toBe(false);
  });

  it('asString keeps non-empty strings only', () => {
    expect(asString('abc')).toBe('abc');
    expect(asString('')).toBeNull();
    expect(asString(1)).toBeNull();
    expect(asString(undefined)).toBeNull();
  });

  it('asNumber keeps finite numbers only', () => {
    expect(asNumber(0)).toBe(0);
    expect(asNumber(-1.5)).toBe(-1.5);
    expect(asNumber(Number.NaN)).toBeNull();
    expect(asNumber(Infinity)).toBeNull();
    expect(asNumber('12')).toBeNull();
  });

  it('asRecord and asTags reject arrays and primitives', () => {
    expect(asRecord({ a: 1 })).toEqual({ a: 1 });
    expect(asRecord([1])).toBeNull();
    expect(asTags({ env: 'prod' })).toEqual({ env: 'prod' });
    expect(asTags('env=prod')).toBeNull();
  });

  it('asError always yields a string message', () => {
    expect(asError({ cls: 'TypeError', message: 'boom' })).toEqual({
      cls: 'TypeError',
      message: 'boom',
    });
    expect(asError({ cls: 'TypeError', message: 42 })).toEqual({
      cls: 'TypeError',
      message: '',
    });
    expect(asError({})).toEqual({ message: '' });
    expect(asError('boom')).toBeNull();
    expect(asError(true)).toBeNull();
  });

  describe('asDate', () => {
    const fallback = new Date('2026-10-31T00:00:00Z');

    it('parses ISO strings and epoch milliseconds', () => {
      expect(asDate('2026-10-30T12:00:00Z', fallback).toISOString()).toBe(
        '2026-10-30T12:00:00.000Z',
      );
      expect(asDate(0, fallback).getTime()).toBe(0);
    });

    it('falls back on missing or unparseable values', () => {
      expect(asDate(undefined, fallback)).toBe(fallback);
      expect(asDate('not a date', fallback)).toBe(fallback);
      expect(asDate({}, fallback)).toBe(fallback);
      expect(asDate(Number.NaN, fallback)).toBe(fallback);
    });
  });
});
