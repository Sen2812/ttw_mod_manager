/**
 * Node-only workshop force-update (delete local content + restart Steam).
 * Renderer must NOT import this module — use workshop-update-status.ts instead.
 */

import * as fs from "fs";
import * as path from "path";
import { spawn } from "child_process";

/**
 * Delete local workshop content so Steam re-downloads on next sync.
 * Optionally starts the Steam client to trigger workshop downloads.
 */
export async function forceWorkshopModUpdate(options: {
  contentFolder: string;
  workshopId: string;
  steamPath?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const folder = path.join(options.contentFolder, options.workshopId);
  if (!fs.existsSync(folder)) {
    return { ok: false, error: "WORKSHOP_FOLDER_NOT_FOUND" };
  }

  try {
    fs.rmSync(folder, { recursive: true, force: true });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  if (options.steamPath) {
    const steamExe = path.join(
      options.steamPath,
      process.platform === "win32" ? "steam.exe" : "steam.sh",
    );
    if (fs.existsSync(steamExe)) {
      spawn(steamExe, [], { detached: true, stdio: "ignore" }).unref();
    }
  }

  return { ok: true };
}

export {
  UPDATE_TIME_TOLERANCE_MS,
  getModUpdateStatus,
  isModOutdated,
  countOutdatedMods,
  applyWorkshopTimeUpdatedToMods,
} from "./workshop-update-status";
export type { ModUpdateStatus } from "./workshop-update-status";
