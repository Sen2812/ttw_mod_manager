/**
 * Persistent cache for Steam Workshop metadata and required mod IDs.
 *
 * Required mod IDs (`requiredIds`) are sourced from the Steam client
 * (steamworks getItemDependencies), then filtered against Steam Web API availability.
 * Legacy or stale rows are invalidated on load when the cache generation changes.
 */

import * as fs from "fs";
import * as path from "path";

/** Bump when required-mod fetch backend changes; invalidates cached requiredIds. */
export const REQUIRED_IDS_CACHE_GENERATION = 3;

/** How long cached API metadata (title/author) remains valid before optional refresh. */
export const METADATA_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** How long cached prerequisite lists remain valid before optional refresh. */
export const REQUIRED_IDS_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** How long cached workshop update timestamps remain valid before re-check. */
export const UPDATE_CHECK_TTL_MS = 60 * 60 * 1000;

export interface WorkshopItemData {
  publishedfileid: string;
  title?: string;
  creator?: string;
  tags?: { tag: string }[] | string[];
  /** Workshop item last update time (ms since epoch). */
  timeUpdated?: number;
  /** Cached required mod workshop IDs from Steam client UGC children. */
  requiredIds?: string[];
  /** Cache schema generation for requiredIds (see REQUIRED_IDS_CACHE_GENERATION). */
  requiredIdsCacheGeneration?: number;
  /** When title/author was last fetched from the Steam Web API. */
  metadataFetchedAt?: number;
  /** Steam API result when the item cannot be fetched (e.g. 9 = removed/private). */
  apiResult?: number;
  /** Skip repeat API calls for permanently unavailable items. */
  metadataUnavailable?: boolean;
  /** When requiredIds was last fetched via Steam client. */
  requiredIdsFetchedAt?: number;
  /** Last Steam client prerequisite fetch failed; do not treat as confirmed empty. */
  requiredIdsFetchFailed?: boolean;
  /** When timeUpdated was last fetched from the Steam Web API. */
  timeUpdatedFetchedAt?: number;
  /** Steam consumer app ID from metadata API (e.g. 1142710 for WH3). */
  consumerAppId?: number;
}

export type WorkshopFetchMode = "routine" | "refresh";

export class WorkshopCache {
  private readonly cachePath: string;
  private readonly legacyTimestampPath: string;
  private entries = new Map<string, WorkshopItemData>();
  private static saveQueues = new Map<string, Promise<void>>();

  constructor(cacheDir: string) {
    this.cachePath = path.join(cacheDir, "workshop-cache.json");
    this.legacyTimestampPath = path.join(cacheDir, "workshop-cache-timestamp.json");
  }

  load(log?: (msg: string) => void): this {
    this.entries = new Map();
    try {
      if (fs.existsSync(this.cachePath)) {
        const data = JSON.parse(fs.readFileSync(this.cachePath, "utf8"));
        for (const item of data as WorkshopItemData[]) {
          if (item?.publishedfileid) {
            this.entries.set(item.publishedfileid, item);
          }
        }
      }
    } catch {
      // ignore corrupt cache
    }
    this.migrateLegacyTimestamps();
    this.normalizeLegacyEntries();
    const invalidated = this.invalidateLegacyRequiredIds();
    if (invalidated > 0) {
      log?.(`Workshop cache: cleared legacy requiredIds from ${invalidated} item(s)`);
      this.save();
    }
    return this;
  }

  /**
   * Drop requiredIds written by older HTML/API scrapers so Steam client refetches them.
   * Returns the number of cache entries cleared.
   */
  invalidateLegacyRequiredIds(): number {
    let count = 0;
    for (const entry of this.entries.values()) {
      if (entry.requiredIds === undefined && entry.requiredIdsFetchedAt === undefined) continue;
      if (entry.requiredIdsCacheGeneration === REQUIRED_IDS_CACHE_GENERATION) continue;
      delete entry.requiredIds;
      delete entry.requiredIdsFetchedAt;
      delete entry.requiredIdsFetchFailed;
      delete entry.requiredIdsCacheGeneration;
      count++;
    }
    return count;
  }

  save(log?: (msg: string) => void): void {
    const prev = WorkshopCache.saveQueues.get(this.cachePath) ?? Promise.resolve();
    const next = prev
      .then(() => this.saveSync())
      .catch((e) => {
        log?.(`Workshop cache write failed: ${e}`);
      });
    WorkshopCache.saveQueues.set(this.cachePath, next);
  }

  private saveSync(): void {
    try {
      const array = Array.from(this.entries.values());
      fs.writeFileSync(this.cachePath, JSON.stringify(array, null, 2), "utf8");
    } catch (e) {
      throw e instanceof Error ? e : new Error(String(e));
    }
  }

  asMap(): Map<string, WorkshopItemData> {
    return this.entries;
  }

  get(id: string): WorkshopItemData | undefined {
    return this.entries.get(id);
  }

  has(id: string): boolean {
    return this.entries.has(id);
  }

  /** Grandfather old cache rows so a routine scan does not immediately re-fetch everything. */
  normalizeLegacyEntries(): void {
    const now = Date.now();
    for (const entry of this.entries.values()) {
      if (entry.title && entry.metadataFetchedAt === undefined) {
        entry.metadataFetchedAt = now;
      }
      if (
        entry.requiredIds !== undefined
        && entry.requiredIdsFetchedAt === undefined
        && entry.requiredIdsCacheGeneration === REQUIRED_IDS_CACHE_GENERATION
      ) {
        entry.requiredIdsFetchedAt = now;
      }
    }
  }

