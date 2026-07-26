/**
 * Mod Discovery
 *
 * Scans game directories to find installed mods.
 * Works with real filesystem using Node.js fs.
 */

import * as fs from "fs";
import * as path from "path";
import * as https from "https";
import { GameDefinition, GameFolderPaths, Mod } from "../types";
import { readPackHeader, NodeBinaryReader } from "../pack-file";
import { lookupLauncherModName, readLauncherModNameIndex } from "../launcher/launcher-sync";
import { formatSteamFetchSkipReason, isSteamIpcUnavailableError } from "./steam-ipc-error";
import { fetchWorkshopRequiredIds } from "./workshop-required-fetcher";
import { sleep } from "./workshop-dependencies";
import { fetchSubscribedWorkshopIds } from "./workshop-subscriptions-fetcher";
import { applyWorkshopTitle, isUsableWorkshopTitle, resolveModWorkshopId } from "./mod-display";
export { resolveModWorkshopId } from "./mod-display";
import {
  WorkshopCache,
  REQUIRED_IDS_CACHE_GENERATION,
  type WorkshopItemData,
  type WorkshopFetchMode,
} from "./workshop-cache";
import { normalizeWorkshopTags } from "./category-utils";
import { applyWorkshopTimeUpdatedToMods } from "./workshop-update-status";

export type { WorkshopItemData, WorkshopFetchMode };
export { WorkshopCache, METADATA_TTL_MS, REQUIRED_IDS_TTL_MS, REQUIRED_IDS_CACHE_GENERATION } from "./workshop-cache";

const PACK_SCAN_CONCURRENCY = 12;

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R | null | undefined>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const results: R[] = [];
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const i = nextIndex++;
      const value = await fn(items[i]);
      if (value != null) results.push(value);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

export type LogCallback = (msg: string) => void;

/** Delay between Steam Web API batches to avoid burst traffic. */
const API_BATCH_DELAY_MS = 1200;

function isNumericWorkshopId(id: string | undefined): id is string {
  return !!id && /^\d{5,15}$/.test(id);
}

/** Workshop item IDs to resolve prerequisites for (mods + subscribed content folders). */
function collectWorkshopItemIds(mods: Mod[], subscribedWorkshopIds: string[]): string[] {
  const ids = [
    ...mods.map(m => resolveModWorkshopId(m)).filter(isNumericWorkshopId),
    ...subscribedWorkshopIds.filter(isNumericWorkshopId),
  ];
  return [...new Set(ids)];
}

// ─── Steam Workshop API ──────────────────────────────────────────────────────

/**
 * Fetch mod metadata from Steam Web API in batches.
 * Uses ISteamRemoteStorage/GetPublishedFileDetails endpoint.
 * Caller should only pass IDs not already present in the local cache.
 */
export async function fetchWorkshopMetadata(
  workshopIds: string[],
  log?: LogCallback,
): Promise<Map<string, WorkshopItemData>> {
  const result = new Map<string, WorkshopItemData>();

  if (workshopIds.length === 0) return result;

  log?.(`Steam API: fetching metadata for ${workshopIds.length} Workshop item(s)...`);

  const batchSize = 50;
  for (let i = 0; i < workshopIds.length; i += batchSize) {
    if (i > 0) await sleep(API_BATCH_DELAY_MS);
    const batch = workshopIds.slice(i, i + batchSize);

    try {
      const formData = new URLSearchParams();
      formData.append("itemcount", batch.length.toString());
      batch.forEach((id, idx) => {
        formData.append(`publishedfileids[${idx}]`, id);
      });

      const data = await new Promise<WorkshopItemData[]>((resolve, reject) => {
        const postData = formData.toString();
        const options = {
          hostname: "api.steampowered.com",
          path: "/ISteamRemoteStorage/GetPublishedFileDetails/v1/",
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "Content-Length": Buffer.byteLength(postData),
          },
        };

        const req = https.request(options, (res) => {
          let body = "";
          res.on("data", (chunk) => { body += chunk; });
          res.on("end", () => {
            try {
              const parsed = JSON.parse(body);
              resolve(parsed?.response?.publishedfiledetails || []);
            } catch (e) {
              reject(e);
            }
          });
        });

        req.on("error", reject);
        req.write(postData);
        req.end();
      });

      for (const item of data) {
        if (!item.publishedfileid) continue;
        const raw = item as WorkshopItemData & {
          result?: number;
          time_updated?: number | string;
          consumer_app_id?: number;
          preview_url?: string;
        };
        const resultCode = raw.result ?? 1;
        if (resultCode !== 1) {
          result.set(item.publishedfileid, {
            publishedfileid: item.publishedfileid,
            apiResult: resultCode,
          });
          continue;
        }
        const timeUpdated = raw.time_updated != null
          ? Number(raw.time_updated) * 1000
          : undefined;
        const previewUrl = typeof raw.preview_url === "string" && raw.preview_url.trim()
          ? raw.preview_url.trim()
          : undefined;
        if (!item.title && timeUpdated === undefined && !previewUrl) continue;
        result.set(item.publishedfileid, {
          publishedfileid: item.publishedfileid,
          title: item.title,
          tags: item.tags,
          creator: item.creator,
          timeUpdated,
          previewUrl,
          consumerAppId: raw.consumer_app_id != null ? Number(raw.consumer_app_id) : undefined,
        });
      }

      log?.(`  Steam API batch ${Math.floor(i / batchSize) + 1} done`);
    } catch (e) {
      log?.(`  Steam API batch error: ${e}`);
    }
  }

  log?.(`Steam API: received metadata for ${result.size} item(s)`);
  return result;
}

function isUnavailableWorkshopEntry(entry: WorkshopItemData | undefined): boolean {
  if (!entry) return false;
  if (entry.metadataUnavailable) return true;
  return entry.apiResult !== undefined && entry.apiResult !== 1;
}

