/**
 * Workshop / mod category helpers.
 *
 * Steam Workshop exposes tags like "campaign", "graphical", "mod".
 * User-editable categories are stored on Mod.categories (primary = [0]).
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

/** Pick the most meaningful workshop tag as default category (skip generic "mod"). */
export function getPrimaryWorkshopCategory(tags: string[]): string | null {
  if (tags.length === 0) return null;
  const meaningful = tags.filter(t => t.toLowerCase() !== "mod");
  return meaningful[0] ?? tags[0];
}

/** Display category: user override first, else workshop primary tag. */
export function getModCategory(mod: Pick<Mod, "categories" | "tags">): string | null {
  if (mod.categories?.[0]) return mod.categories[0];
  return getPrimaryWorkshopCategory(normalizeWorkshopTags(mod.tags));
}

/** Seed mod.categories from workshop tags when the user has not set one. */
export function seedModCategoryFromTags(mod: Mod): void {
  mod.tags = normalizeWorkshopTags(mod.tags);
  if (mod.categories?.length) return;
  const primary = getPrimaryWorkshopCategory(mod.tags);
  if (primary) mod.categories = [primary];
}

/** Collect all category strings in use across mods. */
export function collectCategoriesFromMods(mods: Mod[]): string[] {
  const set = new Set<string>();
  for (const mod of mods) {
    for (const c of mod.categories ?? []) {
      if (c.trim()) set.add(c.trim());
    }
    for (const t of normalizeWorkshopTags(mod.tags)) {
      set.add(t);
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}
