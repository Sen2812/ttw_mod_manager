import { useEffect, useState } from "react";
import { useStore } from "./store";
import { useT } from "./i18n";
import TopBar from "./components/TopBar";
import Sidebar from "./components/Sidebar";
import ModList from "./components/ModList";
import NewPresetModal from "./components/NewPresetModal";
import SettingsPage from "./components/SettingsPage";
import CompatPanel from "./components/CompatPanel";
import ModDependencyModal from "./components/ModDependencyModal";
import ModUpdateModal from "./components/ModUpdateModal";
import DependencyAlertModal from "./components/DependencyAlertModal";
import ConfirmDialog from "./components/ConfirmDialog";
import type { BootstrapResponse, Mod, ModsUpdatedPayload } from "./types";

function applyModsPayload(
  payload: { mods?: Mod[]; subscribedWorkshopIds?: string[]; categories?: string[] },
  setMods: (m: Mod[]) => void,
) {
  if (!Array.isArray(payload.mods)) return;
  setMods(payload.mods);
  useStore.setState({
    originalMods: payload.mods,
    subscribedWorkshopIds: payload.subscribedWorkshopIds ?? [],
    ...(payload.categories ? { categories: payload.categories } : {}),
  });
}

async function loadBootstrapData(): Promise<BootstrapResponse> {
  const api = window.api;
  if (api.bootstrap) return api.bootstrap();

  const config = await api.getConfig();
  const scan = await api.scanMods();
  return {
    ...config,
    mods: scan.mods,
    subscribedWorkshopIds: scan.subscribedWorkshopIds,
    categories: config.categories ?? (await api.getCategories()),
  };
}

function ApiMissingScreen() {
  return (
    <div className="h-screen flex items-center justify-center bg-morandi-page p-8">
      <div className="max-w-md text-center space-y-3">
        <h1 className="text-lg font-semibold text-morandi-text">界面加载失败</h1>
        <p className="text-sm text-morandi-text-secondary">
          未检测到 Electron 接口（window.api）。请在 <code className="text-xs">desktop</code> 目录运行{" "}
          <code className="text-xs">npm run dev</code> 启动应用，不要单独用浏览器打开 Vite 页面。
        </p>
      </div>
    </div>
  );
}

function AppShell() {
  const t = useT();
  const { setMods, setPresets, setGames, setCurrentGame, setFolderPaths, setIsScanning, saveCurrentState } = useStore();
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

  useEffect(() => {
    const cleanups: Array<(() => void) | void> = [];

    const onModsUpdated = (payload: ModsUpdatedPayload) => {
      applyModsPayload(payload, setMods);
    };

    cleanups.push(window.api.onModsUpdated?.(onModsUpdated));
    cleanups.push(window.api.onPrerequisitesCheckStarted?.((modName) => {
      useStore.getState().setPrerequisiteChecking(modName, true);
    }));
    cleanups.push(window.api.onPrerequisitesCheckDone?.((modName) => {
      useStore.getState().setPrerequisiteChecking(modName, false);
    }));
    cleanups.push(window.api.onConfirmClose?.(() => {
      setShowCloseConfirm(true);
    }));

    (async () => {
      setIsScanning(true);
      setInitError(null);
      try {
        const data = await loadBootstrapData();
        setGames(data.games ?? []);
        setCurrentGame(data.currentGame);
        setPresets(data.presets ?? []);
        setFolderPaths(data.folderPaths);
        if (data.currentPresetName) {
          useStore.setState({ activePresetName: data.currentPresetName });
        }
        applyModsPayload(data, setMods);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[App] bootstrap failed:", e);
        setInitError(msg);
      } finally {
        setIsScanning(false);
      }
    })();

    return () => {
      for (const off of cleanups) off?.();
    };
  }, [setMods, setPresets, setGames, setCurrentGame, setFolderPaths, setIsScanning]);

  if (initError) {
    return (
      <div className="h-screen flex items-center justify-center bg-morandi-page p-8">
        <div className="max-w-md text-center space-y-3">
          <h1 className="text-lg font-semibold text-morandi-text">界面加载失败</h1>
          <p className="text-sm text-morandi-text-secondary break-words">{initError}</p>
          <button type="button" className="btn-morandi text-sm" onClick={() => window.location.reload()}>
            重新加载
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      <TopBar />
      <div className="flex-1 flex overflow-hidden">
        <Sidebar />
        <ModList />
      </div>
      <NewPresetModal />
      <SettingsPage />
      <CompatPanel />
      <ModDependencyModal />
      <ModUpdateModal />
      <DependencyAlertModal />

      <ConfirmDialog
        open={showCloseConfirm}
        title={t("close.unsavedTitle")}
        message={t("close.unsavedMsg")}
        confirmText={t("common.saveExit")}
        cancelText={t("common.cancel")}
        secondaryText={t("common.exitWithoutSaving")}
        variant="warning"
        onConfirm={async () => {
          setShowCloseConfirm(false);
          const ok = await saveCurrentState();
          window.api.closeDecision(ok ? "save" : "cancel");
        }}
        onSecondary={() => {
          setShowCloseConfirm(false);
          window.api.closeDecision("discard");
        }}
        onCancel={() => {
          setShowCloseConfirm(false);
          window.api.closeDecision("cancel");
        }}
      />
    </div>
  );
}

export default function App() {
  if (!window.api) return <ApiMissingScreen />;
  return <AppShell />;
}
