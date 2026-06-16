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
import ConfirmDialog from "./components/ConfirmDialog";

export default function App() {
  const t = useT();
  const { setMods, setPresets, setGames, setCurrentGame, setFolderPaths, setIsScanning, saveCurrentState } = useStore();
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);

  useEffect(() => {
    // 初始化：加载配置和扫描 mods
    (async () => {
      setIsScanning(true);
      try {
        const config = await window.api.getConfig();
        setGames(config.games); setCurrentGame(config.currentGame);
        setPresets(config.presets); setFolderPaths(config.folderPaths);
        if (config.subscribedWorkshopIds) {
          useStore.setState({ subscribedWorkshopIds: config.subscribedWorkshopIds });
        }
        if (config.categories) {
          useStore.setState({ categories: config.categories });
        }
        if (config.currentPresetName) {
          useStore.setState({ activePresetName: config.currentPresetName });
        }
        const scan = await window.api.scanMods();
        setMods(scan.mods);
        useStore.setState({
          originalMods: scan.mods,
          subscribedWorkshopIds: scan.subscribedWorkshopIds,
          categories: await window.api.getCategories(),
        });
        // 后台自动检查工坊版本（使用缓存 TTL，避免频繁 API 调用）
        window.api.checkModUpdates(false).then((result) => {
          setMods(result.mods);
        }).catch(console.error);
      } finally { setIsScanning(false); }
    })();

    // 监听保存前关闭事件（保存并退出路径）
    window.api.onSaveBeforeClose(async () => {
      await saveCurrentState();
    });

    // 监听主进程的关闭确认请求（有未保存修改时）
    window.api.onConfirmClose(() => {
      setShowCloseConfirm(true);
    });
  }, []);

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

      {/* 关闭应用确认弹窗（有未保存修改时） */}
      <ConfirmDialog
        open={showCloseConfirm}
        title={t("close.unsavedTitle")}
        message={t("close.unsavedMsg")}
        confirmText={t("common.saveExit")}
        cancelText={t("common.cancel")}
        secondaryText={t("common.exitWithoutSaving")}
        variant="warning"
        onConfirm={() => {
          setShowCloseConfirm(false);
          window.api.closeDecision("save");
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
