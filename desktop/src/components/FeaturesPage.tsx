import { useState, useEffect, useMemo } from "react";
import { useStore } from "../store";
import { useT } from "../i18n";
import { X, Sparkles, Film } from "lucide-react";
import clsx from "clsx";

export default function FeaturesPage() {
  const t = useT();
  const { showFeaturesPage, setShowFeaturesPage, currentGame, games } = useStore();
  const [skipIntro, setSkipIntro] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const gameInfo = games.find(g => g.id === currentGame);
  const currentGameName = gameInfo?.name ?? currentGame;

  const skipIntroAvailable = useMemo(() => (
    (gameInfo?.supportedOptions?.includes("SkipIntroMovies") ?? false)
      || currentGame === "wh3"
      || currentGame === "threeKingdoms"
  ), [gameInfo, currentGame]);

  useEffect(() => {
    if (!showFeaturesPage) return;

    void window.api.getPreferences().then((prefs) => {
      setSkipIntro(prefs.isSkipIntroMoviesEnabled ?? false);
    }).catch((e) => console.error("Failed to load preferences:", e));
  }, [showFeaturesPage, currentGame]);

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
      <div className="modal-panel w-[520px] max-h-[85vh] overflow-hidden flex flex-col">
        <div className="modal-header">
          <h2 className="text-lg font-semibold text-morandi-text flex-1 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-morandi-accent" />
            {t("features.title")}
          </h2>
          <button onClick={() => setShowFeaturesPage(false)} className="modal-close-btn">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
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
        </div>
      </div>
    </div>
  );
}
