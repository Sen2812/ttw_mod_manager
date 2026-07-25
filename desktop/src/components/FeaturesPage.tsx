import { useState, useEffect, useMemo } from "react";
import { useStore } from "../store";
import { useT } from "../i18n";
import {
  X, Sparkles, Film, Swords, Landmark, Shield, Crown, Check, AlertCircle,
} from "lucide-react";
import clsx from "clsx";

type UnitBuffFeatureKind = "toggle" | "slider";
type UnitBuffFeatureGroupId =
  | "unitAbilities"
  | "campaignFaction"
  | "campaignArmy"
  | "campaignCharacter";

type UnitBuffFeatureDef = {
  key: string;
  kind: UnitBuffFeatureKind;
  group: UnitBuffFeatureGroupId;
  min?: number;
  max?: number;
  step?: number;
};

type BuiltinFeatureStatus = {
  id: "skipIntro" | "plbuff";
  kind: "temp-pack" | "bundled-pack" | "external-pack";
  available: boolean;
  enabled: boolean;
  bundled: boolean;
  mctEnabled?: boolean;
  modEnabled?: boolean;
};

const GROUP_ICONS = {
  unitAbilities: Swords,
  campaignFaction: Landmark,
  campaignArmy: Shield,
  campaignCharacter: Crown,
} as const;

const FALLBACK_CATALOG: {
  groups: { id: UnitBuffFeatureGroupId; icon: string }[];
  features: UnitBuffFeatureDef[];
} = {
  groups: [
    { id: "unitAbilities", icon: "Swords" },
    { id: "campaignFaction", icon: "Landmark" },
    { id: "campaignArmy", icon: "Shield" },
    { id: "campaignCharacter", icon: "Crown" },
  ],
  features: [
    { key: "infantryShieldwall", kind: "toggle", group: "unitAbilities" },
    { key: "rangeDigIn", kind: "toggle", group: "unitAbilities" },
    { key: "cavalryLance", kind: "toggle", group: "unitAbilities" },
    { key: "cavalryCharge", kind: "toggle", group: "unitAbilities" },
    { key: "damageReflect", kind: "slider", group: "unitAbilities", min: 0, max: 3, step: 1 },
    { key: "factionItemFuse", kind: "slider", group: "campaignFaction", min: 0, max: 100, step: 10 },
    { key: "factionGrowth", kind: "slider", group: "campaignFaction", min: 0, max: 2000, step: 50 },
    { key: "factionEconomyGdpe", kind: "slider", group: "campaignFaction", min: 0, max: 200, step: 10 },
    { key: "factionResearchPoints", kind: "slider", group: "campaignFaction", min: 0, max: 1000, step: 50 },
    { key: "armyMovementRangePostBattleWin", kind: "slider", group: "campaignArmy", min: 0, max: 100, step: 10 },
    { key: "armyReplenishmentRate", kind: "slider", group: "campaignArmy", min: 0, max: 20, step: 1 },
    { key: "armyHealingCap", kind: "slider", group: "campaignArmy", min: 0, max: 500, step: 50 },
    { key: "armyBarrierReplenishDelay", kind: "slider", group: "campaignArmy", min: -100, max: 0, step: 10 },
    { key: "armyExpGain", kind: "slider", group: "campaignArmy", min: 0, max: 500, step: 25 },
    { key: "charSpellMastery", kind: "slider", group: "campaignCharacter", min: 0, max: 200, step: 10 },
    { key: "charMagicRange", kind: "slider", group: "campaignCharacter", min: 0, max: 200, step: 10 },
    { key: "charMagicCooldown", kind: "slider", group: "campaignCharacter", min: -100, max: 0, step: 10 },
    { key: "charExperienceMod", kind: "slider", group: "campaignCharacter", min: 0, max: 500, step: 10 },
  ],
};

