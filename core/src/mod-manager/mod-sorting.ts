/**
 * Mod Sorting & Filtering
 *
 * Sorting strategies and filtering utilities for mod lists.
 * Pure functions, no side effects.
 */

import { Mod } from "../types";

const collator = new Intl.Collator("en");

// ─── Sorting Strategies ───────────────────────────────────────────────────────

/**
 * Sort mods by name (case-insensitive).
 */
export function sortByName(mods: Mod[]): Mod[] {
  return [...mods].sort((a, b) => compareModNames(a.name, b.name));
}

/**
 * Enabled mods in UI display order (top → bottom, low → high priority).
 */
export function getEnabledModsInLoadOrder(mods: Mod[]): Mod[] {
  return sortByLoadOrder(mods.filter((m) => m.isEnabled));
}

/**
 * Map a UI list index to CA launcher moddata `order`.
 * In moddata, lower order = higher priority (top of the official launcher list).
 * Our UI puts higher-priority mods at the bottom, so the mapping is inverted.
 */
export function toCaLauncherOrder(uiIndex: number, modCount: number): number {
  return modCount - uiIndex;
}

/**
 * Sort mods respecting explicit load order (ascending):
 * - Mods with loadOrder=0 are placed at the top, loadOrder=1 next, etc.
 * - Mods without loadOrder are sorted alphabetically to fill the gaps.
 *
 * Display semantics:
 *   top of list  = lowest priority (gets overwritten in-game)
 *   bottom of list = highest priority (overwrites above)
 */
export function sortByLoadOrder(mods: Mod[]): Mod[] {
  const sorted = sortByName(mods);
  const ordered = sorted
    .filter((m) => m.loadOrder != null)
    .sort((a, b) => (a.loadOrder as number) - (b.loadOrder as number)); // Ascending: low loadOrder first

  if (ordered.length === 0) return sorted;

  const orderedSet = new Set(ordered);
  const unordered = sorted.filter((m) => !orderedSet.has(m));
  const result: Mod[] = [];
  let unorderedIdx = 0;
  let orderedIdx = 0;

  while (result.length < sorted.length) {
    // Place any ordered mods whose loadOrder <= current position.
    while (
      orderedIdx < ordered.length &&
      (ordered[orderedIdx].loadOrder as number) <= result.length
    ) {
      result.push(ordered[orderedIdx]);
      orderedIdx++;
    }
    if (result.length >= sorted.length) break;
    // Fill the gap with the next alphabetical unordered mod.
    if (unorderedIdx < unordered.length) {
      result.push(unordered[unorderedIdx]);
      unorderedIdx++;
      continue;
    }
    // No more unordered mods; append remaining ordered ones.
    result.push(ordered[orderedIdx]);
    orderedIdx++;
  }

  return result;
}

/**
 * Sort mods to match the order in a preset.
 * Mods not in the preset are appended alphabetically.
 */
export function sortAsInPreset(mods: Mod[], presetMods: Mod[]): Mod[] {
  const indexMap = new Map(presetMods.map((m, i) => [m.name, i]));
  return [...mods].sort((a, b) => {
    const ia = indexMap.get(a.name) ?? -1;
    const ib = indexMap.get(b.name) ?? -1;
    if (ia !== -1 && ib !== -1) return ia - ib;
    return compareModNames(a.name, b.name);
  });
}

/** Sort by human-readable name */
export function sortByHumanName(mods: Mod[]): Mod[] {
  return [...mods].sort((a, b) => collator.compare(a.humanName, b.humanName));
}

/** Sort by human name, falling back to internal name */
export function sortByHumanNameOrName(mods: Mod[]): Mod[] {
  return [...mods].sort((a, b) => {
    const nameA = a.humanName || a.name;
    const nameB = b.humanName || b.name;
    return collator.compare(nameA, nameB);
  });
}

/** Sort by enabled status (enabled first), then by name */
export function sortByEnabled(mods: Mod[]): Mod[] {
  return [...mods].sort((a, b) => {
    if (a.isEnabled !== b.isEnabled) return a.isEnabled ? -1 : 1;
    return compareModNames(a.name, b.name);
  });
}

