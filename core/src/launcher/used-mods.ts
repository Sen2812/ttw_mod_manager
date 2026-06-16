/**
 * used_mods.txt Generator
 *
 * Generates the content of the `used_mods.txt` file that Total War games read
 * when launched with it as a command-line argument:
 *
 *   Warhammer3.exe used_mods.txt;
 *
 * The file tells the game which mods to load and in what order. Mods listed
 * later override (take priority over) mods listed earlier.
 *
 * Format:
 *   add_working_directory "D:/path/to/mod/folder";
 *   mod "mod_file_name.pack";
 *
 * - `add_working_directory` tells the game to look for packs in an extra folder
 *   (needed for Workshop mods that live outside the game's data/ folder).
 * - `mod` entries reference pack files by name; the game resolves them via the
 *   data folder + any added working directories.
 */

import * as path from "path";
import { Mod } from "../types";

export interface UsedModsContent {
  /** The text to write into used_mods.txt. */
  text: string;
  /** Mods that live in data/modding/ and must be copied into data/ first. */
  modsToCopyToData: Mod[];
}

/**
 * Sort enabled mods into the order they should be loaded.
 *
 * Load order semantics: lower loadOrder = loaded earlier = lower priority.
 * Mods without an explicit loadOrder fall back to alphabetical order.
 */
function sortByLoadOrderAscending(mods: Mod[]): Mod[] {
  return [...mods].sort((a, b) => {
    const loa = a.loadOrder ?? Number.MAX_SAFE_INTEGER;
    const lob = b.loadOrder ?? Number.MAX_SAFE_INTEGER;
    if (loa !== lob) return loa - lob;
    return a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1;
  });
}

/**
 * Generate the content for used_mods.txt.
 *
 * @param enabledMods  All enabled mods (will be filtered & sorted internally).
 * @param dataFolder   Absolute path to the game's data/ folder. Mods that
 *                     already live here don't need `add_working_directory`.
 * @param isLinux      On Linux (Proton), paths need a `Z:` prefix.
 */
export function generateUsedModsContent(
  enabledMods: Mod[],
  dataFolder: string,
  isLinux: boolean = false,
): UsedModsContent {
  const sorted = sortByLoadOrderAscending(enabledMods);

  // Mods in data/modding/ need to be copied to data/ before launch.
  const modsToCopyToData = sorted.filter((mod) => mod.isInModding);

  // Mods that need an add_working_directory entry:
  // - NOT in modding/ (those are copied to data/ instead)
  // - NOT already inside data/ (path.relative returns "" when same dir)
  const modsNeedingWorkDir = sorted.filter((mod) => {
    if (mod.isInModding) return false;
    if (!mod.modDirectory) return false;
    try {
      return path.relative(dataFolder, mod.modDirectory) !== "";
    } catch {
      return true;
    }
  });

  const prefix = isLinux ? "Z:" : "";

  const lines: string[] = [];

  // 1. Working directories first (so the game knows where to find packs)
  for (const mod of modsNeedingWorkDir) {
    const dir = mod.modDirectory.replace(/\\/g, "/");
    lines.push(`add_working_directory "${prefix}${dir}";`);
  }

  // 2. All mod entries in load order
  for (const mod of sorted) {
    lines.push(`mod "${mod.name}";`);
  }

  return {
    text: lines.join("\n"),
    modsToCopyToData,
  };
}
