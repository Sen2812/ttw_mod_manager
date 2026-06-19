import { create } from "zustand";
import type { ModDependencyReport } from "@core/mod-manager/dependency-checker";
import type { Mod, Preset, GameInfo, OverwriteAnalysis, ModConflictStats } from "./types";

interface AppState {
  mods: Mod[]; presets: Preset[]; games: GameInfo[]; currentGame: string;
  folderPaths?: { gamePath?: string; contentFolder?: string; dataFolder?: string };
  filter: string; activePresetName: string | null;
  isScanning: boolean; isLaunching: boolean; isDirty: boolean; isSaving: boolean;
  showGameMenu: boolean; showNewPresetModal: boolean; showSettingsPage: boolean; showCompatPanel: boolean;
  /** 覆盖详情弹窗聚焦的 mod 名 */
  compatFocusMod: string | null;
  /** 实时覆盖统计：modName → {wins, losses, total}。仅包含有冲突的 mod */
  overwriteStats: Record<string, ModConflictStats> | null;
  /** 覆盖分析完整结果（打开面板时使用） */
  overwriteAnalysis: OverwriteAnalysis | null;
  originalMods: Mod[];
  /** Workshop content-folder IDs (subscribed items). */
  subscribedWorkshopIds: string[];
  dependencyFocusMod: string | null;
  showDependencyModal: boolean;
  /** 批量必须 mod 告警（勾选/导入/切换 Profile 后） */
  dependencyAlertReports: ModDependencyReport[] | null;
  /** 已知分类列表（含自定义） */
  categories: string[];
  categoryFilter: string | null;
  updateFocusMod: string | null;
  showUpdateModal: boolean;
  isCheckingUpdates: boolean;
  /** Mod names currently undergoing background required-mod detection. */
  prerequisiteChecking: Record<string, boolean>;
  setMods: (m: Mod[]) => void; setPresets: (p: Preset[]) => void;
  setGames: (g: GameInfo[]) => void; setCurrentGame: (g: string) => void;
  setFolderPaths: (p?: any) => void; setFilter: (f: string) => void;
  setActivePresetName: (n: string | null) => void;
  setIsScanning: (v: boolean) => void; setIsLaunching: (v: boolean) => void;
  setShowGameMenu: (v: boolean) => void; setShowNewPresetModal: (v: boolean) => void;
  setShowSettingsPage: (v: boolean) => void;
  /** 打开单个 mod 的覆盖详情弹窗 */
  openCompatPanel: (focusMod: string) => void;
  closeCompatPanel: () => void;
  setShowCompatPanel: (v: boolean) => void;
  /** 刷新覆盖统计（从后端拉取）。storeOnly=true 时只更新轻量 stats，不拉取完整冲突列表 */
  refreshOverwriteStats: (opts?: { full?: boolean }) => Promise<void>;
  openDependencyModal: (modName: string) => void;
  closeDependencyModal: () => void;
  openDependencyAlert: (reports: ModDependencyReport[]) => void;
  closeDependencyAlert: () => void;
  setCategories: (categories: string[]) => void;
  setCategoryFilter: (category: string | null) => void;
  openUpdateModal: (modName: string) => void;
  closeUpdateModal: () => void;
  setIsCheckingUpdates: (v: boolean) => void;
  setPrerequisiteChecking: (modName: string, checking: boolean) => void;
  markDirty: () => void; markClean: () => void;
  saveCurrentState: () => Promise<void>;
  filteredMods: () => Mod[]; enabledCount: () => number; totalCount: () => number;
  originalTotalCount: () => number;
}

export const useStore = create<AppState>((set, get) => ({
  mods: [], presets: [], games: [], currentGame: "wh3", folderPaths: undefined,
  filter: "", activePresetName: null, isScanning: false, isLaunching: false, isDirty: false, isSaving: false,
  showGameMenu: false, showNewPresetModal: false, showSettingsPage: false, showCompatPanel: false,
  compatFocusMod: null, overwriteStats: null, overwriteAnalysis: null,
  originalMods: [], subscribedWorkshopIds: [],
  dependencyFocusMod: null, showDependencyModal: false,
  dependencyAlertReports: null,
  categories: [], categoryFilter: null,
  updateFocusMod: null, showUpdateModal: false, isCheckingUpdates: false,
  prerequisiteChecking: {},
  setMods: (mods) => set({ mods }),
  setPresets: (presets) => set({ presets }),
  setGames: (games) => set({ games }), setCurrentGame: (currentGame) => set({ currentGame }),
  setFolderPaths: (folderPaths) => set({ folderPaths }), setFilter: (filter) => set({ filter }),
  setActivePresetName: (activePresetName) => {
    set({ activePresetName });
    window.api?.setActivePresetName(activePresetName).catch(console.error);
  },
  setIsScanning: (isScanning) => set({ isScanning }), setIsLaunching: (isLaunching) => set({ isLaunching }),
  setShowGameMenu: (showGameMenu) => set({ showGameMenu }),
  setShowNewPresetModal: (showNewPresetModal) => set({ showNewPresetModal }),
  setShowSettingsPage: (showSettingsPage) => set({ showSettingsPage }),
  openCompatPanel: (focusMod) => set({ showCompatPanel: true, compatFocusMod: focusMod }),
  closeCompatPanel: () => set({ showCompatPanel: false, compatFocusMod: null, overwriteAnalysis: null }),
  setShowCompatPanel: (showCompatPanel) => {
    if (!showCompatPanel) set({ showCompatPanel: false, compatFocusMod: null, overwriteAnalysis: null });
    else set({ showCompatPanel: true });
  },
  refreshOverwriteStats: async (opts) => {
    if (!window.api) return;
    try {
      const result = await window.api.analyzeOverwrites();
      set({ overwriteStats: result.modStats });
      if (opts?.full) set({ overwriteAnalysis: result });
    } catch (e) {
      console.error("Failed to refresh overwrite stats:", e);
    }
  },
  openDependencyModal: (modName) => set({ showDependencyModal: true, dependencyFocusMod: modName }),
  closeDependencyModal: () => set({ showDependencyModal: false, dependencyFocusMod: null }),
  openDependencyAlert: (reports) => set({
    dependencyAlertReports: reports.length > 0 ? reports : null,
  }),
  closeDependencyAlert: () => set({ dependencyAlertReports: null }),
  setCategories: (categories) => set({ categories }),
  setCategoryFilter: (categoryFilter) => set({ categoryFilter }),
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
  saveCurrentState: async () => {
    const { mods } = get();
    if (!window.api) return;
    set({ isSaving: true });
    try {
      await window.api.saveModState(mods);
      set({ isDirty: false });
      // 通知 electron 主进程已保存
      window.api?.setUnsavedChanges(false).catch(console.error);
      // 刷新 presets，让各 profile 的启用计数反映最新保存的状态
      set({ presets: await window.api.getPresets() });
    } catch (e) {
      console.error("Failed to save state:", e);
    } finally {
      set({ isSaving: false });
    }
  },
  filteredMods: () => {
    const { mods, filter } = get();
    if (!filter) return mods;
    const l = filter.toLowerCase();
    return mods.filter(m => {
      const name = m.name?.toLowerCase() || "";
      const humanName = m.humanName?.toLowerCase() || "";
      const workshopId = m.workshopId || "";
      return name.includes(l) || humanName.includes(l) || workshopId.includes(l);
    });
  },
  enabledCount: () => get().mods.filter(m => m.isEnabled).length,
  totalCount: () => get().mods.length,
  originalTotalCount: () => get().originalMods.length,
}));
