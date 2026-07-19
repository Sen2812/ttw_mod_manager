import { useStore } from "../store";
import { useT } from "../i18n";
import { useState } from "react";
import ConfirmDialog from "./ConfirmDialog";
import { LanguageToggle } from "./LanguageToggle";
import SteamStatusHint from "./SteamStatusHint";
import { Gamepad2, ChevronDown, Play, Loader2, Settings } from "lucide-react";
import clsx from "clsx";

export default function TopBar() {
  const t = useT();
  const { games, currentGame, showGameMenu, setShowGameMenu, isLaunching, setIsLaunching, isScanning,
    mods, setMods, setCurrentGame, setPresets, setIsScanning, setFolderPaths,
    setShowSettingsPage, isDirty, markClean, saveCurrentState } = useStore();
  const currentGameName = games.find(g => g.id === currentGame)?.name ?? t("topbar.loading");
  const [pendingGame, setPendingGame] = useState<{ id: string; name: string } | null>(null);
  const [showLaunchConfirm, setShowLaunchConfirm] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [gameSwitchError, setGameSwitchError] = useState<string | null>(null);

  const resolveLaunchErrorMessage = (result: { error?: string; errorCode?: string }) => {
    if (result.errorCode === "GAME_ALREADY_RUNNING") return t("topbar.gameAlreadyRunning");
    if (result.errorCode === "LAUNCH_IN_PROGRESS") return t("topbar.launchInProgress");
    return result.error ?? t("topbar.launchErrorTitle");
  };

  const doGameChange = async (gameId: string) => {
    setShowGameMenu(false);
    setIsScanning(true);
    try {
      const result = await window.api.setGame(gameId);
      if (result.error) {
        setGameSwitchError(result.error);
        return;
      }
      if (result.mods) {
        setMods(result.mods);
        setCurrentGame(gameId);
        if (result.presets) setPresets(result.presets);
        if (result.folderPaths) setFolderPaths(result.folderPaths);
        useStore.setState({
          originalMods: result.mods,
          subscribedWorkshopIds: result.subscribedWorkshopIds ?? [],
        });
        // 工坊元数据/更新检查由主进程后台 enrich 完成后通过 onModsUpdated 推送
        markClean();
      }
    } catch (e) {
      console.error("Failed to switch game:", e);
    } finally { setIsScanning(false); }
  };

  const handleGameChange = (gameId: string) => {
    setShowGameMenu(false);
    if (gameId === currentGame) return;
    const gameName = games.find(g => g.id === gameId)?.name ?? gameId;
    // 有未保存修改时弹窗确认，避免丢失
    if (isDirty) {
      setPendingGame({ id: gameId, name: gameName });
      return;
    }
    doGameChange(gameId);
  };

  const doLaunch = async () => {
    if (isLaunching) return;
    setIsLaunching(true);
    setLaunchError(null);
    try {
      const result = await window.api.launchGame(mods);
      if (result?.copyFailures?.length) {
        setLaunchError(t("topbar.launchCopyWarning", { n: result.copyFailures.length }));
      } else if (result?.error) {
        setLaunchError(resolveLaunchErrorMessage(result));
        console.error("Failed to launch game:", result.error);
      }
    } catch (e) {
      console.error("Failed to launch game:", e);
      setLaunchError(t("topbar.launchErrorTitle"));
    } finally { setIsLaunching(false); }
  };

  const handleLaunch = () => {
    if (isLaunching) return;
    if (isDirty) {
      setShowLaunchConfirm(true);
      return;
    }
    doLaunch();
  };

  return (
    <>
    <div className="titlebar-drag h-12 bg-morandi-card border-b border-morandi-border-light flex items-center justify-between px-4 shrink-0">
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-md bg-morandi-accent flex items-center justify-center shadow-sm">
          <Gamepad2 className="w-3.5 h-3.5 text-white" />
        </div>
        <span className="text-sm font-semibold text-morandi-text tracking-tight">{t("topbar.title")}</span>
      </div>
      <div className="relative">
        <button onClick={() => setShowGameMenu(!showGameMenu)}
          className="titlebar-no-drag btn-morandi-ghost flex items-center gap-1.5 !px-3 !py-1.5">
          <span>{currentGameName}</span><ChevronDown className="w-3.5 h-3.5" />
        </button>
        {showGameMenu && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setShowGameMenu(false)} />
            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 z-50 menu-popover min-w-[180px]">
              {games.map(game => (
                <button key={game.id} onClick={() => handleGameChange(game.id)}
                  className={clsx("menu-item",
                    game.id === currentGame && "menu-item-active")}>
                  {game.name}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
      <div className="flex items-center gap-2">
        <SteamStatusHint />
        <LanguageToggle compact />
        <button
          onClick={() => setShowSettingsPage(true)}
          className="titlebar-no-drag icon-btn"
          title={t("topbar.settings")}
        >
          <Settings className="w-4 h-4 text-morandi-text-secondary" />
        </button>
        <button onClick={handleLaunch} disabled={isLaunching || isScanning}
          className="btn-morandi titlebar-no-drag flex items-center gap-2 !py-1.5 !px-4">
          {isLaunching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 fill-current" />}
          <span>{t("topbar.launch")}</span>
        </button>
      </div>
    </div>

    {/* 未保存修改 → 启动游戏确认弹窗 */}
    <ConfirmDialog
      open={showLaunchConfirm}
      title={t("topbar.unsavedLaunchTitle")}
      message={t("topbar.unsavedLaunchMsg")}
      confirmText={t("topbar.launchSaveAndLaunch")}
      secondaryText={t("topbar.launchWithoutSaving")}
      variant="warning"
      onConfirm={async () => {
        setShowLaunchConfirm(false);
        if (await saveCurrentState()) doLaunch();
      }}
      onSecondary={() => {
        setShowLaunchConfirm(false);
        doLaunch();
      }}
      onCancel={() => setShowLaunchConfirm(false)}
    />

    <ConfirmDialog
      open={launchError !== null}
      title={t("topbar.launchErrorTitle")}
      message={launchError ?? ""}
      confirmText={t("common.done")}
      variant="warning"
      onConfirm={() => setLaunchError(null)}
      onCancel={() => setLaunchError(null)}
    />

    {/* 未保存修改 → 切换游戏确认弹窗 */}
    <ConfirmDialog
      open={pendingGame !== null}
      title={t("topbar.unsavedSwitchTitle")}
      message={pendingGame ? t("topbar.unsavedSwitchGameMsg", { game: pendingGame.name }) : ""}
      confirmText={t("topbar.switchSaveAndSwitch")}
      secondaryText={t("topbar.switchWithoutSaving")}
      variant="warning"
      onConfirm={async () => {
        const g = pendingGame;
        setPendingGame(null);
        if (g && await saveCurrentState()) doGameChange(g.id);
      }}
      onSecondary={() => {
        const g = pendingGame;
        setPendingGame(null);
        if (g) doGameChange(g.id);
      }}
      onCancel={() => setPendingGame(null)}
    />

    <ConfirmDialog
      open={gameSwitchError !== null}
      title={t("topbar.gameSwitchErrorTitle")}
      message={gameSwitchError ?? ""}
      confirmText={t("common.done")}
      variant="warning"
      onConfirm={() => setGameSwitchError(null)}
      onCancel={() => setGameSwitchError(null)}
    />
    </>
  );
}
