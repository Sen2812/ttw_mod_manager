import { app, BrowserWindow, ipcMain, dialog, protocol, net, shell } from "electron";
import { exec, execSync, spawn } from "child_process";
import * as path from "path";
import * as fs from "fs";

import { ModManager, sortByLoadOrder } from "../../core/src";
import { gameRegistry, BUILTIN_GAMES } from "../../core/src";
import { SupportedGame, Mod, Preset } from "../../core/src";
import { findSteamPath as coreFindSteamPath } from "../../core/src/mod-manager/mod-discovery";
import { syncModsToLauncher } from "../../core/src/launcher/launcher-sync";
import { generateUsedModsContent } from "../../core/src/launcher/used-mods";
import { readPackIndex } from "../../core/src/pack-file/pack-index-reader";
import { detectOverwrites } from "../../core/src/compat/overwrite-detector";
import { countOutdatedMods, isModOutdated } from "../../core/src/mod-manager/workshop-update-status";
import { workshopFolderHasValidPack } from "../../core/src/mod-manager/mod-discovery";
import { setWorkshopRequiredIdsFetcher } from "../../core/src/mod-manager/workshop-required-fetcher";
import { setWorkshopSubscriptionsFetcher } from "../../core/src/mod-manager/workshop-subscriptions-fetcher";
import {
  fetchWorkshopDependenciesViaSteam,
  fetchSubscribedWorkshopIdsViaSteam,
  triggerWorkshopDownloadsViaSteam,
  getWorkshopItemStatusesViaSteam,
  probeSteamIpc,
  isWorkshopDownloadInProgress,
  type WorkshopDownloadTriggerResult,
} from "./steam-client";
import { getSteamClientStatus } from "./steam-status";

let mainWindow: BrowserWindow | null = null;
let mm: ModManager;
let dataDir: string; // 数据持久化目录
let initPromise: Promise<void> | null = null;
let deferredWorkshopGeneration = 0;
let appLog: (msg: string) => void = msg => console.log(msg);
let hasUnsavedChanges = false; // 追踪未保存的更改
// 关闭确认：主进程等待渲染进程返回决定（save / discard / cancel）
let pendingCloseDecision: ((choice: "save" | "discard" | "cancel") => void) | null = null;
let isConfirmingClose = false; // 防止重复弹窗
let gameLaunchInProgress = false;

const GAME_LAUNCH_COOLDOWN_MS = 3000;

for (const game of BUILTIN_GAMES) gameRegistry.register(game);

// ─── 数据目录管理 ────────────────────────────────────────────────────────────

const SETTINGS_FILE = "settings.json";

function getSettingsPath(): string { return path.join(app.getPath("userData"), SETTINGS_FILE); }

function loadSettings(): { dataDir?: string } {
  try { return JSON.parse(fs.readFileSync(getSettingsPath(), "utf8")); } catch { return {}; }
}

function saveSettings(s: any): void {
  try { fs.writeFileSync(getSettingsPath(), JSON.stringify(s, null, 2), "utf8"); } catch {}
}

function ensureDataDir(dir: string): void { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); }

const APP_LOG_FILE = "app.log";

/** Append logs to dataDir/app.log for player support uploads. */
function createAppLogger(logPath: string): (msg: string) => void {
  try {
    fs.writeFileSync(
      logPath,
      `--- session ${new Date().toISOString()} ---\n`,
      { flag: "a" },
    );
  } catch { /* ignore */ }

  return (msg: string) => {
    const line = `[${new Date().toISOString()}] ${msg}`;
    console.log(line);
    try {
      fs.appendFileSync(logPath, line + "\n", "utf8");
    } catch { /* ignore */ }
  };
}

async function ensureInit(): Promise<void> {
  if (!initPromise) throw new Error("ModManager not started");
  await initPromise;
}

function buildBootstrapPayload() {
  const ui = loadUiState();
  return {
    currentGame: mm.config.currentGame,
    games: BUILTIN_GAMES.map(g => ({ id: g.id, name: g.displayName })),
    presets: mm.getPresets(),
    currentPresetName: mm.getActivePresetName(),
    folderPaths: mm.folderPaths,
    profileFilterModes: ui.profileFilterModes ?? {},
    modFilterMode: ui.modFilterMode ?? "all",
    subscribedWorkshopIds: mm.subscribedWorkshopIds,
    dataDir,
    mods: mm.getMods(),
    preferences: {
      isClosedOnPlay: mm.config.preferences.isClosedOnPlay,
    },
  };
}

