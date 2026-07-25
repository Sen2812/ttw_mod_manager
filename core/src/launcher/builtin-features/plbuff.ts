/**
 * Companion campaign-helpers mod detection (MCT + ttw_campaign_helpers).
 * The mod lives under repo mods/ and is NOT injected or bundled by the manager.
 */

/** Pack file name of the companion MCT mod. */
export const CAMPAIGN_HELPERS_MOD_PACK_NAME = "ttw_campaign_helpers.pack";

/** @deprecated Use {@link CAMPAIGN_HELPERS_MOD_PACK_NAME} */
export const UNIT_BUFFS_DB_PACK_NAME = CAMPAIGN_HELPERS_MOD_PACK_NAME;
/** @deprecated */
export const UNIT_BUFFS_PACK_NAME = CAMPAIGN_HELPERS_MOD_PACK_NAME;
/** @deprecated */
export const PLBUFF_PACK_NAME = CAMPAIGN_HELPERS_MOD_PACK_NAME;
/** @deprecated Script pack no longer shipped */
export const UNIT_BUFFS_SCRIPT_PACK_NAME = "ttw_unit_buffs_scripts.pack";

export function normalizePackName(name: string): string {
  return name.trim().toLowerCase().replace(/\\/g, "/").split("/").pop() ?? name.trim().toLowerCase();
}

/** Detect Mod Configuration Tool among enabled packs. */
export function isMctPackName(name: string): boolean {
  const n = normalizePackName(name);
  if (!n.endsWith(".pack")) return false;
  const base = n.slice(0, -5);
  return base.includes("mod_configuration_tool")
    || base === "mct"
    || base.startsWith("mct_")
    || base.startsWith("!mct");
}

export function isCampaignHelpersPackName(name: string): boolean {
  return normalizePackName(name) === normalizePackName(CAMPAIGN_HELPERS_MOD_PACK_NAME);
}

export function hasEnabledMct(enabledModNames: Iterable<string>): boolean {
  for (const name of enabledModNames) {
    if (isMctPackName(name)) return true;
  }
  return false;
}

export function hasEnabledCampaignHelpersMod(enabledModNames: Iterable<string>): boolean {
  for (const name of enabledModNames) {
    if (isCampaignHelpersPackName(name)) return true;
  }
  return false;
}

export interface CampaignHelpersAvailability {
  /** Game supports the feature option. */
  supported: boolean;
  mctEnabled: boolean;
  modEnabled: boolean;
  /** True when MCT and the companion mod are both enabled. */
  available: boolean;
}

export function getCampaignHelpersAvailability(
  supported: boolean,
  enabledModNames: Iterable<string>,
): CampaignHelpersAvailability {
  const mctEnabled = hasEnabledMct(enabledModNames);
  const modEnabled = hasEnabledCampaignHelpersMod(enabledModNames);
  return {
    supported,
    mctEnabled,
    modEnabled,
    available: supported && mctEnabled && modEnabled,
  };
}

/** @deprecated Use getCampaignHelpersAvailability */
export function isPlbuffAvailable(
  _gameId: string,
  _resourcesRoot: string,
  _dataFolder?: string,
): { available: boolean; bundled: boolean } {
  return { available: false, bundled: false };
}

/** @deprecated No launch injection for campaign helpers. */
export function resolvePlbuffForLaunch(): {
  headPacks: never[];
  externalPacks: never[];
  warnings: string[];
  bundled: boolean;
} {
  return { headPacks: [], externalPacks: [], warnings: [], bundled: false };
}
