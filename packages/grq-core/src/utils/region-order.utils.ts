import type { Region } from "@grq/api-bindings";

/**
 * Orders the currently-used region keys by the user-defined region order
 * (sort_order from the regions table). Known region names come first in their
 * configured order; any leftover keys (e.g. "Unknown", or states that no
 * longer map to a region) are appended at the end. Drives the Daily Tasks
 * processing order.
 */
export function buildRegionProcessingOrder(
  regions: Region[],
  usedStateKeys: string[],
): string[] {
  const regionNamesInOrder = regions
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((r) => r.name);

  const usedSet = new Set(usedStateKeys);
  const known = regionNamesInOrder.filter((n) => usedSet.has(n));
  const leftovers = usedStateKeys.filter((n) => !regionNamesInOrder.includes(n));
  return [...known, ...leftovers];
}