export default function FeaturesPage() {
  const t = useT();
  const { showFeaturesPage, setShowFeaturesPage, currentGame, games } = useStore();
  const [skipIntro, setSkipIntro] = useState(false);
  const [catalog, setCatalog] = useState(FALLBACK_CATALOG);
  const [featureStatuses, setFeatureStatuses] = useState<BuiltinFeatureStatus[]>([]);
  const [modPackName, setModPackName] = useState("ttw_campaign_helpers.pack");
  const [isSaving, setIsSaving] = useState(false);

  const gameInfo = games.find(g => g.id === currentGame);
  const currentGameName = gameInfo?.name ?? currentGame;
  const unitBuffStatus = featureStatuses.find(f => f.id === "plbuff");

  const clientSupport = useMemo(() => ({
    skipIntro: (gameInfo?.supportedOptions?.includes("SkipIntroMovies") ?? false)
      || currentGame === "wh3"
      || currentGame === "threeKingdoms",
    unitBuff: (gameInfo?.supportedOptions?.includes("PlbuffInjection") ?? false)
      || currentGame === "wh3",
  }), [gameInfo, currentGame]);

  const skipIntroAvailable = clientSupport.skipIntro;
  const unitBuffSupported = clientSupport.unitBuff;
  const mctEnabled = unitBuffStatus?.mctEnabled === true;
  const modEnabled = unitBuffStatus?.modEnabled === true;
  const unitBuffReady = unitBuffSupported && mctEnabled && modEnabled;

  const featuresByGroup = useMemo(() => {
    const map = new Map<UnitBuffFeatureGroupId, UnitBuffFeatureDef[]>();
    for (const g of catalog.groups) map.set(g.id, []);
    for (const f of catalog.features) {
      const list = map.get(f.group) ?? [];
      list.push(f);
      map.set(f.group, list);
    }
    return map;
  }, [catalog]);

  useEffect(() => {
    if (!showFeaturesPage) return;

    void window.api.getPreferences().then((prefs) => {
      setSkipIntro(prefs.isSkipIntroMoviesEnabled ?? false);
    }).catch((e) => console.error("Failed to load preferences:", e));

    if (typeof window.api.getBuiltinFeatures === "function") {
      void window.api.getBuiltinFeatures().then((builtin) => {
        setFeatureStatuses(builtin.features ?? []);
        if (builtin.unitBuffCatalog) {
          setCatalog(builtin.unitBuffCatalog as typeof FALLBACK_CATALOG);
        }
        if (builtin.campaignHelpersModPack) {
          setModPackName(builtin.campaignHelpersModPack);
        }
      }).catch((e) => console.error("Failed to load built-in features:", e));
    }
  }, [showFeaturesPage, currentGame, games]);

  const savePreference = async (
    patch: { isSkipIntroMoviesEnabled?: boolean },
    rollback: () => void,
  ) => {
    setIsSaving(true);
    try {
      const result = await window.api.setPreferences(patch);
      if (result.ok) {
        if (typeof patch.isSkipIntroMoviesEnabled === "boolean") {
          setSkipIntro(result.preferences.isSkipIntroMoviesEnabled ?? false);
        }
      }
    } catch (e) {
      console.error("Failed to save preference:", e);
      rollback();
    } finally {
      setIsSaving(false);
    }
  };

  const handleSkipIntroChange = async (enabled: boolean) => {
    if (!skipIntroAvailable) return;
    setSkipIntro(enabled);
    await savePreference({ isSkipIntroMoviesEnabled: enabled }, () => setSkipIntro(!enabled));
  };

  if (!showFeaturesPage) return null;

  return (
    <div className="modal-shell">
      <div className="modal-backdrop" onClick={() => setShowFeaturesPage(false)} />
      <div className="modal-panel w-[680px] max-h-[85vh] overflow-hidden flex flex-col">
        <div className="modal-header">
          <h2 className="text-lg font-semibold text-morandi-text flex-1 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-morandi-accent" />
            {t("features.title")}
          </h2>
          <button onClick={() => setShowFeaturesPage(false)} className="modal-close-btn">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-7">
          <p className="text-sm text-morandi-text-secondary leading-relaxed">
            {t("features.desc")}
          </p>

          <div>
            <h3 className="section-title">{t("features.launchOptions")}</h3>
            <div className="surface-muted p-4">
              <label className={clsx(
                "flex items-start gap-3",
                skipIntroAvailable ? "cursor-pointer" : "cursor-not-allowed opacity-60",
              )}>
                <input
                  type="checkbox"
                  checked={skipIntro}
                  disabled={!skipIntroAvailable || isSaving}
                  onChange={(e) => handleSkipIntroChange(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-morandi-border text-morandi-accent focus:ring-morandi-accent/30"
                />
                <span className="flex-1">
                  <span className="flex items-center gap-2 text-sm font-medium text-morandi-text">
                    <Film className="w-4 h-4 text-morandi-text-muted" />
                    {t("features.skipIntro")}
                  </span>
                  <span className="block text-xs text-morandi-text-secondary mt-1 leading-relaxed">
                    {skipIntroAvailable
                      ? t("features.skipIntroDesc")
                      : t("features.skipIntroUnsupported", { game: currentGameName })}
                  </span>
                </span>
              </label>
            </div>
          </div>

          <div className={clsx(!unitBuffSupported && "opacity-60")}>
            <div className="flex items-center justify-between gap-3 mb-3">
              <h3 className="section-title mb-0">{t("features.unitBuffSection")}</h3>
              {unitBuffReady && (
                <span className="text-xs text-emerald-600/90 shrink-0 flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" />
                  {t("features.plbuffReady")}
                </span>
              )}
            </div>

            <p className="text-xs text-morandi-text-secondary mb-4 leading-relaxed">
              {!unitBuffSupported
                ? t("features.plbuffUnsupported", { game: currentGameName })
                : t("features.unitBuffSectionDesc")}
            </p>

            {unitBuffSupported && (
              <div className="space-y-4">
                <div className="surface-muted p-4 space-y-2.5">
                  <PrerequisiteRow
                    ok={mctEnabled}
                    label={t("features.plbuffNeedMct")}
                    hint={t("features.plbuffNeedMctHint")}
                  />
                  <PrerequisiteRow
                    ok={modEnabled}
                    label={t("features.plbuffNeedMod", { pack: modPackName })}
                    hint={t("features.plbuffNeedModHint")}
                  />
                </div>

                {unitBuffReady ? (
                  <p className="text-xs text-morandi-text-muted leading-relaxed">
                    {t("features.plbuffConfigureInMct")}
                  </p>
                ) : (
                  <p className="text-xs text-amber-700/80 leading-relaxed flex items-start gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    {t("features.plbuffNotReady")}
                  </p>
                )}

                <div className="space-y-5 pt-1">
                  {catalog.groups.map((group) => {
                    const Icon = GROUP_ICONS[group.id];
                    const items = featuresByGroup.get(group.id) ?? [];
                    if (items.length === 0) return null;
                    return (
                      <section key={group.id}>
                        <h4 className="flex items-center gap-2 text-sm font-medium text-morandi-text mb-2">
                          <Icon className="w-4 h-4 text-morandi-accent" />
                          {t(`features.unitBuff.groups.${group.id}`)}
                        </h4>
                        <ul className="space-y-1.5">
                          {items.map((feature) => (
                            <li
                              key={feature.key}
                              className="text-xs text-morandi-text-secondary leading-relaxed pl-1"
                            >
                              <span className="text-morandi-text font-medium">
                                {t(`features.unitBuff.${feature.key}`)}
                              </span>
                              <span className="text-morandi-text-muted">
                                {" — "}
                                {t(`features.unitBuff.${feature.key}Desc`)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </section>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="info-callout">
            <p className="text-xs text-morandi-text-secondary leading-relaxed">
              {t("features.tip")}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function PrerequisiteRow({
  ok,
  label,
  hint,
}: {
  ok: boolean;
  label: string;
  hint: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span className={clsx(
        "mt-0.5 w-4 h-4 rounded-full flex items-center justify-center shrink-0",
        ok ? "bg-emerald-500/15 text-emerald-600" : "bg-morandi-border/50 text-morandi-text-muted",
      )}>
        {ok ? <Check className="w-3 h-3" /> : <span className="w-1.5 h-1.5 rounded-full bg-current" />}
      </span>
      <span className="flex-1 min-w-0">
        <span className={clsx("block text-sm", ok ? "text-morandi-text" : "text-morandi-text-secondary")}>
          {label}
        </span>
        <span className="block text-xs text-morandi-text-muted mt-0.5 leading-relaxed">{hint}</span>
      </span>
    </div>
  );
}
