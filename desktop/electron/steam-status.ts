import { execFile } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import { findSteamPath } from "../../core/src/mod-manager/mod-discovery";

const execFileAsync = promisify(execFile);

export interface SteamClientStatus {
  installed: boolean;
  running: boolean;
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

/** Lightweight check: Steam installed on disk and client process running. */
export async function getSteamClientStatus(): Promise<SteamClientStatus> {
  const installed = await isSteamInstalled();
  if (!installed) return { installed: false, running: false };
  const running = await isSteamProcessRunning();
  return { installed: true, running };
}
