import { describe, expect, it } from 'vitest';
import { isFullOrder, POSITION_KEY } from './project-order.js';

describe('isFullOrder', () => {
  const all = ['a', 'b', 'c'];

  it('accepts any order of every id', () => {
    expect(isFullOrder(['c', 'a', 'b'], all)).toBe(true);
    expect(isFullOrder([], [])).toBe(true);
  });

  it.each([
    ['a missing id', ['a', 'b']],
    ['an unknown id', ['a', 'b', 'x']],
    ['a repeated id', ['a', 'a', 'b']],
    ['an extra id', ['a', 'b', 'c', 'd']],
  ])('rejects %s', (_, order) => {
    expect(isFullOrder(order, all)).toBe(false);
  });
});

describe('POSITION_KEY', () => {
  it('only takes positions', () => {
    expect(POSITION_KEY.test('12')).toBe(true);
    // Cursors from before the manual order carried the project name.
    expect(POSITION_KEY.test('Shop')).toBe(false);
    expect(POSITION_KEY.test('-1')).toBe(false);
  });
});
