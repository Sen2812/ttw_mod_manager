/**
 * CA Launcher Sync
 *
 * Reads/writes the official Creative Assembly launcher's moddata.dat file.
 * This is how Total War games (Warhammer 3 and later) actually discover
 * which mods to load — writing a `used_mods.txt` into the data folder does
 * NOT work for these titles.
 *
 * File location (Windows):
 *   %APPDATA%\The Creative Assembly\Launcher\<timestamp>-moddata.dat
 *
 * The file is a JSON array of mod entries:
 *   { uuid, order, active, game, packfile, name, short, category, owned }
 */

import * as fs from "fs";
import * as path from "path";
import { Mod } from "../types";

export interface LauncherModEntry {
  uuid: string;
  order: number;
  active: boolean;
  game: string;
  packfile: string;
  name: string;
  short: string;
  category: string;
  owned: boolean;
}

export type LogCallback = (msg: string) => void;

/** Filename suffix used by the CA launcher for its mod data. */
const MODDATA_SUFFIX = "-moddata.dat";

/** Resolve the default launcher folder for the current platform. */
export function getDefaultLauncherFolder(): string {
  const appData =
    process.env.APPDATA ||
    (process.env.HOME ? path.join(process.env.HOME, "AppData", "Roaming") : "");
  return path.join(appData, "The Creative Assembly", "Launcher");
}

/**
 * Find the moddata.dat file in the launcher folder.
 * The filename is prefixed with a build timestamp (e.g. `20190104-moddata.dat`),
 * so we match by suffix.
 */
export function findModDataFile(launcherFolder: string = getDefaultLauncherFolder()): string | undefined {
  try {
    const files = fs.readdirSync(launcherFolder);
    // Prefer the exact known name, then fall back to suffix matching.
    return (
      files.find((f) => f === "20190104" + MODDATA_SUFFIX) ??
      files.find((f) => f.endsWith(MODDATA_SUFFIX))
    );
  } catch {
    return undefined;
  }
}

/** Read CA launcher display names keyed by lowercased pack file name. */
export function readLauncherModNameIndex(
  launcherGameId: string,
  launcherFolder?: string,
): Map<string, { name: string; short?: string }> {
  const index = new Map<string, { name: string; short?: string }>();
  for (const entry of readLauncherData(launcherFolder)) {
    if (entry.game !== launcherGameId) continue;
    const name = entry.name?.trim();
    if (!name) continue;
    index.set(entry.uuid.toLowerCase(), {
      name,
      short: entry.short?.trim() || undefined,
    });
  }
  return index;
}

/** Read all entries from moddata.dat. Returns [] if the file doesn't exist. */
export function readLauncherData(
  launcherFolder: string = getDefaultLauncherFolder(),
): LauncherModEntry[] {
  const file = findModDataFile(launcherFolder);
  if (!file) return [];
  try {
    const raw = fs.readFileSync(path.join(launcherFolder, file), "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as LauncherModEntry[]) : [];
  } catch {
    return [];
  }
}

/** Write entries back to moddata.dat (atomic-ish: write then replace). */
export function writeLauncherData(
  entries: LauncherModEntry[],
  launcherFolder: string = getDefaultLauncherFolder(),
): string {
  const file =
    findModDataFile(launcherFolder) ?? "20190104" + MODDATA_SUFFIX;
  const fullPath = path.join(launcherFolder, file);
  const tmpPath = fullPath + ".tmp";
  fs.writeFileSync(tmpPath, JSON.stringify(entries), "utf8");
  fs.renameSync(tmpPath, fullPath);
  return fullPath;
}

export interface SyncResult {
  /** Existing entries whose active/order state changed. */
  updated: number;
  /** New entries added for mods the launcher hadn't indexed. */
  added: number;
  /** Total entries for this game after sync. */
  total: number;
  /** Path of the file that was written. */
  dataPath: string;
}

/**
 * Sync our mod state into the launcher's moddata.dat so the game actually
 * loads the enabled mods on next launch.
 *
 * Strategy:
 * - Existing entries for `launcherGameId` matching one of our mods are updated
 *   (active + order).
 * - Mods we know about that the launcher hasn't indexed are **added** as new
 *   entries (otherwise they would never load).
 * - Entries for the current game that we can't find on disk are left untouched
 *   (deactivating them could surprise users; the official launcher manages those).
 * - Entries for OTHER games are never modified.
 *
 * @param mods Full mod list (enabled state + load order from the manager).
 * @param launcherGameId Launcher game id, e.g. "warhammer3".
 */
export function syncModsToLauncher(
  mods: Mod[],
  launcherGameId: string,
  options: { launcherFolder?: string; log?: LogCallback } = {},
): SyncResult {
  const { launcherFolder, log } = options;
  const entries = readLauncherData(launcherFolder);

  const gameEntries = entries.filter((e) => e.game === launcherGameId);
  const otherEntries = entries.filter((e) => e.game !== launcherGameId);

  // Index existing entries for this game by lowercased uuid.
  // The launcher uses the lowercased pack filename as the uuid.
  const entryByKey = new Map<string, LauncherModEntry>();
  for (const e of gameEntries) entryByKey.set(e.uuid.toLowerCase(), e);

  const result: SyncResult = {
    updated: 0,
    added: 0,
    total: 0,
    dataPath: "",
  };

  // Walk our mods in array (load-order) order and assign sequential orders.
  mods.forEach((mod, index) => {
    const key = mod.name.toLowerCase();
    const existing = entryByKey.get(key);
    const newOrder = index + 1;

    if (existing) {
      const changed =
        existing.active !== mod.isEnabled || existing.order !== newOrder;
      if (changed) {
        existing.active = mod.isEnabled;
        existing.order = newOrder;
        // Keep the packfile path in sync (slash-normalised) in case the mod
        // moved folders.
        existing.packfile = normalizePath(mod.path);
        result.updated++;
      }
      entryByKey.delete(key); // mark as handled
    } else {
      // Mod the launcher hasn't seen — add it so the game can load it.
      gameEntries.push({
        uuid: key,
        order: newOrder,
        active: mod.isEnabled,
        game: launcherGameId,
        packfile: normalizePath(mod.path),
        name: mod.humanName || mod.name,
        short: "",
        category: "",
        owned: mod.isInData,
      });
      result.added++;
    }
  });

  // Remaining entries in entryByKey belong to this game but aren't in our
  // scan. Leave them untouched — they may be managed by the official launcher.

  result.dataPath = writeLauncherData([...otherEntries, ...gameEntries], launcherFolder);
  result.total = gameEntries.length;

  log?.(
    `Launcher sync (${launcherGameId}): ${result.updated} updated, ${result.added} added, ${result.total} total`,
  );
  return result;
}

/** Normalise a Windows path to forward-slash form used by the launcher. */
function normalizePath(p: string): string {
  return p.replace(/\\/g, "/");
}
