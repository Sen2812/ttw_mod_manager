import { useState, useEffect } from "react";
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
  const supportsSkipIntro = gameInfo?.supportedOptions?.includes("SkipIntroMovies") ?? false;
  const currentGameName = gameInfo?.name ?? currentGame;

  useEffect(() => {
    if (!showFeaturesPage) return;
    (async () => {
      try {
        const prefs = await window.api.getPreferences();
        setSkipIntro(prefs.isSkipIntroMoviesEnabled ?? false);
      } catch (e) {
        console.error("Failed to load preferences:", e);
      }
    })();
  }, [showFeaturesPage, currentGame]);

  const handleSkipIntroChange = async (enabled: boolean) => {
    if (!supportsSkipIntro) return;
    setSkipIntro(enabled);
    setIsSaving(true);
    try {
      const result = await window.api.setPreferences({ isSkipIntroMoviesEnabled: enabled });
      if (result.ok) setSkipIntro(result.preferences.isSkipIntroMoviesEnabled ?? false);
    } catch (e) {
      console.error("Failed to save preference:", e);
      setSkipIntro(!enabled);
    } finally {
      setIsSaving(false);
    }
  };

  if (!showFeaturesPage) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="modal-backdrop" onClick={() => setShowFeaturesPage(false)} />
      <div className="modal-panel w-[520px] max-h-[80vh] overflow-hidden flex flex-col">
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
          <p className="text-sm text-morandi-text-secondary leading-relaxed">
            {t("features.desc")}
          </p>

          <div>
            <h3 className="section-title">{t("features.launchOptions")}</h3>
            <div className="surface-muted p-4">
              <label className={clsx(
                "flex items-start gap-3",
                supportsSkipIntro ? "cursor-pointer" : "cursor-not-allowed opacity-60",
              )}>
                <input
                  type="checkbox"
                  checked={skipIntro}
                  disabled={!supportsSkipIntro || isSaving}
                  onChange={(e) => handleSkipIntroChange(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-morandi-border text-morandi-accent focus:ring-morandi-accent/30"
                />
                <span className="flex-1">
                  <span className="flex items-center gap-2 text-sm font-medium text-morandi-text">
                    <Film className="w-4 h-4 text-morandi-text-muted" />
                    {t("features.skipIntro")}
                  </span>
                  <span className="block text-xs text-morandi-text-secondary mt-1 leading-relaxed">
                    {supportsSkipIntro
                      ? t("features.skipIntroDesc")
                      : t("features.skipIntroUnsupported", { game: currentGameName })}
                  </span>
                </span>
              </label>
            </div>
          </div>

          <div className="info-callout">
            <p className="text-xs text-morandi-text-secondary leading-relaxed">
              {t("features.tip")}
            </p>
          </div>
        </div>

        <div className="modal-footer">
          <div className="flex justify-end">
            <button onClick={() => setShowFeaturesPage(false)} className="btn-morandi">
              {t("common.done")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
