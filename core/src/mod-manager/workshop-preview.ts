/**
 * Download Steam Workshop preview images into the local content folder.
 * UGC downloads often only include the .pack; covers come from preview_url.
 */

import * as fs from "fs";
import * as https from "https";
import * as http from "http";
import * as path from "path";
import type { Mod } from "../types";
import { fetchWorkshopMetadata } from "./mod-discovery";

type LogCallback = (msg: string) => void;

const PREVIEW_BASENAME = "preview";
const DEFAULT_CONCURRENCY = 4;

function extensionFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    if (pathname.endsWith(".png")) return ".png";
    if (pathname.endsWith(".webp")) return ".webp";
    if (pathname.endsWith(".jpeg")) return ".jpeg";
    if (pathname.endsWith(".jpg")) return ".jpg";
  } catch {
    /* ignore */
  }
  return ".jpg";
}

function downloadToFile(url: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("http://") ? http : https;
    const req = client.get(url, { timeout: 30_000 }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        downloadToFile(res.headers.location, destPath).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode} fetching preview`));
        return;
      }
      const chunks: Buffer[] = [];
      res.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      res.on("end", () => {
        try {
          fs.mkdirSync(path.dirname(destPath), { recursive: true });
          fs.writeFileSync(destPath, Buffer.concat(chunks));
          resolve();
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Preview download timed out"));
    });
  });
}

function findExistingPreviewInFolder(folder: string): string | null {
  if (!fs.existsSync(folder)) return null;
  try {
    for (const name of fs.readdirSync(folder)) {
      const lower = name.toLowerCase();
      if (!lower.endsWith(".png") && !lower.endsWith(".jpg") && !lower.endsWith(".jpeg") && !lower.endsWith(".webp")) {
        continue;
      }
      const full = path.join(folder, name);
      try {
        if (fs.statSync(full).size > 0) return full;
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

/** True when the mod has no usable local cover image. */
export function modNeedsWorkshopPreview(mod: Pick<Mod, "workshopId" | "imgPath" | "isInData">): boolean {
  if (!mod.workshopId || !/^\d{5,15}$/.test(mod.workshopId)) return false;
  if (mod.isInData) return false;
  if (mod.imgPath) {
    try {
      if (fs.existsSync(mod.imgPath) && fs.statSync(mod.imgPath).size > 0) return false;
    } catch {
      /* treat as missing */
    }
  }
  return true;
}

/**
 * If the workshop item has no local cover, fetch Steam `preview_url` into content/<id>/.
 * Does not delete existing valid images; only fills gaps.
 */
export async function ensureWorkshopPreviewImage(
  workshopId: string,
  contentFolder: string,
  log?: LogCallback,
  previewUrlHint?: string,
): Promise<string | null> {
  if (!/^\d{5,15}$/.test(workshopId) || !contentFolder) return null;

  const folder = path.join(contentFolder, workshopId);
  const existing = findExistingPreviewInFolder(folder);
  if (existing) return existing;

  let previewUrl = previewUrlHint?.trim() || "";
  if (!previewUrl) {
    try {
      const meta = await fetchWorkshopMetadata([workshopId], log);
      previewUrl = meta.get(workshopId)?.previewUrl?.trim() || "";
    } catch (e) {
      log?.(`Workshop preview: metadata failed for ${workshopId}: ${e}`);
      return null;
    }
  }
  if (!previewUrl) {
    log?.(`Workshop preview: no preview_url for ${workshopId}`);
    return null;
  }

  const ext = extensionFromUrl(previewUrl);
  const destPath = path.join(folder, `${PREVIEW_BASENAME}${ext}`);

  try {
    await downloadToFile(previewUrl, destPath);
    log?.(`Workshop preview: filled ${workshopId} → ${path.basename(destPath)}`);
    return destPath;
  } catch (e) {
    log?.(`Workshop preview: download failed for ${workshopId}: ${e}`);
    return null;
  }
}

/** @deprecated Prefer {@link ensureWorkshopPreviewImage} (fill-missing only). */
export async function refreshWorkshopPreviewImage(
  workshopId: string,
  contentFolder: string,
  log?: LogCallback,
  previewUrlHint?: string,
): Promise<string | null> {
  return ensureWorkshopPreviewImage(workshopId, contentFolder, log, previewUrlHint);
}

async function mapWithConcurrency<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  if (items.length === 0) return;
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const i = nextIndex++;
      await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
}

/**
 * Fill missing covers for workshop mods using Steam preview_url.
 * Optional previewUrlById avoids extra metadata calls when enrichment already fetched them.
 */
export async function fillMissingWorkshopPreviews(
  mods: Mod[],
  contentFolder: string,
  log?: LogCallback,
  options: {
    concurrency?: number;
    previewUrlById?: Map<string, string | undefined>;
  } = {},
): Promise<number> {
  if (!contentFolder) return 0;
  const missing = mods.filter(modNeedsWorkshopPreview);
  if (missing.length === 0) return 0;

  let filled = 0;
  await mapWithConcurrency(missing, options.concurrency ?? DEFAULT_CONCURRENCY, async (mod) => {
    const hint = options.previewUrlById?.get(mod.workshopId);
    const pathSaved = await ensureWorkshopPreviewImage(mod.workshopId, contentFolder, log, hint);
    if (pathSaved) {
      mod.imgPath = pathSaved;
      filled++;
    }
  });

  if (filled > 0) log?.(`Workshop preview: filled ${filled} missing cover(s)`);
  return filled;
}
