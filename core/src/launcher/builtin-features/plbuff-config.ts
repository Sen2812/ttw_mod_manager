/**
 * Legacy preference types for campaign helpers.
 * Options are configured in MCT; these remain only for reading old config files.
 */

import {
  UNIT_BUFF_FEATURES,
  type UnitBuffOptions,
} from "./unit-buff-features";

export type PlbuffOptions = UnitBuffOptions;

export function createDefaultPlbuffOptions(): PlbuffOptions {
  const out: PlbuffOptions = {};
  for (const f of UNIT_BUFF_FEATURES) {
    out[f.key] = f.kind === "toggle"
      ? (f.defaultBool ?? false)
      : (f.defaultNumber ?? 0);
  }
  return out;
}

export const DEFAULT_PLBUFF_OPTIONS = createDefaultPlbuffOptions();

export function normalizePlbuffOptions(raw?: Partial<UnitBuffOptions>): UnitBuffOptions {
  const defaults = createDefaultPlbuffOptions();
  if (!raw) return defaults;
  const out = { ...defaults };
  for (const f of UNIT_BUFF_FEATURES) {
    const v = raw[f.key];
    if (f.kind === "toggle") {
      if (typeof v === "boolean") out[f.key] = v;
    } else if (typeof v === "number" && !Number.isNaN(v)) {
      const min = f.min ?? 0;
      const max = f.max ?? 100;
      out[f.key] = Math.min(max, Math.max(min, v));
    }
  }
  return out;
}

/** @deprecated Config Lua is no longer written by the manager. */
export const UNIT_BUFFS_CONFIG_LUA_FILENAME = "ttw_unit_buffs_config.lua";
/** @deprecated */
export const PLBUFF_CONFIG_LUA_FILENAME = UNIT_BUFFS_CONFIG_LUA_FILENAME;

/** @deprecated No-op retained for API compatibility. */
export function writePlbuffConfigLua(): string {
  return "";
}

/** @deprecated */
export function getGameUserScriptsFolder(): string {
  return "";
}
