/**
 * Import local .pack files into the game's data/modding/ folder.
 */

import * as fs from "fs";
import * as path from "path";
import type { LogCallback } from "./mod-discovery";

export type LocalPackSkipReason = "NOT_PACK" | "ALREADY_IMPORTED" | "VANILLA_PACK";

export interface LocalPackSkipped {
  path: string;
  reason: LocalPackSkipReason;
}

export interface LocalPackFailed {
  path: string;
  error: string;
}

export interface ImportLocalPacksResult {
  imported: string[];
  skipped: LocalPackSkipped[];
  failed: LocalPackFailed[];
}

function copyThumbnails(sourcePackPath: string, fileName: string, dataFolder: string): void {
  const baseName = fileName.replace(/\.pack$/i, "");
  for (const ext of [".png", ".jpg"]) {
    const srcThumb = path.join(path.dirname(sourcePackPath), baseName + ext);
    if (!fs.existsSync(srcThumb)) continue;
    try {
      fs.copyFileSync(srcThumb, path.join(dataFolder, baseName + ext));
    } catch {
      // Thumbnail is optional
    }
  }
}

export function importLocalPackFiles(options: {
  sourcePaths: string[];
  moddingFolder: string;
  dataFolder: string;
  vanillaPacks?: Set<string>;
  log?: LogCallback;
}): ImportLocalPacksResult {
  const { sourcePaths, moddingFolder, dataFolder, vanillaPacks, log } = options;
  const imported: string[] = [];
  const skipped: LocalPackSkipped[] = [];
  const failed: LocalPackFailed[] = [];

  fs.mkdirSync(moddingFolder, { recursive: true });
  fs.mkdirSync(dataFolder, { recursive: true });

  for (const sourcePath of sourcePaths) {
    const normalized = path.normalize(sourcePath);
    if (!normalized.toLowerCase().endsWith(".pack")) {
      skipped.push({ path: sourcePath, reason: "NOT_PACK" });
      continue;
    }

    const fileName = path.basename(normalized);
    if (vanillaPacks?.has(fileName)) {
      skipped.push({ path: sourcePath, reason: "VANILLA_PACK" });
      continue;
    }

    const destPath = path.join(moddingFolder, fileName);
    if (fs.existsSync(destPath)) {
      skipped.push({ path: sourcePath, reason: "ALREADY_IMPORTED" });
      continue;
    }

    if (!fs.existsSync(normalized)) {
      failed.push({ path: sourcePath, error: "SOURCE_NOT_FOUND" });
      continue;
    }

    try {
      fs.copyFileSync(normalized, destPath);
      copyThumbnails(normalized, fileName, dataFolder);
      imported.push(fileName);
      log?.(`Imported local mod: ${fileName}`);
    } catch (e) {
      failed.push({
        path: sourcePath,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return { imported, skipped, failed };
}
