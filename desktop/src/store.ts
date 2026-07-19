import { create } from "zustand";
import type { Mod, Preset, GameInfo, OverwriteAnalysis, ModConflictStats, BootstrapResponse } from "./types";
import { enabledModsSignature } from "./utils/enabled-mods-signature";

let overwriteRefreshInFlight: Promise<void> | null = null;
let overwriteRefreshNeedsFull = false;

interface AppState {
  mods: Mod[]; presets: Preset[]; games: GameInfo[]; currentGame: string;
  folderPaths?: { gamePath?: string; contentFolder?: string; dataFolder?: string };
  activePresetName: string | null;
  isScanning: boolean; isLaunching: boolean; isDirty: boolean; isSaving: boolean;
  showGameMenu: boolean; showNewPresetModal: boolean; showSettingsPage: boolean; showFeaturesPage: boolean; showCompatPanel: boolean;
  /** 覆盖详情弹窗聚焦的 mod 名 */
  compatFocusMod: string | null;
  /** 实时覆盖统计：modName → {wins, losses, total}。仅包含有冲突的 mod */
  overwriteStats: Record<string, ModConflictStats> | null;
  /** 覆盖分析完整结果（打开面板时使用） */
  overwriteAnalysis: OverwriteAnalysis | null;
  /** enabledModsSignature when overwriteAnalysis was fetched */
  overwriteAnalysisKey: string | null;
  originalMods: Mod[];
  /** Workshop content-folder IDs (subscribed items). */
  subscribedWorkshopIds: string[];
  dependencyFocusMod: string | null;
  showDependencyModal: boolean;
  updateFocusMod: string | null;
  showUpdateModal: boolean;
  isCheckingUpdates: boolean;
  /** Last save failure message for sidebar feedback. */
  saveError: string | null;
  /** Mod names currently undergoing background required-mod detection. */
  prerequisiteChecking: Record<string, boolean>;
  /** True while switching profiles (IPC in flight). */
  profileSwitching: boolean;
  setMods: (m: Mod[]) => void; setPresets: (p: Preset[]) => void;
  setGames: (g: GameInfo[]) => void;
  setCurrentGame: (g: string) => void;  setFolderPaths: (p?: any) => void;
  setActivePresetName: (n: string | null) => void;
  setIsScanning: (v: boolean) => void; setIsLaunching: (v: boolean) => void;
  setShowGameMenu: (v: boolean) => void; setShowNewPresetModal: (v: boolean) => void;
  setShowSettingsPage: (v: boolean) => void;
  setShowFeaturesPage: (v: boolean) => void;
  /** 打开单个 mod 的覆盖详情弹窗 */
  openCompatPanel: (focusMod: string) => void;
  closeCompatPanel: () => void;
  setShowCompatPanel: (v: boolean) => void;
  /** 刷新覆盖统计（从后端拉取）。full=true 时拉取完整冲突文件列表 */
  refreshOverwriteStats: (opts?: { full?: boolean }) => Promise<void>;
  /** True when cached full analysis matches current enabled load order. */
  hasFreshOverwriteAnalysis: () => boolean;
  openDependencyModal: (modName: string) => void;
  closeDependencyModal: () => void;
  openUpdateModal: (modName: string) => void;
  closeUpdateModal: () => void;
  setIsCheckingUpdates: (v: boolean) => void;
  setPrerequisiteChecking: (modName: string, checking: boolean) => void;
  markDirty: () => void; markClean: () => void;
  beginPresetSwitch: (name: string) => void;
  finishPresetSwitch: (name: string, mods: Mod[]) => void;
  cancelPresetSwitch: (previousName: string | null) => void;
  saveCurrentState: () => Promise<boolean>;
  hydrateFromBootstrap: (data: BootstrapResponse) => void;
  enabledCount: () => number; totalCount: () => number;
}

