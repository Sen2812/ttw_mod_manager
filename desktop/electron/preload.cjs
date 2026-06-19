const { contextBridge, ipcRenderer } = require("electron");

const api = {
  getMods: () => ipcRenderer.invoke("get-mods"),
  bootstrap: () => ipcRenderer.invoke("bootstrap"),
  scanMods: () => ipcRenderer.invoke("scan-mods"),
  toggleMod: (n) => ipcRenderer.invoke("toggle-mod", n),
  enableMod: (n) => ipcRenderer.invoke("enable-mod", n),
  disableMod: (n) => ipcRenderer.invoke("disable-mod", n),
  enableAll: () => ipcRenderer.invoke("enable-all"),
  disableAll: () => ipcRenderer.invoke("disable-all"),
  applyDragOrder: (ns) => ipcRenderer.invoke("apply-drag-order", ns),
  resetLoadOrder: () => ipcRenderer.invoke("reset-load-order"),
  getConfig: () => ipcRenderer.invoke("get-config"),
  getSteamStatus: () => ipcRenderer.invoke("get-steam-status"),
  saveUiState: (s) => ipcRenderer.invoke("save-ui-state", s),
  saveModState: (m) => ipcRenderer.invoke("save-mod-state", m),
  savePresets: (p) => ipcRenderer.invoke("save-presets", p),
  setGame: (g) => ipcRenderer.invoke("set-game", g),
  getPresets: () => ipcRenderer.invoke("get-presets"),
  createPreset: (n, copyFromCurrent) => ipcRenderer.invoke("create-preset", n, copyFromCurrent),
  applyPreset: (n) => ipcRenderer.invoke("apply-preset", n),
  deletePreset: (n) => ipcRenderer.invoke("delete-preset", n),
  renamePreset: (oldName, newName) => ipcRenderer.invoke("rename-preset", oldName, newName),
  updatePreset: (n) => ipcRenderer.invoke("update-preset", n),
  setActivePresetName: (n) => ipcRenderer.invoke("set-active-preset-name", n),
  exportProfileOrder: (profileName, mods) => ipcRenderer.invoke("export-profile-order", profileName, mods),
  importProfileOrder: (mods) => ipcRenderer.invoke("import-profile-order", mods),
  getDataDir: () => ipcRenderer.invoke("get-data-dir"),
  selectDataDir: () => ipcRenderer.invoke("select-data-dir"),
  setDataDir: (d) => ipcRenderer.invoke("set-data-dir", d),
  launchGame: (mods) => ipcRenderer.invoke("launch-game", mods),
  setUnsavedChanges: (hasChanges) => ipcRenderer.invoke("set-unsaved-changes", hasChanges),
  hasUnsavedChanges: () => ipcRenderer.invoke("has-unsaved-changes"),
  analyzeOverwrites: () => ipcRenderer.invoke("analyze-overwrites"),
  getCategories: () => ipcRenderer.invoke("get-categories"),
  setModCategory: (modName, category) => ipcRenderer.invoke("set-mod-category", modName, category),
  addCustomCategory: (name) => ipcRenderer.invoke("add-custom-category", name),
  checkModUpdates: (force) => ipcRenderer.invoke("check-mod-updates", force),
  forceUpdateMod: (modName) => ipcRenderer.invoke("force-update-mod", modName),
  triggerWorkshopDownload: (workshopId) => ipcRenderer.invoke("trigger-workshop-download", workshopId),
  forceUpdateAllOutdated: () => ipcRenderer.invoke("force-update-all-outdated"),
  openUrl: (url) => ipcRenderer.invoke("open-url", url),
  openFolder: (targetPath) => ipcRenderer.invoke("open-folder", targetPath),
  onConfirmClose: (callback) => {
    ipcRenderer.on("confirm-close", callback);
  },
  closeDecision: (choice) => {
    ipcRenderer.send("close-decision", choice);
  },
  onSaveBeforeClose: (callback) => {
    ipcRenderer.on("save-before-close", callback);
  },
  onModsUpdated: (callback) => {
    ipcRenderer.on("mods-updated", (_e, payload) => callback(payload));
  },
  onPrerequisitesCheckStarted: (callback) => {
    ipcRenderer.on("prerequisites-check-started", (_e, modName) => callback(modName));
  },
  onPrerequisitesCheckDone: (callback) => {
    ipcRenderer.on("prerequisites-check-done", (_e, modName) => callback(modName));
  },
};

contextBridge.exposeInMainWorld("api", api);
