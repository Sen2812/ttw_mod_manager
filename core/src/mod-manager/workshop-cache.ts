/**
 * Persistent cache for Steam Workshop metadata and prerequisites.
 *
 * Design goals:
 *   - Routine mod scans must NOT re-fetch known items.
 *   - Network is used only for IDs missing from cache, or after a long TTL (30 days).
 *   - Empty prerequisite lists are cached (negative cache) to avoid repeat HTML scrapes.
 */

import * as fs from "fs";
import * as path from "path";

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
  /** Cached prerequisite workshop IDs. `[]` means "none" (negative cache). */
  requiredIds?: string[];
  /** When title/author was last fetched from the Steam Web API. */
  metadataFetchedAt?: number;
  /** Steam API result when the item cannot be fetched (e.g. 9 = removed/private). */
  apiResult?: number;
  /** Skip repeat API calls for permanently unavailable items. */
  metadataUnavailable?: boolean;
  /** When requiredIds was last fetched from the workshop page. */
  requiredIdsFetchedAt?: number;
  /** Last prerequisite fetch failed (network); do not treat as "no prerequisites". */
  requiredIdsFetchFailed?: boolean;
  /** When timeUpdated was last fetched from the Steam Web API. */
  timeUpdatedFetchedAt?: number;
}

export type WorkshopFetchMode = "routine" | "refresh";

export class WorkshopCache {
  private readonly cachePath: string;
  private readonly legacyTimestampPath: string;
  private entries = new Map<string, WorkshopItemData>();

  constructor(cacheDir: string) {
    this.cachePath = path.join(cacheDir, "workshop-cache.json");
    this.legacyTimestampPath = path.join(cacheDir, "workshop-cache-timestamp.json");
  }

  load(): this {
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
    return this;
  }

  save(): void {
    try {
      const array = Array.from(this.entries.values());
      fs.writeFileSync(this.cachePath, JSON.stringify(array, null, 2), "utf8");
    } catch {
      // ignore write failures
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
      if (entry.requiredIds !== undefined && entry.requiredIdsFetchedAt === undefined) {
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
   * Which IDs need a workshop-page scrape for Required Items.
   *
   * routine — only when requiredIds has never been fetched.
   * refresh — also re-fetch entries older than REQUIRED_IDS_TTL_MS.
   */
  idsNeedingRequiredIds(ids: string[], mode: WorkshopFetchMode = "routine"): string[] {
    const now = Date.now();
    const unique = [...new Set(ids)];
    return unique.filter((id) => {
      const entry = this.entries.get(id);
      if (!entry || entry.requiredIds === undefined || entry.requiredIdsFetchFailed) return true;
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
    this.entries.set(id, existing);
  }
}
