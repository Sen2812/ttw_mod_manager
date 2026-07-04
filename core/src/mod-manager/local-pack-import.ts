/**
 * Import, overwrite, and delete local .pack files in the game's data/ tree.
 */

import * as fs from "fs";
import * as path from "path";
import type { Mod } from "../types";
import type { LogCallback } from "./mod-discovery";

export type LocalPackSkipReason = "NOT_PACK" | "VANILLA_PACK";

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
  overwritten: string[];
  skipped: LocalPackSkipped[];
  failed: LocalPackFailed[];
}

export interface DeleteLocalModResult {
  ok: boolean;
  error?: "NOT_FOUND" | "NOT_LOCAL_MOD" | "VANILLA_PACK" | "NO_GAME_PATH" | "DELETE_FAILED";
  message?: string;
}

/** Mods under the game data/ folder (data/ or data/modding/), not Workshop content. */
export function isLocalMod(mod: Pick<Mod, "isInData">): boolean {
  return mod.isInData === true;
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

function deployPackToDest(sourcePath: string, destPath: string): void {
  fs.copyFileSync(sourcePath, destPath);
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
  const overwritten: string[] = [];
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

    if (!fs.existsSync(normalized)) {
      failed.push({ path: sourcePath, error: "SOURCE_NOT_FOUND" });
      continue;
    }

    const destPath = path.join(moddingFolder, fileName);
    const dataCopyPath = path.join(dataFolder, fileName);
    const existed = fs.existsSync(destPath) || fs.existsSync(dataCopyPath);

    try {
      deployPackToDest(normalized, destPath);
      if (fs.existsSync(dataCopyPath)) {
        deployPackToDest(normalized, dataCopyPath);
      }
      copyThumbnails(normalized, fileName, dataFolder);
      if (existed) {
        overwritten.push(fileName);
        log?.(`Overwrote local mod: ${fileName}`);
      } else {
        imported.push(fileName);
        log?.(`Imported local mod: ${fileName}`);
      }
    } catch (e) {
      failed.push({
        path: sourcePath,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return { imported, overwritten, skipped, failed };
}

/** Remove a local mod's pack, optional data/ deploy copy, and thumbnails. */
export function deleteLocalModFiles(options: {
  mod: Mod;
  moddingFolder: string;
  dataFolder: string;
  log?: LogCallback;
}): void {
  const { mod, moddingFolder, dataFolder, log } = options;
  const baseName = mod.name.replace(/\.pack$/i, "");
  const paths = new Set<string>();

  if (mod.isInModding) {
    paths.add(path.join(moddingFolder, mod.name));
  }
  paths.add(path.join(dataFolder, mod.name));
  for (const ext of [".png", ".jpg"]) {
    paths.add(path.join(dataFolder, baseName + ext));
  }

  for (const filePath of paths) {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        log?.(`Deleted local mod file: ${filePath}`);
      }
    } catch (e) {
      throw new Error(
        `Failed to delete ${filePath}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
}
