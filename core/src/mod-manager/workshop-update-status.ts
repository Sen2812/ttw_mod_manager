/**
 * Browser-safe workshop update status helpers (no Node.js imports).
 */

import type { Mod } from "../types";
import type { WorkshopItemData } from "./workshop-cache";
import { resolveModWorkshopId } from "./mod-display";

/** Allow small clock / filesystem skew when comparing timestamps. */
export const UPDATE_TIME_TOLERANCE_MS = 60_000;

export type ModUpdateStatus = "ok" | "outdated" | "unknown" | "downloading";

/** Whether a workshop mod's local copy is older than the latest workshop version. */
export function getModUpdateStatus(
  mod: Pick<Mod, "workshopId" | "isInData" | "lastChanged" | "lastChangedLocal" | "pendingDownload">,
): ModUpdateStatus {
  if (mod.pendingDownload) return "downloading";
  if (mod.isInData || !mod.workshopId) return "ok";
  if (!mod.lastChanged || !mod.lastChangedLocal) return "unknown";
  return mod.lastChanged > mod.lastChangedLocal + UPDATE_TIME_TOLERANCE_MS ? "outdated" : "ok";
}

export function isModOutdated(mod: Mod): boolean {
  return getModUpdateStatus(mod) === "outdated";
}

export function countOutdatedMods(mods: Mod[]): number {
  return mods.filter(isModOutdated).length;
}

/** Apply cached workshop `timeUpdated` values onto mod.lastChanged. */
export function applyWorkshopTimeUpdatedToMods(
  mods: Mod[],
  data: Map<string, WorkshopItemData>,
): void {
  for (const mod of mods) {
    const workshopId = resolveModWorkshopId(mod);
    if (!workshopId || mod.isInData) continue;
    const entry = data.get(workshopId);
    if (entry?.timeUpdated) mod.lastChanged = entry.timeUpdated;
  }
}
