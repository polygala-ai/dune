import { describe, expect, it } from 'vitest';

import {
  getUnresolvedDependencyIds,
  hasCircularDependency,
  isDependencyResolved,
  isItemBlocked,
  normalizeDependencyIds,
  type DependencyWorkItem,
} from './dependency-utils';

function createItem(overrides: Partial<DependencyWorkItem> & Pick<DependencyWorkItem, 'id'>): DependencyWorkItem {
  return {
    status: 'ready',
    ...overrides,
  };
}

describe('dependency-utils', () => {
  it('normalizes dependency ids by trimming and deduping', () => {
    expect(normalizeDependencyIds([' item-1 ', 'item-2', 'item-1', ''])).toEqual(['item-1', 'item-2']);
    expect(normalizeDependencyIds([])).toBeUndefined();
  });

  it('treats done and acceptance items as resolved dependencies', () => {
    expect(isDependencyResolved(createItem({ id: 'item-1', status: 'done' }))).toBe(true);
    expect(isDependencyResolved(createItem({ id: 'item-2', status: 'acceptance' }))).toBe(true);
    expect(isDependencyResolved(createItem({ id: 'item-3', status: 'active' }))).toBe(false);
    expect(isDependencyResolved(null)).toBe(false);
  });

  it('flags items as blocked when dependencies are missing or unresolved', () => {
    const allItems = [
      createItem({ id: 'done-item', status: 'done' }),
      createItem({ id: 'active-item', status: 'active' }),
      createItem({ id: 'blocked-item', dependsOn: ['done-item', 'active-item', 'missing-item'] }),
    ];

    expect(getUnresolvedDependencyIds(allItems[2]!, allItems)).toEqual(['active-item', 'missing-item']);
    expect(isItemBlocked(allItems[2]!, allItems)).toBe(true);
    expect(isItemBlocked(createItem({ id: 'clean-item', dependsOn: ['done-item'] }), allItems)).toBe(false);
  });

  it('detects direct and transitive circular dependencies', () => {
    const items = [
      createItem({ dependsOn: ['item-b'], id: 'item-a' }),
      createItem({ dependsOn: ['item-c'], id: 'item-b' }),
      createItem({ id: 'item-c' }),
      createItem({ dependsOn: ['item-y'], id: 'item-x' }),
      createItem({ dependsOn: ['item-x'], id: 'item-y' }),
    ];

    expect(hasCircularDependency('item-c', ['item-a'], items)).toBe(true);
    expect(hasCircularDependency('item-b', ['item-b'], items)).toBe(true);
    expect(hasCircularDependency('item-c', ['item-y'], items)).toBe(false);
  });
});
