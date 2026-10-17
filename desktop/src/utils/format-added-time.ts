import { isLocalMod } from "@core/mod-manager/mod-display";
import type { Mod } from "../types";

/** Workshop subscription time, or local import time. */
export function modAddedTime(mod: Mod): number | undefined {
  const value = isLocalMod(mod) ? mod.importedAt : mod.subbedTime;
  return value && value > 0 ? value : undefined;
}

/** Year-month-day hour:minute in the local timezone. */
export function formatAddedTime(ms: number): string {
  const date = new Date(ms);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