/** Drop required mod IDs that Steam reports as removed or inaccessible. */
function filterRequiredIdsFromCache(requiredIds: string[], cache: WorkshopCache): string[] {
  return requiredIds.filter(id => !isUnavailableWorkshopEntry(cache.get(id)));
}

/** Resolve availability via cache + Steam Web API, then return valid required IDs only. */
async function validateRequiredWorkshopIds(
  requiredIds: string[],
  cacheDir: string,
  cache: WorkshopCache,
  log?: LogCallback,
): Promise<string[]> {
  const unique = [...new Set(requiredIds)];
  if (unique.length === 0) return [];

  const needsCheck = unique.filter(id => {
    const entry = cache.get(id);
    if (!entry) return true;
    if (isUnavailableWorkshopEntry(entry)) return false;
    if (entry.metadataFetchedAt !== undefined) return false;
    if (entry.title) return false;
    return true;
  });

  if (needsCheck.length > 0) {
    await getWorkshopMetadata(needsCheck, cacheDir, log, "routine", cache);
  }

  const valid = unique.filter(id => !isUnavailableWorkshopEntry(cache.get(id)));
  const removed = unique.length - valid.length;
  if (removed > 0) {
    log?.(`Workshop required mods: removed ${removed} unavailable item(s)`);
  }
  return valid;
}

/** Seed cache from locally available mod info to avoid API calls. */
function seedCacheFromLocalMods(mods: Mod[], cache: WorkshopCache): void {
  const seeds: [string, Partial<WorkshopItemData>][] = [];
  for (const mod of mods) {
    const workshopId = resolveModWorkshopId(mod);
    if (!workshopId || mod.isInData || cache.has(workshopId)) continue;
    if (!isUsableWorkshopTitle(mod.humanName, workshopId) && !mod.author) continue;
    seeds.push([workshopId, { title: mod.humanName || undefined, creator: mod.author || undefined }]);
  }
  if (seeds.length > 0) cache.mergeMetadata(seeds);
}

/**
 * Load cache and fetch metadata only for IDs that are genuinely missing.
 * Pass `existing` to reuse an in-memory cache (avoids redundant disk I/O).
 */
export async function getWorkshopMetadata(
  workshopIds: string[],
  cacheDir: string,
  log?: LogCallback,
  mode: WorkshopFetchMode = "routine",
  existing?: WorkshopCache,
): Promise<Map<string, WorkshopItemData>> {
  const cache = existing ?? new WorkshopCache(cacheDir).load(log);
  const needsFetch = cache.idsNeedingMetadata(workshopIds, mode);

  if (needsFetch.length === 0) {
    if (workshopIds.length > 0) {
      log?.(`Workshop metadata: ${workshopIds.length} item(s) served from cache (no API calls)`);
    }
    return cache.asMap();
  }

  log?.(
    `Workshop metadata: ${needsFetch.length} new/stale, `
    + `${workshopIds.length - needsFetch.length} from cache`,
  );
  const fetched = await fetchWorkshopMetadata(needsFetch, log);
  const patches: [string, Partial<WorkshopItemData>][] = [];
  for (const [id, data] of fetched) {
    if (data.apiResult && data.apiResult !== 1) {
      cache.setMetadataUnavailable(id, data.apiResult);
      continue;
    }
    patches.push([id, data]);
  }
  cache.mergeMetadata(patches);
  cache.save();
  return cache.asMap();
}

/**
 * Refresh workshop `time_updated` for mods and apply to mod.lastChanged.
 * Also re-stat local pack mtimes so post-download / manual checks clear "outdated"
 * without requiring a full rescan.
 * Uses cache TTL unless `force` is true (manual check).
 */
export async function checkWorkshopUpdates(
  mods: Mod[],
  cacheDir: string,
  log?: LogCallback,
  force = false,
  existing?: WorkshopCache,
): Promise<void> {
  const workshopIds = [...new Set(
    mods.filter(m => m.workshopId && !m.isInData).map(m => m.workshopId),
  )];
  if (workshopIds.length === 0) return;

  refreshLocalPackTimestamps(mods);

  const cache = existing ?? new WorkshopCache(cacheDir).load(log);
  const needsFetch = force ? workshopIds : cache.idsNeedingUpdateCheck(workshopIds);

  if (needsFetch.length === 0) {
    applyWorkshopTimeUpdatedToMods(mods, cache.asMap());
    log?.(`Workshop update check: ${workshopIds.length} item(s) from cache`);
    return;
  }

  log?.(
    `Workshop update check: fetching ${needsFetch.length} item(s) `
    + `(${workshopIds.length - needsFetch.length} cached)`,
  );
  const fetched = await fetchWorkshopMetadata(needsFetch, log);
  cache.mergeUpdateTimes(
    [...fetched.entries()].map(([id, data]) => [id, { timeUpdated: data.timeUpdated }]),
  );
  cache.save();
  applyWorkshopTimeUpdatedToMods(mods, cache.asMap());
  log?.("Workshop update check complete");
}

/** Re-read pack file mtime/size from disk into mod.lastChangedLocal / size. */
export function refreshLocalPackTimestamps(mods: Mod[]): number {
  let updated = 0;
  for (const mod of mods) {
    if (!mod.path || mod.pendingDownload) continue;
    try {
      if (!fs.existsSync(mod.path)) continue;
      const stats = fs.statSync(mod.path);
      if (mod.lastChangedLocal !== stats.mtimeMs || mod.size !== stats.size) {
        mod.lastChangedLocal = stats.mtimeMs;
        mod.size = stats.size;
        updated++;
      }
    } catch {
      /* ignore inaccessible packs */
    }
  }
  return updated;
}