/** Sort by author name */
export function sortByAuthor(mods: Mod[]): Mod[] {
  return [...mods].sort((a, b) => {
    if (a.author === b.author) return compareModNames(a.name, b.name);
    return collator.compare(a.author, b.author);
  });
}

/** Sort by file size ascending */
export function sortBySize(mods: Mod[]): Mod[] {
  return [...mods].sort((a, b) => (a.size ?? 0) - (b.size ?? 0));
}

/** Sort by last updated time (most recent first) */
export function sortByLastUpdated(mods: Mod[]): Mod[] {
  return [...mods].sort((a, b) => {
    const ta = a.lastChanged ?? a.lastChangedLocal;
    const tb = b.lastChanged ?? b.lastChangedLocal;
    if (ta === undefined && tb === undefined) return 0;
    if (ta === undefined) return 1;
    if (tb === undefined) return -1;
    return tb - ta;
  });
}

/** Sort by subscription time (most recent first) */
export function sortBySubscribedTime(mods: Mod[]): Mod[] {
  return [...mods].sort((a, b) => {
    const ta = a.subbedTime ?? a.lastChanged ?? a.lastChangedLocal;
    const tb = b.subbedTime ?? b.lastChanged ?? b.lastChangedLocal;
    if (ta === undefined && tb === undefined) return 0;
    if (ta === undefined) return 1;
    if (tb === undefined) return -1;
    return tb - ta;
  });
}

// ─── Filtering ────────────────────────────────────────────────────────────────

/**
 * Filter mods by a search string.
 * Supports substring matching on name, human name, and optionally author.
 * Supports regex when the filter is wrapped in slashes, e.g. /pattern/
 */
export function filterMods(
  mods: Mod[],
  filter: string,
  includeAuthor = false,
): Mod[] {
  if (!filter) return mods;

  // Regex mode: /pattern/
  if (filter.startsWith("/") && filter.endsWith("/") && filter.length > 2) {
    const pattern = filter.slice(1, -1);
    try {
      const regex = new RegExp(pattern, "i");
      return mods.filter(
        (m) =>
          regex.test(m.name.replace(".pack", "")) ||
          (m.humanName && regex.test(m.humanName)) ||
          (includeAuthor && regex.test(m.author)),
      );
    } catch {
      // Fall back to substring if regex is invalid
    }
  }

  const needle = filter.toLowerCase();
  return mods.filter(
    (m) =>
      m.name.replace(".pack", "").toLowerCase().includes(needle) ||
      (m.humanName && m.humanName.toLowerCase().includes(needle)) ||
      (includeAuthor && m.author.toLowerCase().includes(needle)),
  );
}

// ─── Utilities ────────────────────────────────────────────────────────────────

/** Compare two mod names (case-insensitive character-by-character) */
export function compareModNames(a: string, b: string): number {
  a = a.toLowerCase();
  b = b.toLowerCase();
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    if (i === a.length) return 1;
    if (i === b.length) return -1;
    const diff = a.charCodeAt(i) - b.charCodeAt(i);
    if (diff !== 0) return diff < 0 ? -1 : 1;
  }
  return 0;
}

/** Deduplicate mods: keep inData versions when a content version also exists */
export function deduplicateDataContent(mods: Mod[]): Mod[] {
  const inDataNames = new Set(mods.filter((m) => m.isInData).map((m) => m.name));
  return mods.filter((m) => m.isInData || !inDataNames.has(m.name));
}

/**
 * Find duplicate load orders and adjust them.
 * Uses iterative approach to avoid stack overflow.
 */
export function adjustDuplicateLoadOrders(mods: Mod[], keepOrderMod: Mod): void {
  const ordered = mods
    .filter((m) => m.loadOrder != null)
    .sort((a, b) => (a.loadOrder as number) - (b.loadOrder as number));

  const processed = new Set<string>();
  
  for (const mod of ordered) {
    if (processed.has(mod.name)) continue;
    
    const duplicates = ordered.filter(
      (m) => m.name !== mod.name && m.loadOrder === mod.loadOrder && !processed.has(m.name)
    );
    
    for (const duplicate of duplicates) {
      if (duplicate !== keepOrderMod) {
        duplicate.loadOrder = (duplicate.loadOrder as number) + 1;
        processed.add(duplicate.name);
      }
    }
  }
}
