import { app, BrowserWindow, shell } from "electron";
import { autoUpdater, type UpdateInfo, type ProgressInfo } from "electron-updater";

export type AppUpdatePhase =
  | "idle"
  | "checking"
  | "available"
  | "not-available"
  | "downloading"
  | "ready"
  | "error";

export interface AppUpdateState {
  phase: AppUpdatePhase;
  currentVersion: string;
  availableVersion?: string;
  releaseName?: string;
  releaseNotes?: string;
  percent?: number;
  bytesPerSecond?: number;
  transferred?: number;
  total?: number;
  error?: string;
  portable: boolean;
  packaged: boolean;
}

const RELEASES_URL = "https://github.com/Sen2812/ttw_mod_manager/releases/latest";

let log: (msg: string) => void = (msg) => console.log(msg);
let getMainWindow: () => BrowserWindow | null = () => null;
let state: AppUpdateState = {
  phase: "idle",
  currentVersion: app.getVersion(),
  portable: false,
  packaged: false,
};
let configured = false;
let checkInFlight: Promise<AppUpdateState> | null = null;

function isPortableBuild(): boolean {
  return Boolean(process.env.PORTABLE_EXECUTABLE_DIR);
}

function pushState(patch: Partial<AppUpdateState>): AppUpdateState {
  state = { ...state, ...patch };
  const win = getMainWindow();
  if (win && !win.isDestroyed()) {
    win.webContents.send("app-update-status", state);
  }
  return state;
}

function notesToString(notes: UpdateInfo["releaseNotes"]): string | undefined {
  if (!notes) return undefined;
  if (typeof notes === "string") return notes;
  if (Array.isArray(notes)) {
    return notes.map((n) => (typeof n === "string" ? n : n.note)).filter(Boolean).join("\n");
  }
  return undefined;
}

function ensureConfigured(): boolean {
  if (!app.isPackaged) {
    pushState({
      phase: "error",
      error: "dev-mode",
      packaged: false,
      portable: isPortableBuild(),
      currentVersion: app.getVersion(),
    });
    return false;
  }

  if (configured) return true;
  configured = true;

  state = {
    phase: "idle",
    currentVersion: app.getVersion(),
    portable: isPortableBuild(),
    packaged: true,
  };

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowPrerelease = false;

  autoUpdater.on("checking-for-update", () => {
    pushState({ phase: "checking", error: undefined });
  });

  autoUpdater.on("update-available", (info: UpdateInfo) => {
    log(`[updater] update available: ${info.version}`);
    pushState({
      phase: "available",
      availableVersion: info.version,
      releaseName: info.releaseName ?? undefined,
      releaseNotes: notesToString(info.releaseNotes),
      error: undefined,
    });
  });

  autoUpdater.on("update-not-available", (info: UpdateInfo) => {
    log(`[updater] up to date (${info.version})`);
    pushState({
      phase: "not-available",
      availableVersion: info.version,
      error: undefined,
    });
  });

  autoUpdater.on("download-progress", (progress: ProgressInfo) => {
    pushState({
      phase: "downloading",
      percent: progress.percent,
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total,
    });
  });

  autoUpdater.on("update-downloaded", (info: UpdateInfo) => {
    log(`[updater] downloaded: ${info.version}`);
    pushState({
      phase: "ready",
      availableVersion: info.version,
      releaseName: info.releaseName ?? undefined,
      percent: 100,
      error: undefined,
    });
  });

  autoUpdater.on("error", (err: Error) => {
    log(`[updater] error: ${err.message}`);
    pushState({
      phase: "error",
      error: err.message,
    });
  });

  return true;
}

export function setupAppUpdater(options: {
  getMainWindow: () => BrowserWindow | null;
  log: (msg: string) => void;
}): void {
  getMainWindow = options.getMainWindow;
  log = options.log;
  state = {
    phase: "idle",
    currentVersion: app.getVersion(),
    portable: isPortableBuild(),
    packaged: app.isPackaged,
  };
}

export function getAppUpdateState(): AppUpdateState {
  return {
    ...state,
    currentVersion: app.getVersion(),
    portable: isPortableBuild(),
    packaged: app.isPackaged,
  };
}

export async function checkForAppUpdate(manual = false): Promise<AppUpdateState> {
  if (!ensureConfigured()) return getAppUpdateState();
  if (checkInFlight) return checkInFlight;

  checkInFlight = (async () => {
    try {
      pushState({
        phase: "checking",
        error: undefined,
        currentVersion: app.getVersion(),
        portable: isPortableBuild(),
        packaged: true,
      });
      const result = await autoUpdater.checkForUpdates();
      if (!result) {
        return pushState({
          phase: "error",
          error: "no-result",
        });
      }
      // Events already updated phase; return latest snapshot.
      return getAppUpdateState();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      log(`[updater] check failed: ${message}`);
      return pushState({ phase: "error", error: message });
    } finally {
      checkInFlight = null;
    }
  })();

  return checkInFlight;
}

export async function downloadAppUpdate(): Promise<AppUpdateState> {
  if (!ensureConfigured()) return getAppUpdateState();
  if (state.portable) {
    await openAppReleasePage();
    return getAppUpdateState();
  }
  try {
    pushState({ phase: "downloading", percent: 0, error: undefined });
    await autoUpdater.downloadUpdate();
    return getAppUpdateState();
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    log(`[updater] download failed: ${message}`);
    return pushState({ phase: "error", error: message });
  }
}

export function installAppUpdate(): { ok: boolean; error?: string } {
  if (!app.isPackaged) return { ok: false, error: "dev-mode" };
  if (isPortableBuild()) return { ok: false, error: "portable" };
  try {
    // isSilent=false, isForceRunAfter=true
    autoUpdater.quitAndInstall(false, true);
    return { ok: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    log(`[updater] install failed: ${message}`);
    return { ok: false, error: message };
  }
}

export async function openAppReleasePage(): Promise<{ ok: boolean; error?: string }> {
  try {
    await shell.openExternal(RELEASES_URL);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Startup check: packaged installs only; never auto-downloads. */
export function scheduleStartupUpdateCheck(delayMs = 8_000): void {
  if (!app.isPackaged) return;
  setTimeout(() => {
    void checkForAppUpdate(false).catch((e) => {
      log(`[updater] startup check failed: ${e instanceof Error ? e.message : String(e)}`);
    });
  }, delayMs);
}
