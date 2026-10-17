import fs from "node:fs";
import path from "node:path";
import type { Mod } from "../types/mod.js";
import { isLocalMod } from "./mod-display.js";

const FILE_NAME = "local-import-times.json";

function filePath(configDir: string): string {
  return path.join(configDir, FILE_NAME);
}

function toMinute(ms: number): number {
  return Math.floor(ms / 60_000) * 60_000;
}

function load(configDir: string): Record<string, number> {
  try {
    const raw = JSON.parse(fs.readFileSync(filePath(configDir), "utf8")) as unknown;
    if (!raw || typeof raw !== "object") return {};
    const times: Record<string, number> = {};
    for (const [key, value] of Object.entries(raw)) {
      if (typeof value === "number" && value > 0) times[key.toLowerCase()] = toMinute(value);
    }
    return times;
  } catch {
    return {};
  }
}

function save(configDir: string, times: Record<string, number>): void {
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(filePath(configDir), JSON.stringify(times, null, 2), "utf8");
}

/** Remember the first import of these pack names. Later overwrites keep the original time. */
export function recordLocalImportTimes(packNames: string[], configDir: string, now = Date.now()): void {
  if (packNames.length === 0) return;
  const times = load(configDir);
  const minute = toMinute(now);
  let changed = false;
  for (const name of packNames) {
    const key = name.toLowerCase();
    if (!key || times[key] != null) continue;
    times[key] = minute;
    changed = true;
  }
  if (changed) save(configDir, times);
}

/**
 * Put a stored import time on every local mod.
 * Mods that have never been stamped are recorded as `now` (minute precision).
 */
export function applyLocalImportTimes(mods: Mod[], configDir: string, now = Date.now()): void {
  const times = load(configDir);
  const minute = toMinute(now);
  let changed = false;
  for (const mod of mods) {
    if (!isLocalMod(mod)) continue;
    const key = mod.name.toLowerCase();
    if (times[key] == null) {
      times[key] = minute;
      changed = true;
    }
    mod.importedAt = times[key];
  }
  if (changed) save(configDir, times);
}
