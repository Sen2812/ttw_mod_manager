import { execFile } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import { findSteamPath } from "../../core/src/mod-manager/mod-discovery";
import { probeSteamIpc } from "./steam-client";

const execFileAsync = promisify(execFile);

export type SteamClientState = "not_installed" | "not_running" | "offline" | "online";

export interface SteamClientStatus {
  installed: boolean;
  running: boolean;
  ipcAvailable: boolean;
  state: SteamClientState;
}

async function isSteamProcessRunning(): Promise<boolean> {
  try {
    if (process.platform === "win32") {
      const { stdout } = await execFileAsync(
        "tasklist",
        ["/FI", "IMAGENAME eq steam.exe", "/NH"],
        { windowsHide: true },
      );
      return stdout.toLowerCase().includes("steam.exe");
    }
    if (process.platform === "darwin") {
      const { stdout } = await execFileAsync("pgrep", ["-x", "Steam"]);
      return stdout.trim().length > 0;
    }
    const { stdout } = await execFileAsync("pgrep", ["-x", "steam"]);
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

async function isSteamInstalled(): Promise<boolean> {
  const steamPath = await findSteamPath();
  if (!steamPath) return false;
  const exeName = process.platform === "win32" ? "steam.exe" : "steam.sh";
  return fs.existsSync(path.join(steamPath, exeName));
}

/** Process check + steamworks IPC probe (IPC fails in offline mode even when steam.exe runs). */
export async function getSteamClientStatus(appId?: number): Promise<SteamClientStatus> {
  const installed = await isSteamInstalled();
  if (!installed) {
    return { installed: false, running: false, ipcAvailable: false, state: "not_installed" };
  }

  const running = await isSteamProcessRunning();
  if (!running) {
    return { installed: true, running: false, ipcAvailable: false, state: "not_running" };
  }

  if (!appId) {
    return { installed: true, running: true, ipcAvailable: false, state: "offline" };
  }

  const probe = await probeSteamIpc(appId);
  if (probe.ok) {
    return { installed: true, running: true, ipcAvailable: true, state: "online" };
  }

  return { installed: true, running: true, ipcAvailable: false, state: "offline" };
}
