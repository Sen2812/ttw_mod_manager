import type { Mod } from "../types";

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
