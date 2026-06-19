import { fork } from "child_process";
import * as fs from "fs";
import { app } from "electron";
import * as path from "path";
import { fileURLToPath } from "url";

const STEAM_SUB_TIMEOUT_MS = 120_000;

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

/** Fetch workshop required mod IDs via steamworks.js (Steam client must be running). */
export async function fetchWorkshopDependenciesViaSteam(
  appId: number,
  workshopIds: string[],
): Promise<Map<string, string[]>> {
  if (workshopIds.length === 0) return new Map();

  const steamSubPath = resolveSteamSubPath();
  const appRoot = path.dirname(path.dirname(steamSubPath));

  return new Promise((resolve, reject) => {
    const child = fork(steamSubPath, [String(appId), "getDependencies", workshopIds.join(",")], {
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
      finish(() => reject(new Error("Steam dependency fetch timed out")));
    }, STEAM_SUB_TIMEOUT_MS);

    child.once("message", (msg: Record<string, string[] | string> | null) => {
      if (msg && typeof msg === "object" && "__error" in msg) {
        finish(() => reject(new Error(String(msg.__error))));
        return;
      }
      const map = new Map<string, string[]>();
      if (msg && typeof msg === "object") {
        for (const [id, deps] of Object.entries(msg)) {
          if (Array.isArray(deps)) map.set(id, deps);
        }
      }
      finish(() => resolve(map));
    });

    child.once("error", (err) => finish(() => reject(err)));
    child.once("exit", (code) => {
      if (!settled && code !== 0) {
        finish(() => reject(new Error(`steam-sub exited with code ${code}`)));
      }
    });
  });
}