  /** Import timestamps from the older separate timestamp file (one-time migration). */
  private migrateLegacyTimestamps(): void {
    try {
      if (!fs.existsSync(this.legacyTimestampPath)) return;
      const legacy: Record<string, number> = JSON.parse(
        fs.readFileSync(this.legacyTimestampPath, "utf8"),
      );
      for (const [id, ts] of Object.entries(legacy)) {
        const entry = this.entries.get(id);
        if (entry && entry.metadataFetchedAt === undefined) {
          entry.metadataFetchedAt = ts;
        }
      }
    } catch {
      // ignore
    }
  }

  /**
   * Which IDs need a Steam Web API metadata fetch.
   *
   * routine  — only IDs never cached, or cached without a title past TTL.
   * refresh  — all IDs past TTL (manual refresh path; not used on normal scan).
   */
  idsNeedingMetadata(ids: string[], mode: WorkshopFetchMode = "routine"): string[] {
    const now = Date.now();
    const unique = [...new Set(ids)];
    return unique.filter((id) => {
      const entry = this.entries.get(id);
      if (!entry) return true;
      if (entry.metadataUnavailable) return false;
      if (entry.title) {
        if (mode === "refresh" && entry.metadataFetchedAt !== undefined) {
          return now - entry.metadataFetchedAt > METADATA_TTL_MS;
        }
        return false;
      }
      if (entry.metadataFetchedAt === undefined) return true;
      return now - entry.metadataFetchedAt > METADATA_TTL_MS;
    });
  }

  /**
   * Which IDs need a Steam client fetch for required mods (UGC children).
   *
   * routine — never fetched, fetch failed, or legacy cache generation.
   * refresh — also re-fetch entries older than REQUIRED_IDS_TTL_MS.
   */
  idsNeedingRequiredIds(ids: string[], mode: WorkshopFetchMode = "routine"): string[] {
    const now = Date.now();
    const unique = [...new Set(ids)];
    return unique.filter((id) => {
      const entry = this.entries.get(id);
      if (!entry || entry.requiredIds === undefined || entry.requiredIdsFetchFailed) return true;
      if (entry.requiredIdsCacheGeneration !== REQUIRED_IDS_CACHE_GENERATION) return true;
      if (entry.requiredIdsFetchedAt === undefined) return false;
      if (mode === "refresh") {
        return now - entry.requiredIdsFetchedAt > REQUIRED_IDS_TTL_MS;
      }
      return false;
    });
  }

  /** Which IDs need a fresh workshop `time_updated` check. */
  idsNeedingUpdateCheck(ids: string[]): string[] {
    const now = Date.now();
    const unique = [...new Set(ids)];
    return unique.filter((id) => {
      const entry = this.entries.get(id);
      if (!entry || entry.timeUpdatedFetchedAt === undefined) return true;
      return now - entry.timeUpdatedFetchedAt > UPDATE_CHECK_TTL_MS;
    });
  }

  setMetadataUnavailable(id: string, apiResult: number): void {
    const existing = this.entries.get(id) ?? { publishedfileid: id };
    existing.apiResult = apiResult;
    existing.metadataUnavailable = true;
    existing.metadataFetchedAt = Date.now();
    this.entries.set(id, existing);
  }

  mergeMetadata(items: Iterable<[string, Partial<WorkshopItemData>]>): void {
    const now = Date.now();
    for (const [id, patch] of items) {
      const existing = this.entries.get(id) ?? { publishedfileid: id };
      if (patch.title) existing.title = patch.title;
      if (patch.creator) existing.creator = patch.creator;
      if (patch.tags) existing.tags = patch.tags;
      if (patch.timeUpdated !== undefined) {
        existing.timeUpdated = patch.timeUpdated;
        existing.timeUpdatedFetchedAt = now;
      }
      existing.metadataFetchedAt = now;
      this.entries.set(id, existing);
    }
  }

  mergeUpdateTimes(items: Iterable<[string, { timeUpdated?: number }]>): void {
    const now = Date.now();
    for (const [id, patch] of items) {
      const existing = this.entries.get(id) ?? { publishedfileid: id };
      if (patch.timeUpdated !== undefined) existing.timeUpdated = patch.timeUpdated;
      existing.timeUpdatedFetchedAt = now;
      this.entries.set(id, existing);
    }
  }

  setRequiredIds(id: string, requiredIds: string[], fetchFailed = false): void {
    const existing = this.entries.get(id) ?? { publishedfileid: id };
    existing.requiredIds = requiredIds;
    existing.requiredIdsFetchedAt = Date.now();
    existing.requiredIdsFetchFailed = fetchFailed;
    existing.requiredIdsCacheGeneration = REQUIRED_IDS_CACHE_GENERATION;
    this.entries.set(id, existing);
  }

  /** Mark a failed prerequisite fetch without overwriting cached requiredIds. */
  markRequiredIdsFetchFailed(id: string): void {
    const existing = this.entries.get(id) ?? { publishedfileid: id };
    existing.requiredIdsFetchFailed = true;
    this.entries.set(id, existing);
  }

  /** Clear all cached required mod IDs (forces Steam client refetch). */
  clearAllRequiredIds(): number {
    let count = 0;
    for (const entry of this.entries.values()) {
      if (entry.requiredIds === undefined && entry.requiredIdsFetchedAt === undefined) continue;
      delete entry.requiredIds;
      delete entry.requiredIdsFetchedAt;
      delete entry.requiredIdsFetchFailed;
      delete entry.requiredIdsCacheGeneration;
      count++;
    }
    return count;
  }
}
