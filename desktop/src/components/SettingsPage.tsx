import { useState, useEffect } from "react";
import { useStore } from "../store";
import { useT, useI18nStore } from "../i18n";
import { LanguageToggle } from "./LanguageToggle";
import { X, FolderOpen, Copy, Check, RefreshCw, Gamepad2 } from "lucide-react";

export default function SettingsPage() {
  const t = useT();
  const { showSettingsPage, setShowSettingsPage, currentGame, games, folderPaths } = useStore();
  const [dataDir, setDataDir] = useState<string>("");
  const [presetsPath, setPresetsPath] = useState<string>("");
  const [configPath, setConfigPath] = useState<string>("");
  const [copied, setCopied] = useState<string | null>(null);
  const [isChangingDir, setIsChangingDir] = useState(false);
  const [closeOnPlay, setCloseOnPlay] = useState(false);
  const [isSavingPreference, setIsSavingPreference] = useState(false);

  useEffect(() => {
    if (showSettingsPage) loadPaths();
  }, [showSettingsPage, currentGame]);

  const loadPaths = async () => {
    try {
      const dir = await window.api.getDataDir();
      setDataDir(dir);
      setPresetsPath(`${dir}/presets-${currentGame}.json`);
      setConfigPath(`${dir}/mod-manager-config.json`);
      const prefs = await window.api.getPreferences();
      setCloseOnPlay(prefs.isClosedOnPlay);
    } catch (e) {
      console.error("Failed to load paths:", e);
    }
  };

  const handleCloseOnPlayChange = async (enabled: boolean) => {
    setCloseOnPlay(enabled);
    setIsSavingPreference(true);
    try {
      const result = await window.api.setPreferences({ isClosedOnPlay: enabled });
      if (result.ok) setCloseOnPlay(result.preferences.isClosedOnPlay);
    } catch (e) {
      console.error("Failed to save preference:", e);
      setCloseOnPlay(!enabled);
    } finally {
      setIsSavingPreference(false);
    }
  };

  const handleChangeDataDir = async () => {
    setIsChangingDir(true);
    try {
      const newDir = await window.api.selectDataDir();
      if (newDir) {
        const result = await window.api.setDataDir(newDir);
        if (result.ok) {
          setDataDir(result.dataDir);
          setPresetsPath(`${result.dataDir}/presets-${currentGame}.json`);
          setConfigPath(`${result.dataDir}/mod-manager-config.json`);
        }
      }
    } catch (e) {
      console.error("Failed to change data directory:", e);
    } finally {
      setIsChangingDir(false);
    }
  };

  const handleCopyPath = async (path: string, type: string) => {
    try {
      await navigator.clipboard.writeText(path);
      setCopied(type);
      setTimeout(() => setCopied(null), 2000);
    } catch (e) {
      console.error("Failed to copy path:", e);
    }
  };

  // 在系统资源管理器中打开指定路径（文件会选中，目录会打开）
  const handleOpenPath = async (targetPath: string) => {
    if (!targetPath) return;
    try {
      const result = await window.api.openFolder(targetPath);
      if (!result.ok && result.error) console.error("Failed to open path:", result.error);
    } catch (e) {
      console.error("Failed to open path:", e);
    }
  };

  const currentGameName = games.find(g => g.id === currentGame)?.name ?? currentGame;

  if (!showSettingsPage) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-morandi-text/20 backdrop-blur-sm" onClick={() => setShowSettingsPage(false)} />
      <div className="relative card-morandi w-[520px] max-h-[80vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-morandi-border-light">
          <h2 className="text-lg font-semibold text-morandi-text">{t("settings.title")}</h2>
          <button onClick={() => setShowSettingsPage(false)}
            className="p-1.5 rounded-lg hover:bg-morandi-hover transition-colors">
            <X className="w-5 h-5 text-morandi-text-secondary" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* Language Section */}
          <div>
            <h3 className="text-sm font-semibold text-morandi-text mb-3">{t("settings.language")}</h3>
            <p className="text-xs text-morandi-text-secondary mb-3">{t("settings.languageDesc")}</p>
            <div className="bg-morandi-sidebar rounded-lg p-4">
              <LanguageToggle />
            </div>
          </div>

          {/* Launch Section */}
          <div>
            <h3 className="text-sm font-semibold text-morandi-text mb-3">{t("settings.launch")}</h3>
            <div className="bg-morandi-sidebar rounded-lg p-4">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={closeOnPlay}
                  disabled={isSavingPreference}
                  onChange={(e) => handleCloseOnPlayChange(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-morandi-border text-morandi-accent focus:ring-morandi-accent/30"
                />
                <span>
                  <span className="block text-sm font-medium text-morandi-text">{t("settings.closeOnPlay")}</span>
                  <span className="block text-xs text-morandi-text-secondary mt-1 leading-relaxed">{t("settings.closeOnPlayDesc")}</span>
                </span>
              </label>
            </div>
          </div>

          {/* Current Game Section */}
          <div>
            <h3 className="text-sm font-semibold text-morandi-text mb-3">{t("settings.currentGame")}</h3>
            <div className="bg-morandi-sidebar rounded-lg p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-morandi-accent/10 flex items-center justify-center">
                  <Gamepad2 className="w-5 h-5 text-morandi-accent" />
                </div>
                <div>
                  <p className="text-sm font-medium text-morandi-text">{currentGameName}</p>
                  <p className="text-xs text-morandi-text-muted">ID: {currentGame}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Data Directory Section */}
          <div>
            <h3 className="text-sm font-semibold text-morandi-text mb-3">{t("settings.dataDirectory")}</h3>
            <p className="text-xs text-morandi-text-secondary mb-3">{t("settings.dataDirectoryDesc")}</p>
            <div className="bg-morandi-sidebar rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-morandi-text-secondary uppercase tracking-wider">{t("settings.location")}</span>
                <button onClick={handleChangeDataDir} disabled={isChangingDir}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-morandi-accent hover:bg-morandi-hover transition-colors">
                  {isChangingDir ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <FolderOpen className="w-3.5 h-3.5" />}
                  <span>{t("common.change")}</span>
                </button>
              </div>
              <PathRow path={dataDir} copied={copied === "dataDir"}
                onCopy={() => handleCopyPath(dataDir, "dataDir")} copyTitle={t("common.copy")}
                onOpen={() => handleOpenPath(dataDir)} openTitle={t("common.openFolder")} />
            </div>
          </div>

          {/* File Locations Section */}
          <div>
            <h3 className="text-sm font-semibold text-morandi-text mb-3">{t("settings.fileLocations")}</h3>
            <div className="space-y-3">
              <PathCard label={t("settings.presetsFile")} badge="JSON"
                desc={t("settings.presetsDesc", { game: currentGameName })}
                path={presetsPath} copied={copied === "presets"}
                onCopy={() => handleCopyPath(presetsPath, "presets")} copyTitle={t("common.copy")}
                onOpen={() => handleOpenPath(presetsPath)} openTitle={t("common.openFolder")} />

              <PathCard label={t("settings.configFile")} badge="JSON"
                desc={t("settings.configDesc")}
                path={configPath} copied={copied === "config"}
                onCopy={() => handleCopyPath(configPath, "config")} copyTitle={t("common.copy")}
                onOpen={() => handleOpenPath(configPath)} openTitle={t("common.openFolder")} />

              {folderPaths?.gamePath && (
                <PathCard label={t("settings.gameFolder")} badge={t("settings.autoDetected")}
                  desc={t("settings.gameFolderDesc", { game: currentGameName })}
                  path={folderPaths.gamePath} copied={copied === "gamePath"}
                  onCopy={() => handleCopyPath(folderPaths.gamePath!, "gamePath")} copyTitle={t("common.copy")}
                  onOpen={() => handleOpenPath(folderPaths.gamePath!)} openTitle={t("common.openFolder")} />
              )}

              {folderPaths?.contentFolder && (
                <PathCard label={t("settings.workshopContent")} badge="Steam"
                  desc={t("settings.workshopDesc", { game: currentGameName })}
                  path={folderPaths.contentFolder} copied={copied === "contentFolder"}
                  onCopy={() => handleCopyPath(folderPaths.contentFolder!, "contentFolder")} copyTitle={t("common.copy")}
                  onOpen={() => handleOpenPath(folderPaths.contentFolder!)} openTitle={t("common.openFolder")} />
              )}
            </div>
          </div>

          {/* Info Section */}
          <div className="bg-morandi-accent/5 rounded-lg p-4 border border-morandi-accent/10">
            <p className="text-xs text-morandi-text-secondary leading-relaxed">
              {t("settings.tip")}
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-morandi-border-light">
          <div className="flex justify-end">
            <button onClick={() => setShowSettingsPage(false)} className="btn-morandi">
              {t("common.done")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** 单行路径 + 复制按钮 + 可选打开按钮 */
function PathRow({ path, copied, onCopy, copyTitle, onOpen, openTitle }: {
  path: string; copied: boolean; onCopy: () => void; copyTitle: string;
  onOpen?: () => void; openTitle?: string;
}) {
  return (
    <div className="flex items-center gap-2 p-2.5 bg-morandi-page rounded-md">
      <code className="flex-1 text-xs text-morandi-text font-mono truncate">{path}</code>
      {onOpen && (
        <button onClick={onOpen} className="p-1.5 rounded hover:bg-morandi-hover transition-colors shrink-0" title={openTitle}
          disabled={!path}>
          <FolderOpen className="w-3.5 h-3.5 text-morandi-text-muted" />
        </button>
      )}
      <button onClick={onCopy} className="p-1.5 rounded hover:bg-morandi-hover transition-colors shrink-0" title={copyTitle}>
        {copied ? <Check className="w-3.5 h-3.5 text-morandi-success" /> : <Copy className="w-3.5 h-3.5 text-morandi-text-muted" />}
      </button>
    </div>
  );
}

/** 带标题/描述的路径卡片 */
function PathCard({ label, badge, desc, path, copied, onCopy, copyTitle, onOpen, openTitle }: {
  label: string; badge: string; desc: string;
  path: string; copied: boolean; onCopy: () => void; copyTitle: string;
  onOpen?: () => void; openTitle?: string;
}) {
  return (
    <div className="bg-morandi-sidebar rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-morandi-text-secondary uppercase tracking-wider">{label}</span>
        <span className="text-xs text-morandi-text-muted">{badge}</span>
      </div>
      <p className="text-xs text-morandi-text-secondary mb-2">{desc}</p>
      <PathRow path={path} copied={copied} onCopy={onCopy} copyTitle={copyTitle} onOpen={onOpen} openTitle={openTitle} />
    </div>
  );
}
