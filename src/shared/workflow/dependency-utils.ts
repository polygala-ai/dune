// Workflow dependency helpers shared by the renderer and main process.

/** Minimal work-item shape needed for dependency checks. */
export interface DependencyWorkItem {
  dependsOn?: string[] | undefined;
  id: string;
  status: string;
}

const resolvedDependencyStatuses = new Set(['acceptance', 'done']);

/** Normalizes dependency ids by trimming, deduping, and dropping empty entries. */
export function normalizeDependencyIds(dependsOn: readonly string[] | null | undefined): string[] | undefined {
  if (!dependsOn || dependsOn.length === 0) {
    return undefined;
  }

  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const dependencyId of dependsOn) {
    const nextId = dependencyId.trim();

    if (!nextId || seen.has(nextId)) {
      continue;
    }

    seen.add(nextId);
    normalized.push(nextId);
  }

  return normalized.length > 0 ? normalized : undefined;
}

/** Returns whether a dependency item is considered resolved. */
export function isDependencyResolved(item: Pick<DependencyWorkItem, 'status'> | null | undefined): boolean {
  return !!item && resolvedDependencyStatuses.has(item.status);
}

/** Returns unresolved dependency ids for the item. */
export function getUnresolvedDependencyIds(
  item: Pick<DependencyWorkItem, 'dependsOn'>,
  allItems: readonly DependencyWorkItem[],
): string[] {
  const dependencyIds = normalizeDependencyIds(item.dependsOn);

  if (!dependencyIds) {
    return [];
  }

  const itemsById = new Map(allItems.map((candidate) => [candidate.id, candidate] as const));

  return dependencyIds.filter((dependencyId) => !isDependencyResolved(itemsById.get(dependencyId)));
}

/** Returns whether the item has any unresolved dependencies. */
export function isItemBlocked(
  item: Pick<DependencyWorkItem, 'dependsOn'>,
  allItems: readonly DependencyWorkItem[],
): boolean {
  return getUnresolvedDependencyIds(item, allItems).length > 0;
}

/** Returns whether the proposed dependency set would create a cycle. */
export function hasCircularDependency(
  itemId: string,
  proposedDeps: readonly string[],
  allItems: readonly DependencyWorkItem[],
): boolean {
  const normalizedDeps = normalizeDependencyIds(proposedDeps);

  if (!normalizedDeps) {
    return false;
  }

  const itemsById = new Map(allItems.map((item) => [item.id, item] as const));
  const visiting = new Set<string>();
  const visited = new Set<string>();

  const visit = (currentId: string): boolean => {
    if (currentId === itemId) {
      return true;
    }

    if (visiting.has(currentId) || visited.has(currentId)) {
      return false;
    }

    visiting.add(currentId);

    const current = itemsById.get(currentId);
    const nextDependencies = normalizeDependencyIds(current?.dependsOn);

    if (nextDependencies) {
      for (const dependencyId of nextDependencies) {
        if (visit(dependencyId)) {
          return true;
        }
      }
    }

    visiting.delete(currentId);
    visited.add(currentId);
    return false;
  };

  return normalizedDeps.some((dependencyId) => visit(dependencyId));
}
