import { describe, expect, it } from 'vitest';
import { moveItem } from './project-order';

describe('moveItem', () => {
  const items = ['a', 'b', 'c', 'd'];

  it('moves an item down and up', () => {
    expect(moveItem(items, 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(moveItem(items, 3, 0)).toEqual(['d', 'a', 'b', 'c']);
  });

  it('leaves the input untouched', () => {
    moveItem(items, 0, 1);
    expect(items).toEqual(['a', 'b', 'c', 'd']);
  });

  it('ignores moves out of range or in place', () => {
    expect(moveItem(items, 0, -1)).toEqual(items);
    expect(moveItem(items, 3, 4)).toEqual(items);
    expect(moveItem(items, 1, 1)).toEqual(items);
  });
});
