/**
 * Legacy preference types for campaign helpers.
 * Options are configured in MCT; these remain only for reading old config files.
 */

export type PlbuffOptions = Record<string, boolean | number>;

export function createDefaultPlbuffOptions(): PlbuffOptions {
  return {};
}

export const DEFAULT_PLBUFF_OPTIONS = createDefaultPlbuffOptions();

export function normalizePlbuffOptions(raw?: Partial<PlbuffOptions>): PlbuffOptions {
  if (!raw) return createDefaultPlbuffOptions();
  const out: PlbuffOptions = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "boolean" || (typeof value === "number" && !Number.isNaN(value))) {
      out[key] = value;
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
