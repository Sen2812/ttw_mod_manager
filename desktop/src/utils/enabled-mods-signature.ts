import type { Mod } from "../types";

/** Stable key for enabled-mod load order — used to cache overwrite analysis. */
export function enabledModsSignature(mods: Mod[]): string {
  return mods
    .filter(m => m.isEnabled)
    .sort((a, b) => (a.loadOrder ?? 0) - (b.loadOrder ?? 0))
    .map(m => `${m.name}:${m.loadOrder ?? 0}`)
    .join("|");
}
