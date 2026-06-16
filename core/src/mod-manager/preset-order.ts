/**
 * Profile load-order export / import.
 */

import type { Mod } from "../types";
import { sortByLoadOrder } from "./mod-sorting";

export const PROFILE_ORDER_VERSION = 1 as const;

export interface ProfileOrderEntry {
  /** Pack file name, e.g. "my_mod.pack". */
  name: string;
  workshopId?: string;
  isEnabled: boolean;
}

export interface ProfileOrderFile {
  version: typeof PROFILE_ORDER_VERSION;
  gameId: string;
  profileName: string;
  exportedAt: number;
  /** Top → bottom display / load order (lower priority → higher priority). */
  mods: ProfileOrderEntry[];
}

export interface ImportProfileOrderResult {
  applied: number;
  skipped: number;
  skippedNames: string[];
}

/** Build export JSON from the current mod list (top-to-bottom load order). */
export function exportProfileOrder(
  mods: Mod[],
  gameId: string,
  profileName: string,
): ProfileOrderFile {
  const ordered = sortByLoadOrder(mods);
  return {
    version: PROFILE_ORDER_VERSION,
    gameId,
    profileName,
    exportedAt: Date.now(),
    mods: ordered.map(m => ({
      name: m.name,
      workshopId: m.workshopId && !m.isInData ? m.workshopId : undefined,
      isEnabled: m.isEnabled,
    })),
  };
}

function findModForEntry(mods: Mod[], entry: ProfileOrderEntry): Mod | undefined {
  const byName = mods.find(m => m.name.toLowerCase() === entry.name.toLowerCase());
  if (byName) return byName;
  if (entry.workshopId) {
    return mods.find(m => m.workshopId === entry.workshopId);
  }
  return undefined;
}

/**
 * Apply load order + enabled state from an export file.
 * Skips entries whose pack is not installed locally.
 */
export function importProfileOrder(
  mods: Mod[],
  file: ProfileOrderFile,
): ImportProfileOrderResult {
  const skippedNames: string[] = [];
  let applied = 0;

  for (let i = 0; i < file.mods.length; i++) {
    const entry = file.mods[i];
    const mod = findModForEntry(mods, entry);
    if (!mod) {
      skippedNames.push(entry.name);
      continue;
    }

    mod.isEnabled = entry.isEnabled;
    mod.loadOrder = i;
    applied++;
  }

  sortByLoadOrder(mods);
  return {
    applied,
    skipped: skippedNames.length,
    skippedNames,
  };
}
