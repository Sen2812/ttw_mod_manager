import type { FileConflict } from "../types";

export type CompatCategory = "db" | "script" | "loc";

const DISPLAY_CATEGORIES: CompatCategory[] = ["db", "script", "loc"];

/** Count db/script/loc files in conflicts involving both mods. */
export function countSharedConflictCategories(
  files: FileConflict[],
  modA: string,
  modB: string,
): Record<CompatCategory, number> {
  const counts: Record<CompatCategory, number> = { db: 0, script: 0, loc: 0 };
  for (const file of files) {
    const names = file.participants.map(p => p.modName);
    if (!names.includes(modA) || !names.includes(modB)) continue;
    if (file.category === "db" || file.category === "script" || file.category === "loc") {
      counts[file.category] += 1;
    }
  }
  return counts;
}

export function formatCategoryBadges(counts: Record<CompatCategory, number>): CompatCategory[] {
  return DISPLAY_CATEGORIES.filter(cat => counts[cat] > 0);
}

export { DISPLAY_CATEGORIES };
