/**
 * Node-only workshop force-update (delete local content + restart Steam).
 * Renderer must NOT import this module — use workshop-update-status.ts instead.
 */

import * as fs from "fs";
import * as path from "path";

/**
 * Delete local workshop content so Steam can re-download via ISteamUGC#DownloadItem.
 * Caller should invoke syncPendingWorkshopDownloads() to queue the download.
 */
export async function forceWorkshopModUpdate(options: {
  contentFolder: string;
  workshopId: string;
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
