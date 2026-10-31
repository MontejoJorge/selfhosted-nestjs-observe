import { describe, expect, it } from 'vitest';
import { SLUG_MAX_LENGTH, slugify, uniqueSlug } from './slug.js';

describe('slugify', () => {
  it('lowercases, strips accents and joins words with single dashes', () => {
    expect(slugify('My Café  Project!')).toBe('my-cafe-project');
    expect(slugify('  --Hello__World--  ')).toBe('hello-world');
    expect(slugify('Ünïcödé 2026')).toBe('unicode-2026');
  });

  it('falls back to "project" when nothing usable is left', () => {
    expect(slugify('')).toBe('project');
    expect(slugify('!!!')).toBe('project');
    expect(slugify('日本語')).toBe('project');
  });

  it('leaves room for a -N suffix and never ends with a dash', () => {
    const slug = slugify('a'.repeat(59) + ' b' + 'c'.repeat(20));
    expect(slug.length).toBeLessThanOrEqual(SLUG_MAX_LENGTH - 4);
    expect(slug).toBe('a'.repeat(59));
    expect(slugify('x'.repeat(200))).toHaveLength(SLUG_MAX_LENGTH - 4);
  });
});

describe('uniqueSlug', () => {
  it('returns the base when it is free', () => {
    expect(uniqueSlug('shop', new Set())).toBe('shop');
  });

  it('appends the first free number from 2', () => {
    expect(uniqueSlug('shop', new Set(['shop']))).toBe('shop-2');
    expect(uniqueSlug('shop', new Set(['shop', 'shop-2', 'shop-3']))).toBe(
      'shop-4',
    );
    expect(uniqueSlug('shop', new Set(['shop', 'shop-3']))).toBe('shop-2');
  });
});
