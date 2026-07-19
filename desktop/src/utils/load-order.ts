import type { Mod } from "../types";
import { getEnabledModsInLoadOrder } from "@core/mod-manager/mod-sorting";

/** Enabled mod names in profile load-order (top → bottom). */
export function getEnabledModNames(mods: Mod[]): string[] {
  return getEnabledModsInLoadOrder(mods).map(m => m.name);
}

/** Reorder full mod list: place `modToMove` immediately above or below `targetMod`. */
export function reorderModRelative(
  mods: Mod[],
  modToMove: string,
  targetMod: string,
  position: "above" | "below",
): string[] {
  const names = mods.map(m => m.name);
  const fromIdx = names.indexOf(modToMove);
  const targetIdx = names.indexOf(targetMod);
  if (fromIdx === -1 || targetIdx === -1 || fromIdx === targetIdx) return names;

  names.splice(fromIdx, 1);
  let insertAt = names.indexOf(targetMod);
  if (position === "below") insertAt += 1;
  names.splice(insertAt, 0, modToMove);
  return names;
}

/** Reorder enabled mods only. */
export function reorderEnabledModRelative(
  mods: Mod[],
  modToMove: string,
  targetMod: string,
  position: "above" | "below",
): string[] {
  return reorderModRelative(getEnabledModsInLoadOrder(mods), modToMove, targetMod, position);
}

/** Swap one enabled mod up or down by one row. */
export function reorderEnabledModByStep(
  mods: Mod[],
  modName: string,
  direction: "up" | "down",
): string[] {
  const names = getEnabledModNames(mods);
  const idx = names.indexOf(modName);
  if (idx === -1) return names;
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= names.length) return names;
  [names[idx], names[swapIdx]] = [names[swapIdx], names[idx]];
  return names;
}

/** Place an enabled mod before `beforeModName`, or append when null. */
export function insertEnabledModInOrder(
  mods: Mod[],
  modName: string,
  beforeModName: string | null,
): string[] {
  const names = getEnabledModNames(mods);
  const existingIdx = names.indexOf(modName);
  if (existingIdx !== -1) names.splice(existingIdx, 1);
  if (beforeModName === null) {
    names.push(modName);
    return names;
  }
  const at = names.indexOf(beforeModName);
  names.splice(at >= 0 ? at : names.length, 0, modName);
  return names;
}