/** Fetch required mod IDs via the registered Steam client fetcher. */
async function ensureWorkshopRequiredIds(
  ids: string[],
  game: GameDefinition,
  cacheDir: string,
  cache: WorkshopCache,
  log?: LogCallback,
  mode: WorkshopFetchMode = "routine",
): Promise<void> {
  const needsFetch = cache.idsNeedingRequiredIds(ids, mode);
  if (needsFetch.length === 0) return;

  log?.(
    `Workshop required mods: fetching ${needsFetch.length} item(s) via Steam client `
    + `(${ids.length - needsFetch.length} cached)`,
  );

  try {
    const fetched = await fetchWorkshopRequiredIds(needsFetch, game, log);
    for (const id of needsFetch) {
      const raw = fetched.get(id) ?? [];
      const requiredIds = await validateRequiredWorkshopIds(raw, cacheDir, cache, log);
      cache.setRequiredIds(id, requiredIds, false);
    }
    cache.save();
    log?.("Workshop required mods cached");
  } catch (e) {
    if (isSteamIpcUnavailableError(e)) {
      log?.(`Workshop required mods: ${formatSteamFetchSkipReason(e)} — using cache if available`);
      return;
    }
    log?.(`Workshop required mods: Steam fetch failed: ${e}`);
    for (const id of needsFetch) {
      cache.markRequiredIdsFetchFailed(id);
    }
    cache.save();
  }
}

/** Resolve prerequisite titles and apply reqModIds to mods. */
async function applyWorkshopDependencies(
  mods: Mod[],
  game: GameDefinition,
  cache: WorkshopCache,
  cacheDir: string,
  subscribedWorkshopIds: string[],
  log?: LogCallback,
  mode: WorkshopFetchMode = "routine",
): Promise<void> {
  const workshopModIds = collectWorkshopItemIds(mods, subscribedWorkshopIds);

  await ensureWorkshopRequiredIds(workshopModIds, game, cacheDir, cache, log, mode);

  const allRequired = new Set<string>();
  for (const id of workshopModIds) {
    for (const req of filterRequiredIdsFromCache(cache.get(id)?.requiredIds ?? [], cache)) {
      allRequired.add(req);
    }
  }
  const missingTitles = [...allRequired].filter(
    id => !cache.has(id) || !cache.get(id)!.title,
  );
  if (missingTitles.length > 0) {
    await getWorkshopMetadata(missingTitles, cacheDir, log, mode, cache);
  }

  const data = cache.asMap();
  for (const mod of mods) {
    const workshopId = resolveModWorkshopId(mod);
    if (!workshopId) continue;
    const requiredIds = filterRequiredIdsFromCache(data.get(workshopId)?.requiredIds ?? [], cache);
    if (requiredIds.length === 0) continue;
    mod.reqModIds = requiredIds;
    mod.reqModIdToName = requiredIds.map(id => [id, data.get(id)?.title ?? id]);
    if (!isNumericWorkshopId(mod.workshopId)) mod.workshopId = workshopId;
  }
}

// ─── Steam Path Discovery ────────────────────────────────────────────────────

import { execSync } from "child_process";

/**
 * Find Steam installation path on Windows from registry.
 * Falls back to common locations on Linux/Mac.
 */
export async function findSteamPath(): Promise<string | undefined> {
  if (process.platform === "win32") {
    try {
      const result = execSync(
        'reg query "HKLM\\SOFTWARE\\Wow6432Node\\Valve\\Steam" /v InstallPath',
        { encoding: "utf8", timeout: 5000 },
      );
      const match = result.match(/InstallPath\s+REG_SZ\s+(.+)/);
      if (match) return match[1].trim();
    } catch {
      // Registry read failed, try common paths
      const commonPaths = [
        "C:\\Program Files (x86)\\Steam",
        "C:\\Program Files\\Steam",
        "D:\\Steam",
        "D:\\SteamLibrary",
      ];
      for (const p of commonPaths) {
        if (fs.existsSync(p)) return p;
      }
    }
  } else if (process.platform === "linux") {
    const home = process.env.HOME || "";
    const steamPath = path.join(home, ".steam", "steam");
    if (fs.existsSync(steamPath)) return steamPath;
  } else if (process.platform === "darwin") {
    const home = process.env.HOME || "";
    const steamPath = path.join(home, "Library/Application Support/Steam");
    if (fs.existsSync(steamPath)) return steamPath;
  }
  return undefined;
}

/**
 * Parse Steam's libraryfolders.vdf to find all Steam library paths.
 */
export async function findSteamLibraryFolders(steamPath: string): Promise<string[]> {
  const vdfPath = path.join(steamPath, "steamapps", "libraryfolders.vdf");
  if (!fs.existsSync(vdfPath)) return [steamPath];

  const content = fs.readFileSync(vdfPath, "utf8");
  const paths: string[] = [steamPath];

  // Simple VDF parser — extract "path" values
  const pathMatch = content.matchAll(/"path"\s+"([^"]+)"/g);
  for (const match of pathMatch) {
    const libPath = match[1].replace(/\\\\/g, "\\").replace(/\/\//g, "/");
    if (!paths.includes(libPath)) paths.push(libPath);
  }

  return paths;
}

/**
 * Find the steamapps folder for a specific game by its Steam App ID.
 */
export async function findGameSteamAppsFolder(
  steamId: string,
  log?: LogCallback,
): Promise<string | undefined> {
  const steamPath = await findSteamPath();
  if (!steamPath) {
    log?.("Steam installation not found");
    return undefined;
  }

  const libraryFolders = await findSteamLibraryFolders(steamPath);

  for (const libPath of libraryFolders) {
    const manifestPath = path.join(
      libPath,
      "steamapps",
      `appmanifest_${steamId}.acf`,
    );
    if (fs.existsSync(manifestPath)) {
      const steamAppsPath = path.join(libPath, "steamapps");
      log?.(`Found game at: ${steamAppsPath}`);
      return steamAppsPath;
    }
  }

  log?.(`Game with Steam ID ${steamId} not found in any library`);
  return undefined;
}

