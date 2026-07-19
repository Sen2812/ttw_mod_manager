import { collectWorkshopTagsFromMods, getModWorkshopTags } from "@core/mod-manager/category-utils";
import { getModDisplayName, getModSourceType, type ModSourceType } from "@core/mod-manager/mod-display";
import type { Mod } from "../types";

export type ModSourceFilter = "all" | ModSourceType;

export interface ModListFilterState {
  query: string;
  source: ModSourceFilter;
  /** Empty string = all tags. */
  tag: string;
}

export const DEFAULT_MOD_LIST_FILTERS: ModListFilterState = {
  query: "",
  source: "all",
  tag: "",
};

export function hasActiveModFilters(filters: ModListFilterState): boolean {
  return !!filters.query.trim() || filters.source !== "all" || !!filters.tag;
}

export function collectModFilterTags(mods: Mod[]): string[] {
  return collectWorkshopTagsFromMods(mods);
}

export function matchesModFilters(
  mod: Mod,
  filters: ModListFilterState,
  options: { tagLabel?: (tag: string) => string } = {},
): boolean {
  if (filters.source !== "all" && getModSourceType(mod) !== filters.source) {
    return false;
  }

  if (filters.tag && !getModWorkshopTags(mod).includes(filters.tag)) {
    return false;
  }

  const q = filters.query.trim().toLowerCase();
  if (!q) return true;

  const haystack = [
    mod.name,
    mod.humanName,
    mod.workshopId,
    getModDisplayName(mod),
    ...getModWorkshopTags(mod),
  ];
  if (options.tagLabel) {
    for (const tag of getModWorkshopTags(mod)) {
      haystack.push(options.tagLabel(tag));
    }
  }

  return haystack.some(value => (value ?? "").toLowerCase().includes(q));
}

export function filterMods(
  mods: Mod[],
  filters: ModListFilterState,
  options: { tagLabel?: (tag: string) => string } = {},
): Mod[] {
  if (!hasActiveModFilters(filters)) return mods;
  return mods.filter(mod => matchesModFilters(mod, filters, options));
}
