import type { Region } from "@grq/api-bindings";
import { normalizeState } from "./proxy-state.utils.ts";

/**
 * Orders the currently-used region keys by the user-defined region order
 * (sort_order from the regions table). Known region names come first in their
 * configured order; any leftover keys (e.g. "Unknown", or states that no
 * longer map to a region) are appended at the end. Drives the Daily Tasks
 * processing order. All matching is case-insensitive via normalized names.
 */
export function buildRegionProcessingOrder(
  regions: Region[],
  usedStateKeys: string[],
): string[] {
  const regionNamesInOrder = regions
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((r) => normalizeState(r.name));

  const usedSet = new Set(usedStateKeys.map((n) => normalizeState(n)));
  const known = regionNamesInOrder.filter((n) => usedSet.has(n));
  const leftovers = usedStateKeys
    .map((n) => normalizeState(n))
    .filter((n) => !regionNamesInOrder.includes(n));
  return [...known, ...leftovers];
}
