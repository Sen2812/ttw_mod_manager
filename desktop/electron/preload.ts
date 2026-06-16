import { contextBridge, ipcRenderer } from "electron";

const api = {
  // Mod
  getMods: () => ipcRenderer.invoke("get-mods"),
  scanMods: () => ipcRenderer.invoke("scan-mods"),
  toggleMod: (n: string) => ipcRenderer.invoke("toggle-mod", n),
  enableMod: (n: string) => ipcRenderer.invoke("enable-mod", n),
  disableMod: (n: string) => ipcRenderer.invoke("disable-mod", n),
  enableAll: () => ipcRenderer.invoke("enable-all"),
  disableAll: () => ipcRenderer.invoke("disable-all"),
  applyDragOrder: (ns: string[]) => ipcRenderer.invoke("apply-drag-order", ns),
  resetLoadOrder: () => ipcRenderer.invoke("reset-load-order"),
  // Config
  getConfig: () => ipcRenderer.invoke("get-config"),
  saveUiState: (s: any) => ipcRenderer.invoke("save-ui-state", s),
  saveModState: (m: any[]) => ipcRenderer.invoke("save-mod-state", m),
  savePresets: (p: any[]) => ipcRenderer.invoke("save-presets", p),
  // Game
  setGame: (g: string) => ipcRenderer.invoke("set-game", g),
  // Presets
  getPresets: () => ipcRenderer.invoke("get-presets"),
  createPreset: (n: string, copyFromCurrent?: boolean) => ipcRenderer.invoke("create-preset", n, copyFromCurrent),
  applyPreset: (n: string) => ipcRenderer.invoke("apply-preset", n),
  deletePreset: (n: string) => ipcRenderer.invoke("delete-preset", n),
  renamePreset: (oldName: string, newName: string) => ipcRenderer.invoke("rename-preset", oldName, newName),
  updatePreset: (n: string) => ipcRenderer.invoke("update-preset", n),
  setActivePresetName: (n: string | null) => ipcRenderer.invoke("set-active-preset-name", n),
  exportProfileOrder: (profileName: string, mods?: any[]) =>
    ipcRenderer.invoke("export-profile-order", profileName, mods),
  importProfileOrder: (mods?: any[]) => ipcRenderer.invoke("import-profile-order", mods),
  // Data dir
  getDataDir: () => ipcRenderer.invoke("get-data-dir"),
  selectDataDir: () => ipcRenderer.invoke("select-data-dir"),
  setDataDir: (d: string) => ipcRenderer.invoke("set-data-dir", d),
  // Launch
  launchGame: (mods?: any[]) => ipcRenderer.invoke("launch-game", mods),
  // Unsaved changes
  setUnsavedChanges: (hasChanges: boolean) => ipcRenderer.invoke("set-unsaved-changes", hasChanges),
  hasUnsavedChanges: () => ipcRenderer.invoke("has-unsaved-changes"),
  // Overwrite / conflict analysis
  analyzeOverwrites: () => ipcRenderer.invoke("analyze-overwrites"),
  getCategories: () => ipcRenderer.invoke("get-categories"),
  setModCategory: (modName: string, category: string | null) =>
    ipcRenderer.invoke("set-mod-category", modName, category),
  addCustomCategory: (name: string) => ipcRenderer.invoke("add-custom-category", name),
  checkModUpdates: (force?: boolean) => ipcRenderer.invoke("check-mod-updates", force),
  forceUpdateMod: (modName: string) => ipcRenderer.invoke("force-update-mod", modName),
  forceUpdateAllOutdated: () => ipcRenderer.invoke("force-update-all-outdated"),
  // External links / folders
  openUrl: (url: string) => ipcRenderer.invoke("open-url", url),
  openFolder: (targetPath: string) => ipcRenderer.invoke("open-folder", targetPath),
  // 关闭确认（主进程 → 渲染进程：请求显示弹窗；渲染进程 → 主进程：返回决定）
  onConfirmClose: (callback: () => void) => {
    ipcRenderer.on("confirm-close", callback);
  },
  closeDecision: (choice: "save" | "discard" | "cancel") => {
    ipcRenderer.send("close-decision", choice);
  },
  onSaveBeforeClose: (callback: () => void) => {
    ipcRenderer.on("save-before-close", callback);
  },
};

contextBridge.exposeInMainWorld("api", api);
export type Api = typeof api;
