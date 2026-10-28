import { useState, useEffect, useMemo } from "react";
import { useStore } from "../store";
import { useT } from "../i18n";
import { X, Sparkles, Film, Bug, FolderOpen } from "lucide-react";
import clsx from "clsx";

export default function FeaturesPage() {
  const t = useT();
  const { showFeaturesPage, setShowFeaturesPage, currentGame, games } = useStore();
  const [skipIntro, setSkipIntro] = useState(false);
  const [crashDiagnostics, setCrashDiagnostics] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [diagStatus, setDiagStatus] = useState<string | null>(null);
  const [diagFolder, setDiagFolder] = useState<string | null>(null);

  const gameInfo = games.find(g => g.id === currentGame);
  const currentGameName = gameInfo?.name ?? currentGame;

  const skipIntroAvailable = useMemo(() => (
    (gameInfo?.supportedOptions?.includes("SkipIntroMovies") ?? false)
      || currentGame === "wh3"
      || currentGame === "threeKingdoms"
  ), [gameInfo, currentGame]);

  const refreshCrashDiagnostics = async () => {
    try {
      const info = await window.api.getCrashDiagnostics();
      setDiagFolder(info.folder);
      if (!info.record) {
        setDiagStatus(t("features.crashDiagnosticsNone"));
        return;
      }
      if (info.diagnosis?.status === "running") {
        setDiagStatus(t("features.crashDiagnosticsRunning"));
        return;
      }
      if (info.diagnosis?.crashed) {
        setDiagStatus(t("features.crashDiagnosticsCrashed"));
        return;
      }
      setDiagStatus(t("features.crashDiagnosticsOk"));
    } catch (e) {
      console.error("Failed to load crash diagnostics:", e);
      setDiagStatus(null);
    }
  };

  useEffect(() => {
    if (!showFeaturesPage) return;

    void window.api.getPreferences().then((prefs) => {
      setSkipIntro(prefs.isSkipIntroMoviesEnabled ?? false);
      setCrashDiagnostics(prefs.isCrashDiagnosticsEnabled ?? false);
    }).catch((e) => console.error("Failed to load preferences:", e));

    void refreshCrashDiagnostics();
  }, [showFeaturesPage, currentGame]);

  const savePreference = async (
    patch: { isSkipIntroMoviesEnabled?: boolean; isCrashDiagnosticsEnabled?: boolean },
    rollback: () => void,
  ) => {
    setIsSaving(true);
    try {
      const result = await window.api.setPreferences(patch);
      if (result.ok) {
        if (typeof patch.isSkipIntroMoviesEnabled === "boolean") {
          setSkipIntro(result.preferences.isSkipIntroMoviesEnabled ?? false);
        }
        if (typeof patch.isCrashDiagnosticsEnabled === "boolean") {
          setCrashDiagnostics(result.preferences.isCrashDiagnosticsEnabled ?? false);
          void refreshCrashDiagnostics();
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

  const handleCrashDiagnosticsChange = async (enabled: boolean) => {
    setCrashDiagnostics(enabled);
    await savePreference({ isCrashDiagnosticsEnabled: enabled }, () => setCrashDiagnostics(!enabled));
  };

  const handleOpenFolder = async () => {
    try {
      await window.api.openCrashDiagnosticsFolder();
    } catch (e) {
      console.error("Failed to open crash diagnostics folder:", e);
    }
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

          <div>
            <h3 className="section-title">{t("features.diagnostics")}</h3>
            <div className="surface-muted p-4 space-y-3">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={crashDiagnostics}
                  disabled={isSaving}
                  onChange={(e) => handleCrashDiagnosticsChange(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-morandi-border text-morandi-accent focus:ring-morandi-accent/30"
                />
                <span className="flex-1">
                  <span className="flex items-center gap-2 text-sm font-medium text-morandi-text">
                    <Bug className="w-4 h-4 text-morandi-text-muted" />
                    {t("features.crashDiagnostics")}
                  </span>
                  <span className="block text-xs text-morandi-text-secondary mt-1 leading-relaxed">
                    {t("features.crashDiagnosticsDesc")}
                  </span>
                </span>
              </label>

              {diagStatus && (
                <p className="text-xs text-morandi-text-muted pl-7">
                  {t("features.crashDiagnosticsLast", { status: diagStatus })}
                </p>
              )}

              <div className="pl-7">
                <button
                  type="button"
                  onClick={handleOpenFolder}
                  className="btn-morandi-ghost text-xs flex items-center gap-1.5 !px-2 !py-1"
                  title={diagFolder ?? undefined}
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  {t("features.crashDiagnosticsOpen")}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