/** Check whether the game executable is already running. */
function isGameProcessRunning(processName: string): boolean {
  try {
    if (process.platform === "win32") {
      const output = execSync(`tasklist /FI "IMAGENAME eq ${processName}" /FO CSV /NH`, {
        encoding: "utf8",
        timeout: 5000,
      });
      return output.toLowerCase().includes(processName.toLowerCase());
    }
    const baseName = processName.replace(/\.exe$/i, "");
    execSync(`pgrep -x "${baseName}"`, { stdio: "ignore", timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

function notifyModsUpdated(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("mods-updated", {
    mods: mm.getMods(),
    subscribedWorkshopIds: mm.subscribedWorkshopIds,
    outdatedCount: countOutdatedMods(mm.getMods()),
  });
}

function notifyPrerequisitesCheckStarted(modName: string): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("prerequisites-check-started", modName);
}

function notifyPrerequisitesCheckDone(modName: string): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("prerequisites-check-done", modName);
}

/** Run prerequisite fetch in background so toggle/enable IPC returns immediately. */
function runModPrerequisitesCheck(modName: string): void {
  void (async () => {
    const steamOk = await isSteamIpcAvailable();
    if (steamOk) {
      notifyPrerequisitesCheckStarted(modName);
      try {
        await mm.ensureModPrerequisites(modName);
        notifyModsUpdated();
      } catch (e) {
        appLog(`Prerequisites check failed for ${modName}: ${e}`);
      }
    }
    notifyPrerequisitesCheckDone(modName);
  })();
}

let cachedSteamIpc: { available: boolean; at: number } | null = null;
const STEAM_IPC_CACHE_MS = 30_000;

function recordSteamIpcAvailable(available: boolean): void {
  cachedSteamIpc = { available, at: Date.now() };
}

function invalidateSteamIpcCache(): void {
  cachedSteamIpc = null;
}

async function isSteamIpcAvailable(): Promise<boolean> {
  const now = Date.now();
  if (cachedSteamIpc && now - cachedSteamIpc.at < STEAM_IPC_CACHE_MS) {
    return cachedSteamIpc.available;
  }
  const appId = getCurrentSteamAppId();
  if (!appId) {
    recordSteamIpcAvailable(false);
    return false;
  }
  const probe = await probeSteamIpc(appId);
  recordSteamIpcAvailable(probe.ok);
  return probe.ok;
}

function getCurrentSteamAppId(): number | undefined {
  const game = BUILTIN_GAMES.find(g => g.id === mm.config?.currentGame);
  const appId = Number(game?.steamId);
  return appId || undefined;
}

let pendingDownloadPollTimer: ReturnType<typeof setInterval> | null = null;
/** Workshop IDs with an active download request — never re-trigger until pack appears or force-update. */
const pendingDownloadLocked = new Set<string>();
const pendingDownloadLockedAt = new Map<string, number>();
let syncPendingInFlight: Promise<void> | null = null;
let deferredWorkshopRunning = false;
let lastDownloadProgressRefresh = 0;
const PENDING_POLL_MS = 15_000;
const DOWNLOAD_PROGRESS_REFRESH_MS = 60_000;
const STUCK_DOWNLOAD_RETRY_MS = 45_000;

function lockPendingDownload(workshopId: string): void {
  pendingDownloadLocked.add(workshopId);
  pendingDownloadLockedAt.set(workshopId, Date.now());
}

function unlockPendingDownload(workshopId: string): void {
  pendingDownloadLocked.delete(workshopId);
  pendingDownloadLockedAt.delete(workshopId);
}

function workshopDownloadQueued(result: WorkshopDownloadTriggerResult): boolean {
  if (!result.triggered) return false;
  if (isWorkshopDownloadInProgress(result)) return true;
  if ((result.downloadTotal ?? 0) > 0) return true;
  return result.mode !== "in_progress" && result.mode !== "download_rejected";
}

function workshopFolderHasPack(contentFolder: string, workshopId: string): boolean {
  return workshopFolderHasValidPack(contentFolder, workshopId);
}

const scanWhileDownloadingOpts = {
  deferNetwork: true as const,
  skipSteamSubscriptionFetch: true as const,
};

function stopPendingDownloadPoll(): void {
  if (pendingDownloadPollTimer) {
    clearInterval(pendingDownloadPollTimer);
    pendingDownloadPollTimer = null;
  }
}

async function applyPendingDownloadStatus(mods: Mod[]): Promise<Mod[]> {
  const appId = getCurrentSteamAppId();
  if (!appId || !(await isSteamIpcAvailable())) return mods;
  const pending = mods.filter(m => m.pendingDownload && m.workshopId);
  if (pending.length === 0) return mods;

  try {
    const statuses = await getWorkshopItemStatusesViaSteam(
      appId,
      pending.map(m => m.workshopId),
    );
    return mods.map(m => {
      if (!m.pendingDownload || !m.workshopId) return m;
      const st = statuses.get(m.workshopId);
      if (!st) return m;
      return {
        ...m,
        downloadBytesCurrent: st.downloadCurrent,
        downloadBytesTotal: st.downloadTotal,
      };
    });
  } catch {
    return mods;
  }
}

async function syncPendingWorkshopDownloads(forceIds?: string[]): Promise<void> {
  if (syncPendingInFlight) return syncPendingInFlight;
  syncPendingInFlight = syncPendingWorkshopDownloadsInner(forceIds).finally(() => {
    syncPendingInFlight = null;
  });
  return syncPendingInFlight;
}

async function syncPendingWorkshopDownloadsInner(forceIds?: string[]): Promise<void> {
  await ensureInit();
  const appId = getCurrentSteamAppId();
  if (!appId) return;

  const pending = mm.getMods().filter(m =>
    m.pendingDownload && m.workshopId && !m.isInData
    && mm.subscribedWorkshopIds.includes(m.workshopId),
  );
  if (pending.length === 0) {
    stopPendingDownloadPoll();
    return;
  }

  const ids = pending.map(m => m.workshopId);
  const forceSet = new Set(forceIds ?? []);

  for (const id of forceSet) unlockPendingDownload(id);

  const toTrigger = ids.filter(id => {
    if (pendingDownloadLocked.has(id)) return false;
    return true;
  });

  if (toTrigger.length > 0) {
    for (const id of toTrigger) lockPendingDownload(id);
    try {
      const results = await triggerWorkshopDownloadsViaSteam(appId, toTrigger);
      let ok = 0;
      for (const [id, result] of results) {
        if (workshopDownloadQueued(result)) {
          ok++;
          continue;
        }
        unlockPendingDownload(id);
        appLog(
          `Workshop ${id}: download not started (mode=${result.mode ?? "unknown"}, `
          + `state=${result.state}, folderMissing=${result.folderMissing ?? "?"})`,
        );
      }
      appLog(`Steam download requested for ${ok}/${toTrigger.length} pending workshop item(s)`);
    } catch (e) {
      appLog(`Steam download request failed: ${e}`);
    }
  }

  await mm.scanMods(scanWhileDownloadingOpts);
  mm.mods = await applyPendingDownloadStatus(mm.getMods());
  notifyModsUpdated();
  startPendingDownloadPoll();
}

function startPendingDownloadPoll(): void {
  if (pendingDownloadPollTimer) return;
  pendingDownloadPollTimer = setInterval(() => {
    void pollPendingDownloads();
  }, PENDING_POLL_MS);
}

/** Lightweight poll: filesystem for completion; Steam API for progress at most once per minute. */
async function pollPendingDownloads(): Promise<void> {
  try {
    await ensureInit();
    const pending = mm.getMods().filter(m => m.pendingDownload && m.workshopId);
    if (pending.length === 0) {
      stopPendingDownloadPoll();
      return;
    }

    const contentFolder = mm.folderPaths?.contentFolder;
    if (!contentFolder) return;

    let packReady = false;
    for (const mod of pending) {
      if (workshopFolderHasPack(contentFolder, mod.workshopId)) {
        unlockPendingDownload(mod.workshopId);
        packReady = true;
      }
    }

    const now = Date.now();
    const stuckIds = pending
      .filter((mod) => {
        if (!pendingDownloadLocked.has(mod.workshopId)) return false;
        if (workshopFolderHasPack(contentFolder, mod.workshopId)) return false;
        const lockedAt = pendingDownloadLockedAt.get(mod.workshopId) ?? 0;
        if (now - lockedAt < STUCK_DOWNLOAD_RETRY_MS) return false;
        const noBytes = !mod.downloadBytesTotal || mod.downloadBytesTotal === 0;
        return noBytes;
      })
      .map(mod => mod.workshopId);
    if (stuckIds.length > 0) {
      appLog(`Retrying stuck workshop download(s): ${stuckIds.join(", ")}`);
      for (const id of stuckIds) unlockPendingDownload(id);
      await syncPendingWorkshopDownloads(stuckIds);
    }

    if (packReady) {
      await mm.scanMods(scanWhileDownloadingOpts);
      notifyModsUpdated();
      if (!mm.getMods().some(m => m.pendingDownload)) {
        stopPendingDownloadPoll();
      }
      return;
    }

    if (now - lastDownloadProgressRefresh >= DOWNLOAD_PROGRESS_REFRESH_MS) {
      lastDownloadProgressRefresh = now;
      mm.mods = await applyPendingDownloadStatus(mm.getMods());
      notifyModsUpdated();
    }

    const appId = getCurrentSteamAppId();
    const outdated = mm.getMods().filter(m => m.workshopId && isModOutdated(m) && modHasLocalPack(m));
    if (appId && outdated.length > 0) {
      try {
        const statuses = await getWorkshopItemStatusesViaSteam(
          appId,
          outdated.map(m => m.workshopId),
        );
        const finished = outdated.some(m => {
          const st = statuses.get(m.workshopId);
          return st && st.downloadTotal > 0 && st.downloadCurrent >= st.downloadTotal;
        });
        if (finished) {
          await mm.scanMods(scanWhileDownloadingOpts);
          await mm.checkModUpdates(true);
          notifyModsUpdated();
        }
      } catch {
        /* ignore progress probe errors */
      }
    }
  } catch (e) {
    appLog(`Pending download poll failed: ${e}`);
  }
}

function modHasLocalPack(mod: Mod): boolean {
  if (!mod.path) return false;
  try {
    return fs.existsSync(mod.path);
  } catch {
    return false;
  }
}

/**
 * Ask Steam to update a workshop item without deleting local files.
 * Keeps the existing .pack usable when the download fails or has not finished.
 */
async function forceWorkshopUpdateViaSteam(mod: Mod): Promise<{
  ok: boolean;
  error?: string;
  errorCode?: string;
  downloadTriggered?: boolean;
}> {
  if (!mod.workshopId) {
    return { ok: false, error: "NOT_WORKSHOP_MOD", errorCode: "NOT_WORKSHOP_MOD" };
  }

  const hadLocalPack = modHasLocalPack(mod);
  const appId = getCurrentSteamAppId();
  if (!appId) {
    return hadLocalPack
      ? { ok: true, downloadTriggered: false }
      : { ok: false, error: "Steam unavailable", errorCode: "STEAM_UNAVAILABLE" };
  }

  unlockPendingDownload(mod.workshopId);
  lockPendingDownload(mod.workshopId);

  try {
    const results = await triggerWorkshopDownloadsViaSteam(appId, [mod.workshopId]);
    const trigger = results.get(mod.workshopId);
    const downloadTriggered = trigger ? workshopDownloadQueued(trigger) : false;

    if (!downloadTriggered && !hadLocalPack) {
      unlockPendingDownload(mod.workshopId);
      await mm.scanMods(scanWhileDownloadingOpts);
      mm.mods = await applyPendingDownloadStatus(mm.getMods());
      return { ok: false, error: "STEAM_DOWNLOAD_FAILED", errorCode: "STEAM_DOWNLOAD_FAILED" };
    }

    if (!hadLocalPack) {
      await mm.scanMods(scanWhileDownloadingOpts);
      mm.mods = await applyPendingDownloadStatus(mm.getMods());
      startPendingDownloadPoll();
    } else {
      startPendingDownloadPoll();
      void mm.checkModUpdates(true).then(() => notifyModsUpdated());
    }

    if (downloadTriggered) {
      appLog(`Force update: Steam download queued for workshop item ${mod.workshopId}`);
    } else if (hadLocalPack) {
      appLog(`Force update: Steam did not queue download for ${mod.workshopId}; local pack kept`);
    }

    return { ok: true, downloadTriggered };
  } catch (e) {
    unlockPendingDownload(mod.workshopId);
    appLog(`Force update failed for ${mod.workshopId}: ${e}`);
    if (hadLocalPack) {
      return { ok: true, downloadTriggered: false };
    }
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      errorCode: "STEAM_DOWNLOAD_FAILED",
    };
  }
}

/** Background workshop metadata sync and update checks after first paint. */
async function runDeferredWorkshopEnrichment(): Promise<void> {
  if (deferredWorkshopRunning) return;
  deferredWorkshopRunning = true;
  const gen = ++deferredWorkshopGeneration;
  try {
    await syncPendingWorkshopDownloads();
    if (gen !== deferredWorkshopGeneration) return;

    // Steam IPC may not be ready during mm.init(); rescan subscriptions now.
    await mm.scanMods({ deferNetwork: true });
    if (gen !== deferredWorkshopGeneration) return;
    notifyModsUpdated();

    await syncPendingWorkshopDownloads();
    if (gen !== deferredWorkshopGeneration) return;

    await mm.enrichWorkshopNetwork();
    if (gen !== deferredWorkshopGeneration) return;
    notifyModsUpdated();

    await mm.checkModUpdates(false);
    if (gen !== deferredWorkshopGeneration) return;
    notifyModsUpdated();
  } catch (e) {
    appLog(`Deferred workshop enrichment failed: ${e}`);
  } finally {
    deferredWorkshopRunning = false;
  }
}

// ─── UI 状态（存在数据目录下）────────────────────────────────────────────────

const UI_STATE_FILE = "ui-state.json";

function loadUiState(): any {
  try { return JSON.parse(fs.readFileSync(path.join(dataDir, UI_STATE_FILE), "utf8")); } catch { return {}; }
}

function saveUiState(patch: any): void {
  const current = loadUiState();
  try { fs.writeFileSync(path.join(dataDir, UI_STATE_FILE), JSON.stringify({ ...current, ...patch }, null, 2), "utf8"); } catch {}
}

// ─── Preset 持久化（存在数据目录下）──────────────────────────────────────────

function getPresetsPath(gameId: string): string { return path.join(dataDir, "presets-" + gameId + ".json"); }

function loadPresets(gameId: string): Preset[] {
  try { return JSON.parse(fs.readFileSync(getPresetsPath(gameId), "utf8")); } catch { return []; }
}

function savePresetsToDisk(gameId: string, presets: Preset[]): void {
  try { fs.writeFileSync(getPresetsPath(gameId), JSON.stringify(presets, null, 2), "utf8"); } catch {}
}

// ─── Steam 路径 ──────────────────────────────────────────────────────────────

// 使用 core 库的 findSteamPath，保持同步包装
let cachedSteamPath: string | undefined;
async function findSteamPath(): Promise<string | undefined> {
  if (cachedSteamPath !== undefined) return cachedSteamPath;
  cachedSteamPath = await coreFindSteamPath();
  return cachedSteamPath;
}

// ─── IPC ──────────────────────────────────────────────────────────────────────

function syncModsFromRenderer(mods: Mod[]): void {
  mm.syncModsFromClient(mods);
}

function profileOrderExportFilename(profileName: string): string {
  const safe = profileName.replace(/[\\/:*?"<>|]/g, "_").trim() || "profile";
  return `${safe}.json`;
}

function writeProfileOrderExport(profileName: string): { ok: boolean; path?: string; error?: string } {
  try {
    const data = mm.buildProfileOrderExport(profileName);
    const result = dialog.showSaveDialogSync({
      title: "Export load order",
      defaultPath: profileOrderExportFilename(profileName),
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (!result) return { ok: false };
    fs.writeFileSync(result, JSON.stringify(data, null, 2), "utf8");
    return { ok: true, path: result };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}

function readProfileOrderImport(): {
  ok: boolean;
  mods?: Mod[];
  applied?: number;
  skipped?: number;
  skippedNames?: string[];
  error?: string;
} {
  try {
    const result = dialog.showOpenDialogSync({
      title: "Import load order",
      filters: [{ name: "JSON", extensions: ["json"] }],
      properties: ["openFile"],
    });
    if (!result?.length) return { ok: false };
    const raw = JSON.parse(fs.readFileSync(result[0], "utf8"));
    if (!raw?.mods || !Array.isArray(raw.mods)) {
      return { ok: false, error: "INVALID_FORMAT" };
    }
    const importResult = mm.applyProfileOrderImport(raw);
    return { ok: true, mods: mm.getMods(), ...importResult };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}

function registerIpc() {
  // ── 启动引导（等待后台 init，一次返回配置 + mod 列表）──────────────────
  ipcMain.handle("bootstrap", async () => {
    await ensureInit();
    return buildBootstrapPayload();
  });

  ipcMain.handle("get-steam-status", async () => {
    const appId = getCurrentSteamAppId();
    const status = await getSteamClientStatus(appId);
    recordSteamIpcAvailable(status.ipcAvailable);
    return status;
  });

  // ── 配置 ─────────────────────────────────────────────────────────────────
  ipcMain.handle("get-config", async () => {
    await ensureInit();
    const ui = loadUiState();
    return {
      currentGame: mm.config.currentGame,
      games: BUILTIN_GAMES.map(g => ({ id: g.id, name: g.displayName })),
      presets: mm.getPresets(),
      currentPresetName: mm.getActivePresetName(),
      folderPaths: mm.folderPaths,
      profileFilterModes: ui.profileFilterModes ?? {},
      modFilterMode: ui.modFilterMode ?? "all",
      subscribedWorkshopIds: mm.subscribedWorkshopIds,
      dataDir,
      preferences: {
        isClosedOnPlay: mm.config.preferences.isClosedOnPlay,
      },
    };
  });

  ipcMain.handle("get-preferences", async () => {
    await ensureInit();
    return {
      isClosedOnPlay: mm.config.preferences.isClosedOnPlay,
    };
  });

  ipcMain.handle("set-preferences", async (_e, patch: { isClosedOnPlay?: boolean }) => {
    await ensureInit();
    if (typeof patch.isClosedOnPlay === "boolean") {
      mm.config.preferences.isClosedOnPlay = patch.isClosedOnPlay;
    }
    mm.saveConfig();
    await mm.flush();
    return {
      ok: true,
      preferences: {
        isClosedOnPlay: mm.config.preferences.isClosedOnPlay,
      },
    };
  });

  // ── UI 状态 ──────────────────────────────────────────────────────────────
  ipcMain.handle("save-ui-state", (_e, state: any) => { saveUiState(state); return { ok: true }; });
  
  // ── 未保存更改状态 ──────────────────────────────────────────────────────
  ipcMain.handle("set-unsaved-changes", (_e, hasChanges: boolean) => { 
    hasUnsavedChanges = hasChanges; 
    return { ok: true }; 
  });
  ipcMain.handle("has-unsaved-changes", () => hasUnsavedChanges);

  // 渲染进程返回关闭确认决定（save / discard / cancel）
  ipcMain.on("close-decision", (_e, choice: "save" | "discard" | "cancel") => {
    if (pendingCloseDecision) {
      pendingCloseDecision(choice);
      pendingCloseDecision = null;
    }
  });

  // ── Mod 操作 ─────────────────────────────────────────────────────────────
  ipcMain.handle("get-mods", async () => { await ensureInit(); return mm.getMods(); });
  ipcMain.handle("scan-mods", async () => {
    await ensureInit();
    await mm.scanMods({ deferNetwork: true, skipSteamSubscriptionFetch: pendingDownloadLocked.size > 0 });
    return { mods: mm.getMods(), subscribedWorkshopIds: mm.subscribedWorkshopIds };
  });
  ipcMain.handle("import-local-packs", async () => {
    await ensureInit();
    if (!mm.folderPaths.gamePath) {
      return { ok: false, error: "NO_GAME_PATH" };
    }
    const selected = dialog.showOpenDialogSync({
      title: "Import local mods",
      filters: [{ name: "Pack files", extensions: ["pack"] }],
      properties: ["openFile", "multiSelections"],
    });
    if (!selected?.length) return { ok: false, cancelled: true };
    try {
      const importResult = mm.importLocalPacks(selected);
      await mm.scanMods({ deferNetwork: true, skipSteamSubscriptionFetch: pendingDownloadLocked.size > 0 });
      return { ok: true, ...importResult, mods: mm.getMods() };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  });
  ipcMain.handle("delete-local-mod", async (_e, modName: string) => {
    await ensureInit();
    const result = mm.deleteLocalMod(modName);
    if (!result.ok) return result;
    await mm.scanMods({ deferNetwork: true, skipSteamSubscriptionFetch: pendingDownloadLocked.size > 0 });
    return { ...result, mods: mm.getMods() };
  });
  ipcMain.handle("toggle-mod", async (_e, n: string) => {
    await ensureInit();
    const mod = mm.getMods().find(m => m.name === n);
    const enabling = mod && !mod.isEnabled;
    mm.toggleMod(n);
    if (enabling) runModPrerequisitesCheck(n);
    return mm.getMods();
  });
  ipcMain.handle("enable-mod", async (_e, n: string) => {
    await ensureInit();
    mm.enableMod(n);
    runModPrerequisitesCheck(n);
    return mm.getMods();
  });
  ipcMain.handle("disable-mod", async (_e, n: string) => {
    await ensureInit();
    mm.disableMod(n);
    return mm.getMods();
  });
  ipcMain.handle("enable-all", async () => {
    await ensureInit();
    const skipped = mm.enableAll();
    return { mods: mm.getMods(), skipped };
  });
  ipcMain.handle("disable-all", async () => {
    await ensureInit();
    mm.disableAll();
    return mm.getMods();
  });
  ipcMain.handle("apply-drag-order", async (_e, names: string[]) => {
    await ensureInit();
    const mods = mm.getMods();
    const map = new Map(mods.map(m => [m.name, m]));
    const orderedSet = new Set(names);
    // names 是前端 profile 显示顺序（从上到下）。
    // loadOrder 升序：列表顶部 = loadOrder 0 = 先加载 = 优先级最低；
    // 列表底部 = 最高 loadOrder = 后加载 = 覆盖上方。
    names.forEach((name, i) => {
      const m = map.get(name);
      if (m) m.loadOrder = i;
    });
    if (names.length < mods.length) {
      let nextOrder = names.length;
      for (const m of mods) {
        if (!orderedSet.has(m.name)) {
          m.loadOrder = nextOrder++;
        }
      }
    }
    mm.mods = sortByLoadOrder(mm.mods);
    return mm.getMods();
  });

  // ── 工坊更新 ─────────────────────────────────────────────────────────────
  ipcMain.handle("check-mod-updates", async (_e, force?: boolean) => {
    await ensureInit();
    const result = await mm.checkModUpdates(force === true);
    return result;
  });
  ipcMain.handle("force-update-mod", async (_e, modName: string) => {
    await ensureInit();
    const mod = mm.getMods().find(m => m.name === modName);
    const validation = await mm.forceUpdateMod(modName);
    if (!validation.ok || !mod) {
      return { ...validation, mods: mm.getMods(), outdatedCount: countOutdatedMods(mm.getMods()) };
    }

    const steamResult = await forceWorkshopUpdateViaSteam(mod);
    notifyModsUpdated();
    return {
      ok: steamResult.ok,
      error: steamResult.error,
      errorCode: steamResult.errorCode,
      downloadTriggered: steamResult.downloadTriggered,
      mods: mm.getMods(),
      outdatedCount: countOutdatedMods(mm.getMods()),
    };
  });
  ipcMain.handle("fetch-workshop-titles", async (_e, workshopIds: string[]) => {
    await ensureInit();
    if (!Array.isArray(workshopIds) || workshopIds.length === 0) {
      return { ok: true, applied: 0, mods: mm.getMods() };
    }
    const applied = await mm.fetchWorkshopTitles(workshopIds);
    if (applied > 0) notifyModsUpdated();
    return { ok: true, applied, mods: mm.getMods() };
  });
  ipcMain.handle("trigger-workshop-download", async (_e, workshopId: string) => {
    await ensureInit();
    const appId = getCurrentSteamAppId();
    if (!appId || !/^\d{5,15}$/.test(workshopId)) {
      return { ok: false, error: "INVALID", errorCode: "INVALID", mods: mm.getMods(), subscribedWorkshopIds: mm.subscribedWorkshopIds };
    }
    if (!(await isSteamIpcAvailable())) {
      invalidateSteamIpcCache();
      return {
        ok: false,
        error: "Steam unavailable",
        errorCode: "STEAM_UNAVAILABLE",
        mods: mm.getMods(),
        subscribedWorkshopIds: mm.subscribedWorkshopIds,
      };
    }
    const payload = () => ({ mods: mm.getMods(), subscribedWorkshopIds: mm.subscribedWorkshopIds });
    try {
      if (pendingDownloadLocked.has(workshopId)) {
        mm.mods = await applyPendingDownloadStatus(mm.getMods());
        startPendingDownloadPoll();
        notifyModsUpdated();
        return { ok: true, inProgress: true, ...payload() };
      }
      unlockPendingDownload(workshopId);
      lockPendingDownload(workshopId);
      const results = await triggerWorkshopDownloadsViaSteam(appId, [workshopId]);
      const trigger = results.get(workshopId);
      if (trigger && !workshopDownloadQueued(trigger)) {
        unlockPendingDownload(workshopId);
        invalidateSteamIpcCache();
        await mm.scanMods(scanWhileDownloadingOpts);
        return {
          ok: false,
          error: "STEAM_DOWNLOAD_FAILED",
          errorCode: "STEAM_DOWNLOAD_FAILED",
          ...payload(),
        };
      }
      await mm.scanMods(scanWhileDownloadingOpts);
      mm.mods = await applyPendingDownloadStatus(mm.getMods());
      startPendingDownloadPoll();
      notifyModsUpdated();
      return { ok: true, ...payload() };
    } catch (e: any) {
      unlockPendingDownload(workshopId);
      invalidateSteamIpcCache();
      return { ok: false, error: e?.message ?? String(e), errorCode: "STEAM_DOWNLOAD_FAILED", ...payload() };
    }
  });
  ipcMain.handle("force-update-all-outdated", async () => {
    await ensureInit();
    const outdated = mm.getMods().filter(m => isModOutdated(m));
    const failed: string[] = [];
    let updated = 0;

    for (const mod of outdated) {
      const validation = await mm.forceUpdateMod(mod.name);
      if (!validation.ok) {
        failed.push(mod.name);
        continue;
      }
      const steamResult = await forceWorkshopUpdateViaSteam(mod);
      if (steamResult.ok) updated++;
      else failed.push(mod.name);
    }

    notifyModsUpdated();
    return { updated, failed, mods: mm.getMods(), outdatedCount: countOutdatedMods(mm.getMods()) };
  });

  // ── 覆盖/冲突分析 ───────────────────────────────────────────────────────────
  // Pack 内部文件索引缓存（path → index + mtimeMs + size）。
  // pack 文件除非被更新否则不会变，按 mtime+size 失效。
  const packIndexCache = new Map<string, { index: any; mtimeMs: number; size: number }>();
  async function getCachedPackIndex(packPath: string): Promise<any | null> {
    try {
      const stat = fs.statSync(packPath);
      const cached = packIndexCache.get(packPath);
      if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
        return cached.index;
      }
      const index = await readPackIndex(packPath);
      packIndexCache.set(packPath, { index, mtimeMs: stat.mtimeMs, size: stat.size });
      return index;
    } catch {
      return null;
    }
  }

  // 读取所有启用 mod 的 pack 内部文件索引，按加载顺序检测文件覆盖关系。
  // 每次勾选/取消都会触发，因此使用缓存让重复调用几乎是零成本。
  ipcMain.handle("analyze-overwrites", async (_e, opts?: { statsOnly?: boolean }) => {
    await ensureInit();
    const statsOnly = opts?.statsOnly === true;
    const enabledMods = mm.getEnabledMods();
    if (enabledMods.length === 0) {
      return { conflicts: [], modStats: {}, modsWithConflicts: 0, totalConflicts: 0 };
    }

    const modPathByName = new Map<string, string>();
    const indices = new Map<string, any>();
    await Promise.all(enabledMods.map(async (mod) => {
      modPathByName.set(mod.name, mod.path);
      const idx = await getCachedPackIndex(mod.path);
      if (idx) indices.set(mod.path, idx);
    }));

    const analysis = detectOverwrites(
      enabledMods.map((m, i) => ({
        name: m.name,
        loadOrder: m.loadOrder ?? i,
      })),
      indices,
      { modPathByName, includeConflicts: !statsOnly },
    );

    const modStatsObj: Record<string, any> = {};
    for (const [k, v] of analysis.modStats) modStatsObj[k] = v;

    return {
      conflicts: statsOnly ? [] : analysis.conflicts,
      modStats: modStatsObj,
      modsWithConflicts: analysis.modsWithConflicts,
      totalConflicts: analysis.totalConflicts,
    };
  });

  // ── 保存 mod 状态（显式保存）────────────────────────────────────────────
  ipcMain.handle("save-mod-state", async (_e, mods: Mod[]) => {
    await ensureInit();
    syncModsFromRenderer(mods);
    mm.saveCurrentPreset();
    await mm.flush();
    return { ok: true };
  });

  // ── 保存预设（显式保存）─────────────────────────────────────────────────
  ipcMain.handle("save-presets", async (_e, presets: Preset[]) => {
    await ensureInit();
    // Update core's presets
    const currentGame = mm.config.currentGame;
    mm.config.gamePresets[currentGame] = presets;
    mm.saveConfig();
    await mm.flush();
    return { ok: true };
  });

  // ── 预设操作（使用 core 库的方法）──────────────────────────────────────
  ipcMain.handle("get-presets", async () => {
    await ensureInit();
    return mm.getPresets();
  });
  ipcMain.handle("create-preset", async (_e, n: string, copyFromCurrent?: boolean) => {
    await ensureInit();
    try {
      mm.createPreset(n, copyFromCurrent !== false);
      return mm.getPresets();
    } catch (e: any) {
      return { error: e.message };
    }
  });
  ipcMain.handle("apply-preset", async (_e, n: string) => {
    await ensureInit();
    try {
      mm.applyPreset(n);
      return mm.getMods();
    } catch (e: any) {
      return { error: e.message };
    }
  });
  ipcMain.handle("set-active-preset-name", async (_e, n: string | null) => {
    await ensureInit();
    mm.setActivePresetName(n);
    return { ok: true };
  });
  ipcMain.handle("delete-preset", async (_e, n: string) => {
    await ensureInit();
    try {
      mm.deletePreset(n);
      return {
        presets: mm.getPresets(),
        mods: mm.getMods(),
        activePresetName: mm.getActivePresetName(),
      };
    } catch (e: any) {
      return { error: e.message };
    }
  });
  ipcMain.handle("rename-preset", async (_e, oldName: string, newName: string) => {
    await ensureInit();
    try {
      mm.renamePreset(oldName, newName);
      return { presets: mm.getPresets(), activePresetName: mm.getActivePresetName() };
    } catch (e: any) {
      return { error: e.message };
    }
  });
  ipcMain.handle("export-profile-order", async (_e, profileName: string, mods?: Mod[]) => {
    await ensureInit();
    if (mods?.length) syncModsFromRenderer(mods);
    return writeProfileOrderExport(profileName ?? mm.getActivePresetName());
  });
  ipcMain.handle("import-profile-order", async (_e, mods?: Mod[]) => {
    await ensureInit();
    if (mods?.length) syncModsFromRenderer(mods);
    return readProfileOrderImport();
  });

  // ── 切换游戏 ─────────────────────────────────────────────────────────────
  ipcMain.handle("set-game", async (_e, g: string) => {
    await ensureInit();
    try {
      pendingDownloadLocked.clear();
      pendingDownloadLockedAt.clear();
      await mm.setGame(g as SupportedGame);
      void runDeferredWorkshopEnrichment();
      return {
        mods: mm.getMods(),
        presets: mm.getPresets(),
        folderPaths: mm.folderPaths,
        game: { id: g, name: mm.currentGame?.displayName },
        subscribedWorkshopIds: mm.subscribedWorkshopIds,
      };
    } catch (e: any) {
      const errorMsg = e.message.includes("Unknown game") 
        ? `Game '${g}' is not supported` 
        : `Failed to switch game: ${e.message}`;
      return { error: errorMsg };
    }
  });

  // ── 数据目录 ─────────────────────────────────────────────────────────────
  ipcMain.handle("get-data-dir", () => dataDir);
  ipcMain.handle("select-data-dir", async () => {
    const result = await dialog.showOpenDialog({ properties: ["openDirectory", "createDirectory"], defaultPath: dataDir });
    if (result.canceled || !result.filePaths[0]) return null;
    return result.filePaths[0];
  });
  ipcMain.handle("set-data-dir", async (_e, newDir: string) => {
    await ensureInit();
    ensureDataDir(newDir);
    const settings = loadSettings();
    settings.dataDir = newDir;
    saveSettings(settings);
    dataDir = newDir;
    appLog = createAppLogger(path.join(dataDir, APP_LOG_FILE));
    await mm.setConfigDir(newDir);
    void runDeferredWorkshopEnrichment();
    return { ok: true, ...buildBootstrapPayload() };
  });

  // ── 启动游戏 ─────────────────────────────────────────────────────────────
  // ── 外部链接 / 文件夹 ──
  // 用系统默认浏览器打开 URL（工坊页面等），避免在 Electron 内部打开
  ipcMain.handle("open-url", async (_e, url: string) => {
    try {
      await shell.openExternal(url);
      return { ok: true };
    } catch (e: any) {
      console.error("Failed to open URL:", e.message);
      return { ok: false, error: e.message };
    }
  });

  // 在系统文件资源管理器中打开文件夹（并选中指定文件）
  // 传入文件路径时，会用 showItemInFolder 选中该文件；传入文件夹时用 openPath 打开
  ipcMain.handle("open-folder", async (_e, targetPath: string) => {
    try {
      if (!targetPath) return { ok: false, error: "Empty path" };
      // 判断目标是文件还是目录
      let stat;
      try { stat = fs.statSync(targetPath); } catch { return { ok: false, error: "Path not found" }; }
      if (stat.isFile()) {
        // 选中文件（在资源管理器中高亮）
        shell.showItemInFolder(targetPath);
        return { ok: true };
      }
      // 目录：直接打开
      const err = await shell.openPath(targetPath);
      return { ok: !err, error: err || undefined };
    } catch (e: any) {
      console.error("Failed to open folder:", e.message);
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle("launch-game", async (_e, mods?: Mod[]) => {
    await ensureInit();
    if (gameLaunchInProgress) {
      return { error: "Launch already in progress", errorCode: "LAUNCH_IN_PROGRESS" };
    }

    const game = mm.currentGame;
    if (!game) return { error: "No game selected" };

    if (isGameProcessRunning(game.processName)) {
      return { error: "Game is already running", errorCode: "GAME_ALREADY_RUNNING" };
    }

    gameLaunchInProgress = true;
    try {
      // 使用当前会话中的 mod 状态（含未保存修改），不再重新 applyPreset
      if (mods?.length) syncModsFromRenderer(mods);

      const gamePath = mm.folderPaths?.gamePath;
      const dataFolder = mm.folderPaths?.dataFolder;
      if (!gamePath) return { error: "Game path not found" };
      if (!dataFolder) return { error: "Data folder not found" };

      const enabledMods = mm.getEnabledMods();

      // ── 1. 生成 used_mods.txt 内容 ──
      // UI 列表越靠下优先级越高；写入 used_mods.txt / moddata 时会映射为
      // CA 启动器语义（越靠前 = 优先级越高）。
      const isLinux = process.platform === "linux";
      const { text: usedModsText, modsToCopyToData } = generateUsedModsContent(
        enabledMods,
        dataFolder,
        isLinux,
      );

      // ── 2. 复制 data/modding/ 的 mod 到 data/ 目录 ──
      const copyFailures: string[] = [];
      for (const mod of modsToCopyToData) {
        try {
          const destPath = path.join(dataFolder, mod.name);
          fs.copyFileSync(mod.path, destPath);
        } catch (e: any) {
          copyFailures.push(mod.name);
          console.error(`[launcher] Failed to copy ${mod.name} to data:`, e.message);
        }
      }

      // ── 3. 写入 used_mods.txt 到游戏根目录（不是 data 目录！）──
      const usedModsPath = path.join(gamePath, "used_mods.txt");
      const encoding = game.id === "shogun2" ? "utf16le" : "utf8";
      let modListFileName = "used_mods.txt";
      try {
        fs.writeFileSync(usedModsPath, usedModsText, { encoding });
        console.log(`[launcher] Written ${enabledMods.length} mods to ${usedModsPath}`);
      } catch (e: any) {
        // 某些游戏/安装可能没有写权限到根目录，回退到 my_mods.txt
        console.error(`[launcher] Failed to write used_mods.txt:`, e.message);
        modListFileName = "my_mods.txt";
        try {
          fs.writeFileSync(path.join(gamePath, "my_mods.txt"), usedModsText, { encoding });
        } catch (e2: any) {
          return { error: `Failed to write mod list: ${e2.message}` };
        }
      }

      // ── 4. 同步到 CA 启动器的 moddata.dat（作为备选/兼容）──
      // 这样即使用户之后通过 Steam/CA 启动器启动，mod 状态也是一致的
      try {
        syncModsToLauncher(mm.getMods(), game.launcherGameId, {
          log: (msg) => console.log(`[launcher] ${msg}`),
        });
      } catch (e: any) {
        console.error(`[launcher] Failed to sync moddata.dat:`, e.message);
      }

      // ── 5. 为旧游戏创建 steam_appid.txt（Attila/Rome2/Shogun2 需要）──
      if (["attila", "rome2", "shogun2"].includes(game.id)) {
        const steamAppIdPath = path.join(gamePath, "steam_appid.txt");
        try {
          fs.writeFileSync(steamAppIdPath, game.steamId);
        } catch (e: any) {
          console.error(`[launcher] Failed to create steam_appid.txt:`, e.message);
        }
      }

      // ── 6. 启动游戏可执行文件，并传递 used_mods.txt 作为命令行参数 ──
      // 这是关键步骤！游戏 exe 接收到文件名参数后才会读取 mod 列表
      const gameExePath = path.join(gamePath, game.processName);
      if (!fs.existsSync(gameExePath)) {
        return { error: `Game executable not found: ${gameExePath}` };
      }

      if (isGameProcessRunning(game.processName)) {
        return { error: "Game is already running", errorCode: "GAME_ALREADY_RUNNING" };
      }

      if (isLinux) {
        const batData = `protontricks-launch --cwd-app --appid ${game.steamId} "${gameExePath}" ${modListFileName};`;
        await new Promise<void>((resolve, reject) => {
          exec(batData, (error) => {
            if (error) reject(error);
            else resolve();
          });
        });
      } else {
        await new Promise<void>((resolve, reject) => {
          const child = spawn(game.processName, [modListFileName], {
            cwd: gamePath,
            detached: true,
            stdio: "ignore",
            windowsHide: true,
          });
          child.once("error", reject);
          child.once("spawn", () => {
            child.unref();
            resolve();
          });
        });
      }
      console.log(`[launcher] Game launched with ${enabledMods.length} enabled mods`);
      const closeOnPlay = mm.config.preferences.isClosedOnPlay;
      if (closeOnPlay && mainWindow) {
        hasUnsavedChanges = false;
        setImmediate(() => mainWindow?.close());
      }
      return {
        success: true,
        modsCount: enabledMods.length,
        copyFailures,
        closeOnPlay,
      };
    } catch (e: any) {
      return { error: `Failed to launch game: ${e.message}` };
    } finally {
      setTimeout(() => { gameLaunchInProgress = false; }, GAME_LAUNCH_COOLDOWN_MS);
    }
  });
}

// ─── 窗口 ────────────────────────────────────────────────────────────────────

function getAppIconPath(): string {
  if (app.isPackaged) return path.join(process.resourcesPath, "icon.png");
  return path.join(__dirname, "../build/icon.png");
}

function getPreloadPath(): string {
  const cjs = path.join(__dirname, "preload.cjs");
  if (fs.existsSync(cjs)) return cjs;
  return path.join(__dirname, "preload.js");
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100, height: 720, minWidth: 800, minHeight: 500,
    frame: false, titleBarStyle: "hidden", backgroundColor: "#F5F0EB",
    icon: getAppIconPath(),
    webPreferences: { 
      preload: getPreloadPath(), 
      contextIsolation: true, 
      nodeIntegration: false,
      webSecurity: false,  // 允许访问本地文件
    },
  });
  
  if (process.env.VITE_DEV_SERVER_URL) mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  else mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  
  // 处理窗口关闭事件——用应用内 Morandi 风格弹窗，而非 Windows 原生对话框
  mainWindow.on('close', async (e) => {
    if (!hasUnsavedChanges) return; // 没有未保存修改，直接关闭
    e.preventDefault();
    if (isConfirmingClose) return; // 已在弹窗中，避免重复
    isConfirmingClose = true;
    // 询问渲染进程，等待用户决定
    mainWindow!.webContents.send('confirm-close');
    const CLOSE_DECISION_TIMEOUT_MS = 60_000;
    const choice = await Promise.race([
      new Promise<"save" | "discard" | "cancel">((resolve) => {
        pendingCloseDecision = resolve;
      }),
      new Promise<"save" | "discard" | "cancel">((resolve) => {
        setTimeout(() => resolve("cancel"), CLOSE_DECISION_TIMEOUT_MS);
      }),
    ]);
    pendingCloseDecision = null;
    isConfirmingClose = false;

    if (choice === "save") {
      try {
        await mm.flush();
      } catch (err) {
        console.error('[core] Failed to flush config on close:', err);
      }
      hasUnsavedChanges = false;
      mainWindow!.close();
    } else if (choice === "discard") {
      // 不保存退出
      hasUnsavedChanges = false;
      mainWindow!.close();
    }
    // cancel: 保持打开
  });
}

// ─── 启动 ────────────────────────────────────────────────────────────────────

// 注册自定义协议来支持本地文件访问（用于显示 mod 封面图片）
protocol.registerSchemesAsPrivileged([
  {
    scheme: "local-file",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      bypassCSP: true,
    },
  },
]);

app.whenReady().then(async () => {
  // 注册协议处理器 - 处理本地文件访问
  protocol.handle("local-file", (request) => {
    // 移除协议前缀，处理 Windows 路径
    let filePath = request.url.replace("local-file://", "");
    // 解码 URL 编码的字符
    filePath = decodeURIComponent(filePath);
    // 确保路径格式正确（Windows 使用反斜杠）
    filePath = filePath.replace(/\//g, "\\");
    return net.fetch(`file:///${filePath}`);
  });
  
  const settings = loadSettings();
  dataDir = settings.dataDir ?? app.getPath("userData");
  ensureDataDir(dataDir);

  appLog = createAppLogger(path.join(dataDir, APP_LOG_FILE));
  appLog("Application starting...");

  setWorkshopRequiredIdsFetcher(async (ids, game) => {
    const appId = Number(game.steamId);
    if (!appId) return new Map();
    return fetchWorkshopDependenciesViaSteam(appId, ids);
  });

  setWorkshopSubscriptionsFetcher(async (game) => {
    const appId = Number(game.steamId);
    if (!appId) return [];
    return fetchSubscribedWorkshopIdsViaSteam(appId);
  });

  mm = new ModManager({ configDir: dataDir, log: msg => appLog(`[core] ${msg}`) });
  registerIpc();
  createWindow();

  initPromise = mm.init().then(() => {
    appLog("Mod manager initialized");
  }).catch(err => {
    appLog(`Init failed: ${err}`);
    throw err;
  });

  void initPromise.then(() => runDeferredWorkshopEnrichment());
});

app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
