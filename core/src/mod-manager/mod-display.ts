/**
 * Workshop display-name helpers.
 */

import type { Mod } from "../types";

/** Reject Steam error/login placeholder pages and bare numeric IDs. */
export function isUsableWorkshopTitle(
  title: string | undefined,
  workshopId: string,
): title is string {
  const t = title?.trim();
  if (!t) return false;
  if (t === workshopId) return false;
  if (/^steam community :: error$/i.test(t)) return false;
  if (/^steam workshop$/i.test(t)) return false;
  if (/^login$/i.test(t)) return false;
  // Cached/API rows sometimes store the numeric ID as the title.
  if (/^\d{5,15}$/.test(t) && /^\d{5,15}$/.test(workshopId)) return false;
  return true;
}

/** Preferred UI label: workshop title → pack file stem. */
export function getModDisplayName(mod: Pick<Mod, "humanName" | "name" | "workshopId">): string {
  if (isUsableWorkshopTitle(mod.humanName, mod.workshopId)) return mod.humanName.trim();
  return mod.name.replace(/\.pack$/i, "");
}

/** Apply a workshop title when it passes validation. */
export function applyWorkshopTitle(mod: Mod, title: string | undefined): boolean {
  if (!isUsableWorkshopTitle(title, mod.workshopId)) return false;
  mod.humanName = title.trim();
  return true;
}

/** Whether the mod lives under the game data/ tree (local pack, not Workshop content). */
export function isLocalMod(mod: Pick<Mod, "isInData">): boolean {
  return mod.isInData === true;
}

export type ModSourceType = "local" | "workshop";

/** Local packs in data/modding vs Steam Workshop content folder. */
export function getModSourceType(mod: Pick<Mod, "isInData">): ModSourceType {
  return isLocalMod(mod) ? "local" : "workshop";
}

/** Resolve a mod's numeric Steam Workshop ID from workshopId or pack file name. */
export function resolveModWorkshopId(mod: Pick<Mod, "workshopId" | "name">): string | undefined {
  const workshopId = mod.workshopId;
  if (/^\d{5,15}$/.test(workshopId)) return workshopId;
  const fromName = mod.name.match(/^(\d{5,15})\.pack$/i);
  if (fromName) return fromName[1];
  const fromWorkshopField = /^(\d{5,15})\.pack$/i.exec(workshopId);
  if (fromWorkshopField) return fromWorkshopField[1];
  return undefined;
}
