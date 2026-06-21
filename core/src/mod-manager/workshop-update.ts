/**
 * Node-only workshop update helpers.
 * Renderer must NOT import this module — use workshop-update-status.ts instead.
 *
 * Force-update no longer deletes local workshop folders; Steam DownloadItem updates
 * content in place so mods stay usable if the download fails or is slow.
 */

export {
  UPDATE_TIME_TOLERANCE_MS,
  getModUpdateStatus,
  isModOutdated,
  countOutdatedMods,
  applyWorkshopTimeUpdatedToMods,
} from "./workshop-update-status";
export type { ModUpdateStatus } from "./workshop-update-status";