export const useStore = create<AppState>((set, get) => ({
  mods: [], presets: [], games: [], currentGame: "wh3", folderPaths: undefined,
  activePresetName: null, isScanning: false, isLaunching: false, isDirty: false, isSaving: false,
  showGameMenu: false, showNewPresetModal: false, showSettingsPage: false, showFeaturesPage: false, showCompatPanel: false,
  compatFocusMod: null, overwriteStats: null, overwriteAnalysis: null, overwriteAnalysisKey: null,
  originalMods: [], subscribedWorkshopIds: [],
  dependencyFocusMod: null, showDependencyModal: false,
  updateFocusMod: null, showUpdateModal: false, isCheckingUpdates: false,
  saveError: null,
  prerequisiteChecking: {},
  profileSwitching: false,
  setMods: (mods) => set({ mods }),
  setPresets: (presets) => set({ presets }),
  setGames: (games) => set({ games }),
  setCurrentGame: (currentGame) => set({ currentGame }),  setFolderPaths: (folderPaths) => set({ folderPaths }),
  setActivePresetName: (activePresetName) => {
    set({ activePresetName });
    window.api?.setActivePresetName(activePresetName).catch(console.error);
  },
  setIsScanning: (isScanning) => set({ isScanning }), setIsLaunching: (isLaunching) => set({ isLaunching }),
  setShowGameMenu: (showGameMenu) => set({ showGameMenu }),
  setShowNewPresetModal: (showNewPresetModal) => set({ showNewPresetModal }),
  setShowSettingsPage: (showSettingsPage) => set({ showSettingsPage }),
  setShowFeaturesPage: (showFeaturesPage) => set({ showFeaturesPage }),
  openCompatPanel: (focusMod) => set({ showCompatPanel: true, compatFocusMod: focusMod }),
  closeCompatPanel: () => set({
    showCompatPanel: false,
    compatFocusMod: null,
    overwriteAnalysis: null,
    overwriteAnalysisKey: null,
  }),
  setShowCompatPanel: (showCompatPanel) => {
    if (!showCompatPanel) {
      set({
        showCompatPanel: false,
        compatFocusMod: null,
        overwriteAnalysis: null,
        overwriteAnalysisKey: null,
      });
    } else set({ showCompatPanel: true });
  },
  hasFreshOverwriteAnalysis: () => {
    const { mods, overwriteAnalysis, overwriteAnalysisKey } = get();
    return !!overwriteAnalysis
      && overwriteAnalysisKey === enabledModsSignature(mods);
  },
  refreshOverwriteStats: async (opts) => {
    if (!window.api) return;

    if (opts?.full) {
      const { mods, overwriteAnalysis, overwriteAnalysisKey } = get();
      const key = enabledModsSignature(mods);
      if (overwriteAnalysis && overwriteAnalysisKey === key) return;
    }

    if (opts?.full) overwriteRefreshNeedsFull = true;
    if (overwriteRefreshInFlight) return overwriteRefreshInFlight;

    overwriteRefreshInFlight = (async () => {
      try {
        while (true) {
          const needFull = overwriteRefreshNeedsFull;
          overwriteRefreshNeedsFull = false;
          const statsOnly = !needFull;
          const result = await window.api.analyzeOverwrites({ statsOnly });
          const key = enabledModsSignature(get().mods);
          set({ overwriteStats: result.modStats });
          if (needFull) {
            set({
              overwriteAnalysis: result,
              overwriteAnalysisKey: key,
            });
          } else if (get().overwriteAnalysisKey !== key) {
            set({ overwriteAnalysis: null, overwriteAnalysisKey: null });
          }
          if (!overwriteRefreshNeedsFull) break;
        }
      } catch (e) {
        console.error("Failed to refresh overwrite stats:", e);
      } finally {
        overwriteRefreshInFlight = null;
      }
    })();

    return overwriteRefreshInFlight;
  },
  openDependencyModal: (modName) => set({ showDependencyModal: true, dependencyFocusMod: modName }),
  closeDependencyModal: () => set({ showDependencyModal: false, dependencyFocusMod: null }),
  openUpdateModal: (modName) => set({ showUpdateModal: true, updateFocusMod: modName }),
  closeUpdateModal: () => set({ showUpdateModal: false, updateFocusMod: null }),
  setIsCheckingUpdates: (isCheckingUpdates) => set({ isCheckingUpdates }),
  setPrerequisiteChecking: (modName, checking) => set(state => {
    const next = { ...state.prerequisiteChecking };
    if (checking) next[modName] = true;
    else delete next[modName];
    return { prerequisiteChecking: next };
  }),
  markDirty: () => {
    set({ isDirty: true });
    window.api?.setUnsavedChanges(true).catch(console.error);
  },
  markClean: () => {
    set({ isDirty: false });
    window.api?.setUnsavedChanges(false).catch(console.error);
  },
  beginPresetSwitch: (name) => {
    set({
      activePresetName: name,
      profileSwitching: true,
      overwriteStats: null,
      overwriteAnalysis: null,
      overwriteAnalysisKey: null,
    });
  },
  finishPresetSwitch: (name, mods) => {
    set({
      mods,
      activePresetName: name,
      originalMods: mods,
      isDirty: false,
      profileSwitching: false,
      overwriteStats: null,
      overwriteAnalysis: null,
      overwriteAnalysisKey: null,
    });
    window.api?.setUnsavedChanges(false).catch(console.error);
  },
  cancelPresetSwitch: (previousName) => {
    set({ activePresetName: previousName, profileSwitching: false });
  },
  saveCurrentState: async () => {
    const { mods } = get();
    if (!window.api) return false;
    set({ isSaving: true, saveError: null });
    try {
      await window.api.saveModState(mods);
      set({ isDirty: false, saveError: null });
      window.api?.setUnsavedChanges(false).catch(console.error);
      set({ presets: await window.api.getPresets() });
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("Failed to save state:", e);
      set({ saveError: msg });
      return false;
    } finally {
      set({ isSaving: false });
    }
  },
  hydrateFromBootstrap: (data) => {
    set({
      mods: data.mods,
      originalMods: data.mods,
      presets: data.presets ?? [],
      currentGame: data.currentGame,
      folderPaths: data.folderPaths,
      subscribedWorkshopIds: data.subscribedWorkshopIds ?? [],
      activePresetName: data.currentPresetName ?? null,
      isDirty: false,      saveError: null,
    });
  },
  enabledCount: () => get().mods.filter(m => m.isEnabled).length,
  totalCount: () => get().mods.length,
}));
