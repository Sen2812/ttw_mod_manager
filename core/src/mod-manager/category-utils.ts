/**
 * Workshop tag helpers — tags come from Steam API / workshop metadata only.
 */

import type { Mod } from "../types";

/** Normalize Steam API / local tag shapes to plain strings. */
export function normalizeWorkshopTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  const out: string[] = [];
  for (const t of tags) {
    if (typeof t === "string" && t.trim()) out.push(t.trim());
    else if (t && typeof t === "object" && "tag" in t) {
      const tag = String((t as { tag: string }).tag).trim();
      if (tag) out.push(tag);
    }
  }
  return [...new Set(out)];
}

/** Workshop tags for display (from mod.tags; skip generic "mod"). */
export function getModWorkshopTags(mod: Pick<Mod, "tags">): string[] {
  return normalizeWorkshopTags(mod.tags).filter(t => t.toLowerCase() !== "mod");
}

/** Normalize workshop tags and drop legacy user category fields. */
export function normalizeModTagFields(mod: Mod): void {
  mod.tags = normalizeWorkshopTags(mod.tags);
  delete mod.categories;
}

/** Collect workshop tags across mods (e.g. for filters). */
export function collectWorkshopTagsFromMods(mods: Mod[]): string[] {
  const set = new Set<string>();
  for (const mod of mods) {
    for (const t of getModWorkshopTags(mod)) set.add(t);
  }
  return [...set].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

/** @deprecated Use normalizeModTagFields */
export function seedModCategoryFromTags(mod: Mod): void {
  normalizeModTagFields(mod);
}

/** @deprecated Use collectWorkshopTagsFromMods */
export function collectCategoriesFromMods(mods: Mod[]): string[] {
  return collectWorkshopTagsFromMods(mods);
}