/**
 * Resolve all folder paths for a game.
 */
export async function resolveGameFolderPaths(
  game: GameDefinition,
  log?: LogCallback,
): Promise<GameFolderPaths> {
  const steamAppsFolder = await findGameSteamAppsFolder(game.steamId, log);
  if (!steamAppsFolder) {
    return { gamePath: undefined, contentFolder: undefined, dataFolder: undefined };
  }

  const gamePath = path.join(steamAppsFolder, "common", game.gameFolder);
  const contentFolder = path.join(steamAppsFolder, "workshop", "content", game.steamId);
  const dataFolder = path.join(gamePath, "data");

  log?.(`Game path: ${gamePath}`);
  log?.(`Content folder: ${contentFolder}`);
  log?.(`Data folder: ${dataFolder}`);

  return { gamePath, contentFolder, dataFolder };
}

// ─── Steam Workshop pending downloads ────────────────────────────────────────

/** Placeholder mod for a subscribed workshop item without a local .pack yet. */
export function buildPendingWorkshopMod(
  workshopId: string,
  contentFolder: string,
  hints?: Partial<Mod>,
): Mod {
  const subfolderPath = path.join(contentFolder, workshopId);
  const packName = hints?.name?.endsWith(".pack") ? hints.name : `${workshopId}.pack`;
  const packPath = path.join(subfolderPath, packName);
  return {
    humanName: hints?.humanName && isUsableWorkshopTitle(hints.humanName, workshopId)
      ? hints.humanName
      : (hints?.humanName || workshopId),
    name: packName,
    path: packPath,
    modDirectory: subfolderPath,
    imgPath: hints?.imgPath && fs.existsSync(hints.imgPath) ? hints.imgPath : "",
    workshopId,
    isEnabled: hints?.isEnabled ?? false,
    isInData: false,
    isDeleted: false,
    isMovie: hints?.isMovie ?? false,
    author: hints?.author ?? "",
    tags: hints?.tags?.length ? hints.tags : ["mod"],
    loadOrder: hints?.loadOrder,
    lastChanged: hints?.lastChanged,
    lastChangedLocal: hints?.lastChangedLocal,
    reqModIds: hints?.reqModIds ? [...hints.reqModIds] : undefined,
    reqModIdToName: hints?.reqModIdToName ? hints.reqModIdToName.map(p => [...p] as [string, string]) : undefined,
    pendingDownload: true,
  };
}

