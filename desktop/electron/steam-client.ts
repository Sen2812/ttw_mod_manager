import { fork } from "child_process";
import * as fs from "fs";
import { app } from "electron";
import * as path from "path";
import { fileURLToPath } from "url";

const STEAM_SUB_TIMEOUT_MS = 120_000;
const STEAM_DOWNLOAD_TIMEOUT_MS = 60_000;
const STEAM_PING_TIMEOUT_MS = 8_000;

/** Thrown when Steam process exists but steamworks IPC is unavailable (e.g. offline mode). */
export class SteamIpcUnavailableError extends Error {
  constructor(detail?: string) {
    super(detail ?? "Steam IPC unavailable");
    this.name = "SteamIpcUnavailableError";
  }
}

export function isSteamIpcErrorMessage(message: string): boolean {
  return /ipc pipe|steam is probably not running/i.test(message);
}

/** Serialize steam-sub calls — concurrent steamworks.init() can disrupt active downloads. */
let steamSubChain: Promise<unknown> = Promise.resolve();

function resolveSteamSubPath(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.join(here, "steam-sub.cjs"),
    path.join(app.getAppPath(), "dist-electron", "steam-sub.cjs"),
    path.join(process.resourcesPath, "app.asar.unpacked", "dist-electron", "steam-sub.cjs"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return candidates[0];
}

function runSteamSubOnce<T extends Record<string, unknown>>(
  appId: number,
  command: string,
  extraArg?: string,
  timeoutMs = STEAM_SUB_TIMEOUT_MS,
): Promise<T> {
  const steamSubPath = resolveSteamSubPath();
  const appRoot = path.dirname(path.dirname(steamSubPath));
  const args = extraArg !== undefined
    ? [String(appId), command, extraArg]
    : [String(appId), command];

  return new Promise((resolve, reject) => {
    const child = fork(steamSubPath, args, {
      stdio: ["pipe", "pipe", "pipe", "ipc"],
      cwd: appRoot,
    });

    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };

    const timer = setTimeout(() => {
      child.kill();
      finish(() => reject(new Error("Steam request timed out")));
    }, timeoutMs);

    child.once("message", (msg: T | { __error: string } | null) => {
      if (msg && typeof msg === "object" && "__error" in msg) {
        finish(() => reject(new Error(String(msg.__error))));
        return;
      }
      finish(() => resolve(msg as T));
    });

    child.once("error", (err) => finish(() => reject(err)));
    child.once("exit", (code) => {
      if (!settled) {
        finish(() => reject(new Error(
          code === 0
            ? "steam-sub exited without response"
            : `steam-sub exited with code ${code}`,
        )));
      }
    });
  });
}

function runSteamSub<T extends Record<string, unknown>>(
  appId: number,
  command: string,
  extraArg?: string,
  timeoutMs = STEAM_SUB_TIMEOUT_MS,
): Promise<T> {
  const next = steamSubChain.then(
    () => runSteamSubOnce<T>(appId, command, extraArg, timeoutMs),
    () => runSteamSubOnce<T>(appId, command, extraArg, timeoutMs),
  );
  steamSubChain = next.then(() => undefined, () => undefined);
  return next;
}

/** Check whether steamworks can connect to the running Steam client. */
export async function probeSteamIpc(appId: number): Promise<{ ok: boolean; error?: string }> {
  try {
    const msg = await runSteamSub<{ ok?: boolean; error?: string }>(
      appId,
      "ping",
      undefined,
      STEAM_PING_TIMEOUT_MS,
    );
    if (msg.ok) return { ok: true };
    return { ok: false, error: msg.error ?? "Steam IPC unavailable" };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    return { ok: false, error };
  }
}

/** Fetch workshop required mod IDs via steamworks.js (Steam client must be running). */
export async function fetchWorkshopDependenciesViaSteam(
  appId: number,
  workshopIds: string[],
): Promise<Map<string, string[]>> {
  if (workshopIds.length === 0) return new Map();

  try {
    const msg = await runSteamSub<Record<string, string[]>>(
      appId,
      "getDependencies",
      workshopIds.join(","),
    );

    const map = new Map<string, string[]>();
    for (const [id, deps] of Object.entries(msg)) {
      if (Array.isArray(deps)) map.set(id, deps);
    }
    return map;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (isSteamIpcErrorMessage(message)) throw new SteamIpcUnavailableError(message);
    throw e;
  }
}

/** Fetch currently subscribed workshop item IDs via steamworks.js. */
export async function fetchSubscribedWorkshopIdsViaSteam(appId: number): Promise<string[]> {
  try {
    const msg = await runSteamSub<{ ids?: string[] }>(appId, "getSubscribed");
    return Array.isArray(msg.ids) ? msg.ids : [];
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (isSteamIpcErrorMessage(message)) throw new SteamIpcUnavailableError(message);
    throw e;
  }
}

export interface WorkshopItemDownloadStatus {
  state: number;
  downloadCurrent: number;
  downloadTotal: number;
  installFolder: string;
  folderMissing?: boolean;
}

/** True while Steam is actively downloading or has queued download bytes. */
export function isWorkshopDownloadInProgress(status: WorkshopItemDownloadStatus): boolean {
  const ITEM_DOWNLOADING = 16;
  const ITEM_DOWNLOAD_PENDING = 32;
  const { state, downloadCurrent, downloadTotal } = status;
  if (state & ITEM_DOWNLOADING || state & ITEM_DOWNLOAD_PENDING) return true;
  if (downloadTotal > 0 && downloadCurrent < downloadTotal) return true;
  return false;
}

/** Steam reported success but no download was actually queued (stale install record). */
export function isWorkshopDownloadStalled(status: WorkshopItemDownloadStatus): boolean {
  return !isWorkshopDownloadInProgress(status) && !!status.folderMissing;
}

export interface WorkshopDownloadTriggerResult extends WorkshopItemDownloadStatus {
  triggered: boolean;
  mode?: string;
  error?: string;
}

/** Ask Steam to download or update workshop items via ISteamUGC#DownloadItem (high priority). */
export async function triggerWorkshopDownloadsViaSteam(
  appId: number,
  workshopIds: string[],
): Promise<Map<string, WorkshopDownloadTriggerResult>> {
  if (workshopIds.length === 0) return new Map();
  // Match WH3MM: attempt download directly — no pre-flight ping that can false-negative.
  try {
    const msg = await runSteamSub<{ results?: Record<string, WorkshopDownloadTriggerResult> }>(
      appId,
      "downloadItems",
      workshopIds.join(","),
      STEAM_DOWNLOAD_TIMEOUT_MS,
    );
    const map = new Map<string, WorkshopDownloadTriggerResult>();
    for (const [id, result] of Object.entries(msg.results ?? {})) {
      if (result) map.set(id, result);
    }
    return map;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (isSteamIpcErrorMessage(message)) throw new SteamIpcUnavailableError(message);
    throw e;
  }
}

/** Query Steam download/install state for workshop items. */
export async function getWorkshopItemStatusesViaSteam(
  appId: number,
  workshopIds: string[],
): Promise<Map<string, WorkshopItemDownloadStatus>> {
  if (workshopIds.length === 0) return new Map();
  const msg = await runSteamSub<{ results?: Record<string, WorkshopItemDownloadStatus> }>(
    appId,
    "getItemStatus",
    workshopIds.join(","),
  );
  const map = new Map<string, WorkshopItemDownloadStatus>();
  for (const [id, status] of Object.entries(msg.results ?? {})) {
    if (status) map.set(id, status);
  }
  return map;
}
