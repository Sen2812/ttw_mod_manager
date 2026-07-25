/**
 * Catalog of companion-mod campaign helpers (documentation for Features page).
 * Runtime options live in MCT inside ttw_campaign_helpers.pack (see mods/).
 */

export type UnitBuffFeatureKind = "toggle" | "slider";

export interface UnitBuffFeatureDef {
  key: string;
  kind: UnitBuffFeatureKind;
  group: UnitBuffFeatureGroupId;
  min?: number;
  max?: number;
  step?: number;
  defaultBool?: boolean;
  defaultNumber?: number;
}

export type UnitBuffFeatureGroupId =
  | "unitAbilities"
  | "campaignFaction"
  | "campaignArmy"
  | "campaignCharacter";

export const UNIT_BUFF_FEATURE_GROUPS: { id: UnitBuffFeatureGroupId; icon: string }[] = [
  { id: "unitAbilities", icon: "Swords" },
  { id: "campaignFaction", icon: "Landmark" },
  { id: "campaignArmy", icon: "Shield" },
  { id: "campaignCharacter", icon: "Crown" },
];

/** Flat registry — Features page documentation only (configure in MCT). */
export const UNIT_BUFF_FEATURES: UnitBuffFeatureDef[] = [
  { key: "infantryShieldwall", kind: "toggle", group: "unitAbilities", defaultBool: false },
  { key: "rangeDigIn", kind: "toggle", group: "unitAbilities", defaultBool: false },
  { key: "cavalryLance", kind: "toggle", group: "unitAbilities", defaultBool: false },
  { key: "cavalryCharge", kind: "toggle", group: "unitAbilities", defaultBool: false },
  { key: "damageReflect", kind: "slider", group: "unitAbilities", min: 0, max: 3, step: 1, defaultNumber: 0 },

  { key: "factionItemFuse", kind: "slider", group: "campaignFaction", min: 0, max: 100, step: 10, defaultNumber: 0 },
  { key: "factionGrowth", kind: "slider", group: "campaignFaction", min: 0, max: 2000, step: 50, defaultNumber: 0 },
  { key: "factionEconomyGdpe", kind: "slider", group: "campaignFaction", min: 0, max: 200, step: 10, defaultNumber: 0 },
  { key: "factionResearchPoints", kind: "slider", group: "campaignFaction", min: 0, max: 1000, step: 50, defaultNumber: 0 },

  { key: "armyMovementRangePostBattleWin", kind: "slider", group: "campaignArmy", min: 0, max: 100, step: 10, defaultNumber: 0 },
  { key: "armyReplenishmentRate", kind: "slider", group: "campaignArmy", min: 0, max: 20, step: 1, defaultNumber: 0 },
  { key: "armyHealingCap", kind: "slider", group: "campaignArmy", min: 0, max: 500, step: 50, defaultNumber: 0 },
  // Negative = faster barrier recovery (buff only)
  { key: "armyBarrierReplenishDelay", kind: "slider", group: "campaignArmy", min: -100, max: 0, step: 10, defaultNumber: 0 },
  { key: "armyExpGain", kind: "slider", group: "campaignArmy", min: 0, max: 500, step: 25, defaultNumber: 0 },

  { key: "charSpellMastery", kind: "slider", group: "campaignCharacter", min: 0, max: 200, step: 10, defaultNumber: 0 },
  { key: "charMagicRange", kind: "slider", group: "campaignCharacter", min: 0, max: 200, step: 10, defaultNumber: 0 },
  // Negative = shorter cooldown (buff only)
  { key: "charMagicCooldown", kind: "slider", group: "campaignCharacter", min: -100, max: 0, step: 10, defaultNumber: 0 },
  { key: "charExperienceMod", kind: "slider", group: "campaignCharacter", min: 0, max: 500, step: 10, defaultNumber: 0 },
];

export type UnitBuffOptions = Record<string, boolean | number>;