function workshopFolderHasValidPack(contentFolder: string, workshopId: string): boolean {
  const folder = path.join(contentFolder, workshopId);
  if (!fs.existsSync(folder)) return false;
  try {
    return fs.readdirSync(folder).some((name) => {
      if (!name.endsWith(".pack")) return false;
      try {
        return fs.statSync(path.join(folder, name)).size >= 32;
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  }
}

export { workshopFolderHasValidPack };

async function mergeMissingSubscribedWorkshopMods(
  mods: Mod[],
  contentFolderIds: string[],
  contentFolder: string | undefined,
  game: GameDefinition,
  cacheDir: string | undefined,
  preserveWorkshopMods: Mod[] | undefined,
  skipSteamSubscriptionFetch: boolean,
  cachedSubscribedWorkshopIds: string[] | undefined,
  log?: LogCallback,
): Promise<string[]> {
  const presentWorkshopIds = new Set(
    mods
      .map(m => resolveModWorkshopId(m))
      .filter(isNumericWorkshopId),
  );

  const hintByWorkshopId = new Map<string, Partial<Mod>>();
  for (const prev of preserveWorkshopMods ?? []) {
    const id = resolveModWorkshopId(prev);
    if (id) hintByWorkshopId.set(id, prev);
  }

  const cache = cacheDir ? new WorkshopCache(cacheDir).load(log) : null;
  if (cache) {
    for (const [id, entry] of cache.asMap()) {
      if (!isNumericWorkshopId(id) || hintByWorkshopId.has(id)) continue;
      hintByWorkshopId.set(id, {
        humanName: entry.title,
        author: entry.creator,
        tags: entry.tags ? normalizeWorkshopTags(entry.tags) : undefined,
      });
    }
  }

  const subscribedIds = skipSteamSubscriptionFetch
    ? (cachedSubscribedWorkshopIds ?? [])
    : await fetchSubscribedWorkshopIds(game, log);

  const subscribedSet = new Set(subscribedIds.filter(isNumericWorkshopId));
  const missingIds = new Set<string>();

  for (const prev of preserveWorkshopMods ?? []) {
    const id = resolveModWorkshopId(prev);
    if (id && !presentWorkshopIds.has(id)) missingIds.add(id);
  }

  if (contentFolder) {
    // Steam subscription list is authoritative for the active game — do not drop
    // items when workshop API metadata is stale (common after a failed force-update).
    const subscribedMissing = subscribedIds.filter(
      id => isNumericWorkshopId(id)
        && !presentWorkshopIds.has(id)
        && !workshopFolderHasValidPack(contentFolder, id),
    );
    for (const id of subscribedMissing) missingIds.add(id);

    // Workshop folders on disk without a loadable .pack (empty folder, stub file, etc.)
    for (const folderId of contentFolderIds) {
      if (!isNumericWorkshopId(folderId)) continue;
      if (presentWorkshopIds.has(folderId)) continue;
      if (workshopFolderHasValidPack(contentFolder, folderId)) continue;
      if (
        subscribedSet.has(folderId)
        || hintByWorkshopId.has(folderId)
        || cache?.has(folderId)
      ) {
        missingIds.add(folderId);
      }
    }
  }

  let added = 0;
  if (contentFolder) {
    for (const workshopId of missingIds) {
      mods.push(buildPendingWorkshopMod(workshopId, contentFolder, hintByWorkshopId.get(workshopId)));
      presentWorkshopIds.add(workshopId);
      added++;
    }
  }

  if (added > 0) {
    log?.(`Workshop: ${added} subscribed item(s) awaiting download — shown as placeholders`);
  }

  return [...new Set([
    ...contentFolderIds.filter(isNumericWorkshopId),
    ...subscribedIds.filter(isNumericWorkshopId),
  ])];
}

// ─── Vanilla Pack Detection ──────────────────────────────────────────────────

/**
 * Read manifest.txt to get list of vanilla pack names.
 */
export function readManifest(gamePath: string): string[] {
  const manifestPath = path.join(gamePath, "data", "manifest.txt");
  if (!fs.existsSync(manifestPath)) return [];

  const content = fs.readFileSync(manifestPath, "utf8");
  const packs: string[] = [];
  const re = /([^\s]+)/;

  for (const line of content.split("\n")) {
    const match = line.match(re);
    if (match) packs.push(match[1]);
  }

  return packs.filter((name) => name.endsWith(".pack"));
}

/**
 * Get vanilla pack names for a game (from manifest or game definition).
 */
export function getVanillaPackNames(
  game: GameDefinition,
  gamePath?: string,
): Set<string> {
  const packs: string[] = [];

  if (gamePath) {
    packs.push(...readManifest(gamePath));
  }

  // Fallback to game definition manifest
  if (packs.length === 0 && game.manifest) {
    packs.push(...game.manifest);
  }

  // Game-specific extras
  if (game.id === "attila" && !packs.includes("charlemagne.pack")) {
    packs.push("charlemagne.pack");
  }
  if (game.id === "rome2") {
    for (const extra of ["gaul.pack", "blood_rome2.pack", "punic.pack"]) {
      if (!packs.includes(extra)) packs.push(extra);
    }
  }

  return new Set(packs.filter((name) => name.endsWith(".pack")));
}

// ─── Mod Building ────────────────────────────────────────────────────────────

/**
 * Build a Mod from a pack file in the data/ folder.
 */
export async function buildDataMod(
  filePath: string,
  dataPath: string,
  isInModding = false,
): Promise<Mod> {
  const fileName = path.basename(filePath);
  let lastChangedLocal: number | undefined;
  let size: number | undefined;
  let isSymbolicLink = false;

  try {
    const stats = fs.lstatSync(filePath);
    lastChangedLocal = stats.mtimeMs;
    size = stats.size;
    isSymbolicLink = stats.isSymbolicLink();
  } catch (e) {
    // File might have been deleted or inaccessible
    console.warn(`Failed to stat file ${filePath}:`, e);
  }

  // Check for thumbnail
  let imgPath = "";
  for (const ext of [".png", ".jpg"]) {
    const thumbPath = path.join(dataPath, fileName.replace(/\.pack$/, ext));
    if (fs.existsSync(thumbPath)) {
      imgPath = thumbPath;
      break;
    }
  }

  // Read pack header for movie flag and dependencies
  let isMovie = false;
  let dependencyPacks: string[] = [];
  try {
    const header = await readPackHeader(filePath, (p) => new NodeBinaryReader(p));
    isMovie = header.isMovie;
    dependencyPacks = header.dependencyPacks;
  } catch {
    // Header read failed, leave defaults
  }

  const numericWorkshopId = fileName.match(/^(\d{5,15})\.pack$/i)?.[1];

  return {
    humanName: "",
    name: fileName,
    path: filePath,
    modDirectory: path.dirname(filePath),
    imgPath,
    workshopId: numericWorkshopId ?? fileName,
    isEnabled: false,
    isInData: true,
    isInModding,
    isSymbolicLink,
    loadOrder: undefined,
    lastChangedLocal,
    author: "",
    isDeleted: false,
    isMovie,
    size,
    dependencyPacks,
    tags: ["mod"],
  };
}

/**
 * Read Workshop metadata from content subfolder.
 * Looks for workshop.json or similar metadata files.
 */
function readWorkshopMetadata(subfolderPath: string): { humanName?: string; author?: string; tags?: string[] } {
  const result: { humanName?: string; author?: string; tags?: string[] } = {};

  const pickTitle = (value: unknown): string | undefined => {
    if (typeof value !== "string") return undefined;
    const trimmed = value.trim();
    return trimmed || undefined;
  };

  const applyJsonMetadata = (data: Record<string, unknown>) => {
    const title =
      pickTitle(data.title)
      ?? pickTitle(data.name)
      ?? pickTitle(data.Title)
      ?? pickTitle(data.display_name)
      ?? pickTitle(data.displayName)
      ?? pickTitle(data.mod_name)
      ?? pickTitle(data.workshop_title)
      ?? pickTitle(data.WorkshopName)
      ?? pickTitle(data.chinese_name)
      ?? pickTitle(data.zh_name);
    if (title && !result.humanName) result.humanName = title;

    const author =
      pickTitle(data.creator)
      ?? pickTitle(data.author)
      ?? pickTitle(data.Author);
    if (author && !result.author) result.author = author;

    if (Array.isArray(data.tags) && !result.tags?.length) result.tags = data.tags as string[];
  };
  
  // Try to read workshop.json
  const workshopJsonPath = path.join(subfolderPath, "workshop.json");
  if (fs.existsSync(workshopJsonPath)) {
    try {
      applyJsonMetadata(JSON.parse(fs.readFileSync(workshopJsonPath, "utf8")));
    } catch {
      // Failed to parse workshop.json
    }
  }
  
  // Try to read __folder_managed_by_vortex.json (Vortex mod manager)
  const vortexJsonPath = path.join(subfolderPath, "__folder_managed_by_vortex.json");
  if (fs.existsSync(vortexJsonPath)) {
    try {
      applyJsonMetadata(JSON.parse(fs.readFileSync(vortexJsonPath, "utf8")));
    } catch {
      // Failed to parse vortex json
    }
  }
  
  // Try to read mod.txt (some mods include this)
  const modTxtPath = path.join(subfolderPath, "mod.txt");
  if (fs.existsSync(modTxtPath) && !result.humanName) {
    try {
      const content = fs.readFileSync(modTxtPath, "utf8");
      const lines = content.split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        const lower = trimmed.toLowerCase();
        if (lower.startsWith("name:") || lower.startsWith("title:") || lower.startsWith("display_name:")) {
          result.humanName = trimmed.substring(trimmed.indexOf(":") + 1).trim();
          break;
        }
      }
    } catch {
      // Failed to read mod.txt
    }
  }
  
  return result;
}

function mergeWorkshopContentIntoDataMod(dataMod: Mod, contentMod: Mod): void {
  if (!dataMod.imgPath && contentMod.imgPath) dataMod.imgPath = contentMod.imgPath;
  if (!dataMod.author && contentMod.author) dataMod.author = contentMod.author;
  if (contentMod.tags?.length && (!dataMod.tags?.length || dataMod.tags.every(t => t === "mod"))) {
    dataMod.tags = contentMod.tags;
  }
  if (/^\d{5,15}$/.test(contentMod.workshopId)) {
    dataMod.workshopId = contentMod.workshopId;
  }
  if (isUsableWorkshopTitle(contentMod.humanName, dataMod.workshopId)) {
    applyWorkshopTitle(dataMod, contentMod.humanName);
  }
  if ((!dataMod.dependencyPacks || dataMod.dependencyPacks.length === 0) && contentMod.dependencyPacks?.length) {
    dataMod.dependencyPacks = [...contentMod.dependencyPacks];
  }
  if ((!dataMod.reqModIds || dataMod.reqModIds.length === 0) && contentMod.reqModIds?.length) {
    dataMod.reqModIds = [...contentMod.reqModIds];
    if (contentMod.reqModIdToName?.length) {
      dataMod.reqModIdToName = contentMod.reqModIdToName.map(([id, name]) => [id, name]);
    }
  }
}

function applyLauncherModNames(mods: Mod[], game: GameDefinition, log?: LogCallback): number {
  const index = readLauncherModNameIndex(game.launcherGameId);
  if (index.size === 0) return 0;

  let applied = 0;
  for (const mod of mods) {
    const title = lookupLauncherModName(index, mod);
    if (!title) continue;
    if (mod.humanName === title) continue;
    if (applyWorkshopTitle(mod, title)) applied++;
  }

  if (applied > 0) {
    log?.(`CA Launcher moddata: applied ${applied} display name(s)`);
  }
  return applied;
}

/**
 * Build a Mod from a Workshop content subfolder.
 */
export async function buildContentMod(
  contentFolder: string,
  subfolderName: string,
): Promise<Mod | undefined> {
  const subfolderPath = path.join(contentFolder, subfolderName);
  if (!fs.existsSync(subfolderPath)) return undefined;

  const files = fs.readdirSync(subfolderPath, { withFileTypes: true });
  const packFile = files.find((f) => f.name.endsWith(".pack"));
  if (!packFile) return undefined;

  const packPath = path.join(subfolderPath, packFile.name);
  const imgFile = files.find((f) => f.name.endsWith(".png") || f.name.endsWith(".jpg"));
  const imgPath = imgFile ? path.join(subfolderPath, imgFile.name) : "";

  let lastChangedLocal: number | undefined;
  let size: number | undefined;
  let subbedTime: number | undefined;
  let isSymbolicLink = false;

  try {
    const stats = fs.lstatSync(packPath);
    lastChangedLocal = stats.mtimeMs;
    size = stats.size;
    isSymbolicLink = stats.isSymbolicLink();
  } catch {
    // stat failed
  }

  try {
    const stats = fs.statSync(subfolderPath);
    subbedTime = stats.birthtimeMs;
  } catch {
    // stat failed
  }

  // Read Workshop metadata
  const metadata = readWorkshopMetadata(subfolderPath);

  // Read pack header
  let isMovie = false;
  let dependencyPacks: string[] = [];
  try {
    const header = await readPackHeader(packPath, (p) => new NodeBinaryReader(p));
    isMovie = header.isMovie;
    dependencyPacks = header.dependencyPacks;
  } catch {
    // Header read failed
  }

  return {
    humanName: metadata.humanName || "",
    name: packFile.name,
    path: packPath,
    modDirectory: subfolderPath,
    imgPath,
    workshopId: subfolderName,
    isEnabled: false,
    isInData: false,
    isSymbolicLink,
    loadOrder: undefined,
    lastChangedLocal,
    isDeleted: false,
    isMovie,
    size,
    subbedTime: subbedTime ?? lastChangedLocal,
    dependencyPacks,
    author: metadata.author || "",
    tags: metadata.tags || ["mod"],
  };
}

// ─── Full Mod Scan ───────────────────────────────────────────────────────────

export interface ScanResult {
  mods: Mod[];
  vanillaPacks: Set<string>;
  /** Workshop folder names found under the content directory (subscribed items). */
  subscribedWorkshopIds: string[];
}

export interface ScanModsOptions {
  /** Skip Steam/network workshop fetches; use on-disk cache only for fast startup. */
  deferNetwork?: boolean;
  /** Keep these workshop mods visible while Steam re-downloads local content. */
  preserveWorkshopMods?: Mod[];
  /** Skip live Steam subscription query (avoids steamworks churn during download polling). */
  skipSteamSubscriptionFetch?: boolean;
  /** When skipSteamSubscriptionFetch is set, use this list to restore missing placeholders. */
  cachedSubscribedWorkshopIds?: string[];
}

function applyWorkshopMetadataFromCache(mods: Mod[], cache: WorkshopCache): void {
  const workshopData = cache.asMap();
  for (const mod of mods) {
    if (mod.workshopId && workshopData.has(mod.workshopId)) {
      const data = workshopData.get(mod.workshopId)!;
      if (!isUsableWorkshopTitle(mod.humanName, mod.workshopId)) {
        applyWorkshopTitle(mod, data.title);
      }
      if (!mod.author && data.creator) mod.author = data.creator;
      if (data.tags?.length) mod.tags = normalizeWorkshopTags(data.tags);
    }
  }
  applyWorkshopTimeUpdatedToMods(mods, workshopData);
}

function applyCachedWorkshopDependencies(mods: Mod[], cache: WorkshopCache): void {
  const data = cache.asMap();
  for (const mod of mods) {
    const workshopId = resolveModWorkshopId(mod);
    if (!workshopId) continue;
    const requiredIds = filterRequiredIdsFromCache(data.get(workshopId)?.requiredIds ?? [], cache);
    if (requiredIds.length === 0) continue;
    mod.reqModIds = requiredIds;
    mod.reqModIdToName = requiredIds.map(id => [id, data.get(id)?.title ?? id]);
    if (!isNumericWorkshopId(mod.workshopId)) mod.workshopId = workshopId;
  }
}

/** Apply cached workshop data only (no network). Used for fast startup scans. */
function applyCachedWorkshopData(
  mods: Mod[],
  cache: WorkshopCache,
  game: GameDefinition,
  log?: LogCallback,
): void {
  applyWorkshopMetadataFromCache(mods, cache);
  applyCachedWorkshopDependencies(mods, cache);
  applyLauncherModNames(mods, game, log);
  log?.("Workshop cache applied (network deferred)");
}

/**
 * Fetch missing workshop metadata, prerequisites, and update timestamps.
 * Call after a fast scan when `deferNetwork` was used.
 */
export async function enrichWorkshopNetwork(
  mods: Mod[],
  game: GameDefinition,
  cacheDir: string,
  subscribedWorkshopIds: string[],
  log?: LogCallback,
): Promise<void> {
  const workshopIds = subscribedWorkshopIds;
  if (workshopIds.length === 0 || !cacheDir) return;

  try {
    const cache = new WorkshopCache(cacheDir).load(log);
    seedCacheFromLocalMods(mods, cache);
    cache.save();

    const workshopData = await getWorkshopMetadata(workshopIds, cacheDir, log, "routine", cache);

    for (const mod of mods) {
      if (mod.workshopId && workshopData.has(mod.workshopId)) {
        const data = workshopData.get(mod.workshopId)!;
        if (!isUsableWorkshopTitle(mod.humanName, mod.workshopId)) {
          applyWorkshopTitle(mod, data.title);
        }
        if (!mod.author && data.creator) mod.author = data.creator;
        if (data.tags?.length) mod.tags = normalizeWorkshopTags(data.tags);
      }
    }

    applyLauncherModNames(mods, game, log);

    applyWorkshopTimeUpdatedToMods(mods, workshopData);
    await checkWorkshopUpdates(mods, cacheDir, log, false, cache);

    // Required-mod IDs are fetched on demand when the user enables a mod,
    // not during background startup enrichment.

    log?.("Workshop network enrichment complete");
  } catch (e) {
    log?.(`Workshop network enrichment failed: ${e}`);
  }
}

/**
 * Force-fetch and apply workshop prerequisites for one mod (e.g. on enable).
 * Re-fetches when cache is empty or a previous fetch failed.
 */
export async function ensureModPrerequisites(
  mods: Mod[],
  modName: string,
  game: GameDefinition,
  cacheDir: string,
  subscribedWorkshopIds: string[],
  log?: LogCallback,
): Promise<void> {
  const mod = mods.find(m => m.name === modName);
  if (!mod || !cacheDir) return;

  const workshopId = resolveModWorkshopId(mod);
  if (!workshopId) return;

  const cache = new WorkshopCache(cacheDir).load(log);
  const entry = cache.get(workshopId);
  const shouldFetch = !mod.reqModIds?.length
    || entry?.requiredIds === undefined
    || entry?.requiredIdsFetchFailed
    || entry?.requiredIdsCacheGeneration !== REQUIRED_IDS_CACHE_GENERATION;

  if (shouldFetch) {
    try {
      const fetched = await fetchWorkshopRequiredIds([workshopId], game, log);
      const requiredIds = await validateRequiredWorkshopIds(
        fetched.get(workshopId) ?? [],
        cacheDir,
        cache,
        log,
      );
      cache.setRequiredIds(workshopId, requiredIds, false);

      const missingTitles = requiredIds.filter(id => !cache.has(id) || !cache.get(id)!.title);
      if (missingTitles.length > 0) {
        await getWorkshopMetadata(missingTitles, cacheDir, log, "routine", cache);
      }
      cache.save();
    } catch (e) {
      if (isSteamIpcUnavailableError(e)) {
        log?.(`Required mods for ${modName}: ${formatSteamFetchSkipReason(e)} — using cache if available`);
      } else {
        log?.(`Failed to ensure required mods for ${modName}: ${e}`);
        cache.setRequiredIds(workshopId, [], true);
        cache.save();
      }
    }
  }

  applyCachedWorkshopDependencies(mods, cache);
  applyLauncherModNames(mods, game, log);
  if (!isNumericWorkshopId(mod.workshopId)) mod.workshopId = workshopId;
}

/**
 * Scan all mod sources for a game and return the complete mod list.
 */
export async function scanMods(
  game: GameDefinition,
  folderPaths: GameFolderPaths,
  cacheDir?: string,
  log?: LogCallback,
  options: ScanModsOptions = {},
): Promise<ScanResult> {
  const deferNetwork = options.deferNetwork === true;
  const mods: Mod[] = [];

  if (!folderPaths.gamePath) {
    log?.("Game path not set, cannot scan mods");
    return { mods, vanillaPacks: new Set(), subscribedWorkshopIds: [] };
  }
  const gamePath = folderPaths.gamePath;

  // Get vanilla pack names
  const vanillaPacks = getVanillaPackNames(game, gamePath);
  log?.(`Found ${vanillaPacks.size} vanilla packs`);

  // Scan data/modding/ folder
  const moddingPath = path.join(gamePath, "data", "modding");
  if (fs.existsSync(moddingPath)) {
    log?.("Scanning data/modding/ folder...");
    const files = fs.readdirSync(moddingPath);
    const packFiles = files.filter(file => file.endsWith(".pack"));
    const moddingMods = await mapWithConcurrency(packFiles, PACK_SCAN_CONCURRENCY, async (file) => {
      const filePath = path.join(moddingPath, file);
      try {
        return await buildDataMod(filePath, path.join(gamePath, "data"), true);
      } catch (e) {
        log?.(`  Error reading mod ${file}: ${e}`);
        return null;
      }
    });
    mods.push(...moddingMods);
    log?.(`  Found ${mods.length} mods in data/modding/`);
  }

  // Scan data/ folder
  const dataPath = path.join(gamePath, "data");
  if (fs.existsSync(dataPath)) {
    log?.("Scanning data/ folder...");
    const dataModCount = mods.length;
    const files = fs.readdirSync(dataPath);
    const packFiles = files.filter(file => file.endsWith(".pack") && !vanillaPacks.has(file));
    const dataMods = await mapWithConcurrency(packFiles, PACK_SCAN_CONCURRENCY, async (file) => {
      const filePath = path.join(dataPath, file);
      try {
        return await buildDataMod(filePath, dataPath, false);
      } catch (e) {
        log?.(`  Error reading mod ${file}: ${e}`);
        return null;
      }
    });
    for (const mod of dataMods) {
      if (mods.some((m) => m.name === mod.name && m.isInModding)) continue;
      mods.push(mod);
    }
    log?.(`  Found ${mods.length - dataModCount} mods in data/`);
  }

  // Scan Workshop content folder
  const contentFolderIds: string[] = [];
  if (folderPaths.contentFolder && fs.existsSync(folderPaths.contentFolder)) {
    log?.("Scanning Workshop content folder...");
    const contentModCount = mods.length;
    const entries = fs.readdirSync(folderPaths.contentFolder, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      contentFolderIds.push(entry.name);
      try {
        const mod = await buildContentMod(folderPaths.contentFolder, entry.name);
        if (mod) {
          // Check if same pack exists in data/ (prefer data version)
          const duplicateInData = mods.find((m) => m.name === mod.name && m.isInData);
          if (duplicateInData) {
            mergeWorkshopContentIntoDataMod(duplicateInData, mod);
            continue;
          }
          mods.push(mod);
        }
        // Empty workshop folders are handled via live subscription list only.
      } catch (e) {
        log?.(`  Error reading Workshop mod ${entry.name}: ${e}`);
      }
    }
    log?.(`  Found ${mods.length - contentModCount} mods in Workshop content/`);
  } else {
    log?.("Workshop content folder not found (may be a non-Steam install)");
  }

  const workshopIds = await mergeMissingSubscribedWorkshopMods(
    mods,
    contentFolderIds,
    folderPaths.contentFolder,
    game,
    cacheDir,
    options.preserveWorkshopMods,
    options.skipSteamSubscriptionFetch === true,
    options.cachedSubscribedWorkshopIds,
    log,
  );

  applyLauncherModNames(mods, game, log);

  // Workshop metadata & prerequisites — cache-first; network optional when deferNetwork.
  if (workshopIds.length > 0 && cacheDir) {
    try {
      const cache = new WorkshopCache(cacheDir).load(log);
      seedCacheFromLocalMods(mods, cache);
      cache.save();

      if (deferNetwork) {
        applyCachedWorkshopData(mods, cache, game, log);
      } else {
        const workshopData = await getWorkshopMetadata(workshopIds, cacheDir, log, "routine", cache);

        for (const mod of mods) {
          if (mod.workshopId && workshopData.has(mod.workshopId)) {
            const data = workshopData.get(mod.workshopId)!;
            if (!isUsableWorkshopTitle(mod.humanName, mod.workshopId)) {
              applyWorkshopTitle(mod, data.title);
            }
            if (!mod.author && data.creator) mod.author = data.creator;
            if (data.tags?.length) mod.tags = normalizeWorkshopTags(data.tags);
          }
        }

        applyLauncherModNames(mods, game, log);

        applyWorkshopTimeUpdatedToMods(mods, workshopData);
        await checkWorkshopUpdates(mods, cacheDir, log, false, cache);

        await applyWorkshopDependencies(mods, game, cache, cacheDir, workshopIds, log);

        log?.("Workshop cache applied");
      }
    } catch (e) {
      log?.(`Error loading Workshop cache: ${e}`);
    }
  }

  log?.(`Total: ${mods.length} mods found`);
  return { mods, vanillaPacks, subscribedWorkshopIds: workshopIds };
}
