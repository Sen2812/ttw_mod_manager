import { app, BrowserWindow, ipcMain, dialog, protocol, net, shell } from "electron";
import { exec } from "child_process";
import * as path from "path";
import * as fs from "fs";

import { ModManager, sortByLoadOrder } from "../../core/src";
import { gameRegistry, BUILTIN_GAMES } from "../../core/src";
import { SupportedGame, Mod, Preset } from "../../core/src";
import { findSteamPath as coreFindSteamPath } from "../../core/src/mod-manager/mod-discovery";
import { syncModsToLauncher } from "../../core/src/launcher/launcher-sync";
import { generateUsedModsContent } from "../../core/src/launcher/used-mods";
import { readPackIndex } from "../../core/src/pack-file/pack-index-reader";
import { detectOverwrites } from "../../core/src/compat/overwrite-detector";
import { countOutdatedMods } from "../../core/src/mod-manager/workshop-update-status";

let mainWindow: BrowserWindow | null = null;
let mm: ModManager;
let dataDir: string; // 数据持久化目录
let hasUnsavedChanges = false; // 追踪未保存的更改
// 关闭确认：主进程等待渲染进程返回决定（save / discard / cancel）
let pendingCloseDecision: ((choice: "save" | "discard" | "cancel") => void) | null = null;
let isConfirmingClose = false; // 防止重复弹窗

for (const game of BUILTIN_GAMES) gameRegistry.register(game);

// ─── 数据目录管理 ────────────────────────────────────────────────────────────

const SETTINGS_FILE = "settings.json";

function getSettingsPath(): string { return path.join(app.getPath("userData"), SETTINGS_FILE); }

function loadSettings(): { dataDir?: string } {
  try { return JSON.parse(fs.readFileSync(getSettingsPath(), "utf8")); } catch { return {}; }
}

function saveSettings(s: any): void {
  try { fs.writeFileSync(getSettingsPath(), JSON.stringify(s, null, 2), "utf8"); } catch {}
}

function ensureDataDir(dir: string): void { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); }

// ─── UI 状态（存在数据目录下）────────────────────────────────────────────────

const UI_STATE_FILE = "ui-state.json";

function loadUiState(): any {
  try { return JSON.parse(fs.readFileSync(path.join(dataDir, UI_STATE_FILE), "utf8")); } catch { return {}; }
}

function saveUiState(patch: any): void {
  const current = loadUiState();
  try { fs.writeFileSync(path.join(dataDir, UI_STATE_FILE), JSON.stringify({ ...current, ...patch }, null, 2), "utf8"); } catch {}
}

// ─── Preset 持久化（存在数据目录下）──────────────────────────────────────────

function getPresetsPath(gameId: string): string { return path.join(dataDir, "presets-" + gameId + ".json"); }

function loadPresets(gameId: string): Preset[] {
  try { return JSON.parse(fs.readFileSync(getPresetsPath(gameId), "utf8")); } catch { return []; }
}

function savePresetsToDisk(gameId: string, presets: Preset[]): void {
  try { fs.writeFileSync(getPresetsPath(gameId), JSON.stringify(presets, null, 2), "utf8"); } catch {}
}

// ─── Steam 路径 ──────────────────────────────────────────────────────────────

// 使用 core 库的 findSteamPath，保持同步包装
let cachedSteamPath: string | undefined;
async function findSteamPath(): Promise<string | undefined> {
  if (cachedSteamPath !== undefined) return cachedSteamPath;
  cachedSteamPath = await coreFindSteamPath();
  return cachedSteamPath;
}

// ─── IPC ──────────────────────────────────────────────────────────────────────

function syncModsFromRenderer(mods: Mod[]): void {
  mm.syncModsFromClient(mods);
}

function profileOrderExportFilename(profileName: string): string {
  const safe = profileName.replace(/[\\/:*?"<>|]/g, "_").trim() || "profile";
  return `${safe}.json`;
}

function writeProfileOrderExport(profileName: string): { ok: boolean; path?: string; error?: string } {
  try {
    const data = mm.buildProfileOrderExport(profileName);
    const result = dialog.showSaveDialogSync({
      title: "Export load order",
      defaultPath: profileOrderExportFilename(profileName),
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (!result) return { ok: false };
    fs.writeFileSync(result, JSON.stringify(data, null, 2), "utf8");
    return { ok: true, path: result };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}

function readProfileOrderImport(): {
  ok: boolean;
  mods?: Mod[];
  applied?: number;
  skipped?: number;
  skippedNames?: string[];
  error?: string;
} {
  try {
    const result = dialog.showOpenDialogSync({
      title: "Import load order",
      filters: [{ name: "JSON", extensions: ["json"] }],
      properties: ["openFile"],
    });
    if (!result?.length) return { ok: false };
    const raw = JSON.parse(fs.readFileSync(result[0], "utf8"));
    if (!raw?.mods || !Array.isArray(raw.mods)) {
      return { ok: false, error: "INVALID_FORMAT" };
    }
    const importResult = mm.applyProfileOrderImport(raw);
    return { ok: true, mods: mm.getMods(), ...importResult };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}

function registerIpc() {
  // ── 配置 ─────────────────────────────────────────────────────────────────
  ipcMain.handle("get-config", () => {
    const ui = loadUiState();
    return {
      currentGame: mm.config.currentGame,
      games: BUILTIN_GAMES.map(g => ({ id: g.id, name: g.displayName })),
      presets: mm.getPresets(),
      currentPresetName: mm.getActivePresetName(),
      folderPaths: mm.folderPaths,
      profileFilterModes: ui.profileFilterModes ?? {},
      modFilterMode: ui.modFilterMode ?? "all",
      subscribedWorkshopIds: mm.subscribedWorkshopIds,
      categories: mm.getCategories(),
      dataDir,
    };
  });

  // ── UI 状态 ──────────────────────────────────────────────────────────────
  ipcMain.handle("save-ui-state", (_e, state: any) => { saveUiState(state); return { ok: true }; });
  
  // ── 未保存更改状态 ──────────────────────────────────────────────────────
  ipcMain.handle("set-unsaved-changes", (_e, hasChanges: boolean) => { 
    hasUnsavedChanges = hasChanges; 
    return { ok: true }; 
  });
  ipcMain.handle("has-unsaved-changes", () => hasUnsavedChanges);

  // 渲染进程返回关闭确认决定（save / discard / cancel）
  ipcMain.on("close-decision", (_e, choice: "save" | "discard" | "cancel") => {
    if (pendingCloseDecision) {
      pendingCloseDecision(choice);
      pendingCloseDecision = null;
    }
  });

  // ── Mod 操作 ─────────────────────────────────────────────────────────────
  ipcMain.handle("get-mods", () => mm.getMods());
  ipcMain.handle("scan-mods", async () => {
    await mm.scanMods();
    return { mods: mm.getMods(), subscribedWorkshopIds: mm.subscribedWorkshopIds };
  });
  ipcMain.handle("toggle-mod", (_e, n: string) => { mm.toggleMod(n); return mm.getMods(); });
  ipcMain.handle("enable-mod", (_e, n: string) => { mm.enableMod(n); return mm.getMods(); });
  ipcMain.handle("disable-mod", (_e, n: string) => { mm.disableMod(n); return mm.getMods(); });
  ipcMain.handle("enable-all", () => { mm.enableAll(); return mm.getMods(); });
  ipcMain.handle("disable-all", () => { mm.disableAll(); return mm.getMods(); });
  ipcMain.handle("apply-drag-order", (_e, names: string[]) => {
    const mods = mm.getMods();
    const map = new Map(mods.map(m => [m.name, m]));
    // names 是前端显示顺序（从上到下）。
    // loadOrder 升序：列表顶部 = loadOrder 0 = 先加载 = 优先级最低；
    // 列表底部 = 最高 loadOrder = 后加载 = 覆盖上方。
    names.forEach((name, i) => {
      const m = map.get(name);
      if (m) m.loadOrder = i;
    });
    // 重新排序数组
    mm.mods = sortByLoadOrder(mm.mods);
    return mm.getMods();
  });
  ipcMain.handle("reset-load-order", () => { mm.resetLoadOrder(); return mm.getMods(); });

  // ── 分类 ─────────────────────────────────────────────────────────────────
  ipcMain.handle("get-categories", () => mm.getCategories());
  ipcMain.handle("set-mod-category", (_e, modName: string, category: string | null) => {
    mm.setModCategory(modName, category);
    mm.syncCategoryRegistry();
    return { mods: mm.getMods(), categories: mm.getCategories() };
  });
  ipcMain.handle("add-custom-category", (_e, name: string) => {
    mm.addCustomCategory(name);
    return mm.getCategories();
  });

  // ── 工坊更新 ─────────────────────────────────────────────────────────────
  ipcMain.handle("check-mod-updates", async (_e, force?: boolean) => {
    const result = await mm.checkModUpdates(force === true);
    return result;
  });
  ipcMain.handle("force-update-mod", async (_e, modName: string) => {
    const result = await mm.forceUpdateMod(modName);
    return { ...result, mods: mm.getMods(), outdatedCount: countOutdatedMods(mm.getMods()) };
  });
  ipcMain.handle("force-update-all-outdated", async () => {
    const result = await mm.forceUpdateAllOutdated();
    return { ...result, outdatedCount: countOutdatedMods(mm.getMods()) };
  });

  // ── 覆盖/冲突分析 ───────────────────────────────────────────────────────────
  // Pack 内部文件索引缓存（path → index + mtimeMs + size）。
  // pack 文件除非被更新否则不会变，按 mtime+size 失效。
  const packIndexCache = new Map<string, { index: any; mtimeMs: number; size: number }>();
  async function getCachedPackIndex(packPath: string): Promise<any | null> {
    try {
      const stat = fs.statSync(packPath);
      const cached = packIndexCache.get(packPath);
      if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
        return cached.index;
      }
      const index = await readPackIndex(packPath);
      packIndexCache.set(packPath, { index, mtimeMs: stat.mtimeMs, size: stat.size });
      return index;
    } catch {
      return null;
    }
  }

  // 读取所有启用 mod 的 pack 内部文件索引，按加载顺序检测文件覆盖关系。
  // 每次勾选/取消都会触发，因此使用缓存让重复调用几乎是零成本。
  ipcMain.handle("analyze-overwrites", async () => {
    const enabledMods = mm.getEnabledMods();
    if (enabledMods.length === 0) {
      return { conflicts: [], modStats: {}, modsWithConflicts: 0, totalConflicts: 0 };
    }

    const modPathByName = new Map<string, string>();
    const indices = new Map<string, any>();
    await Promise.all(enabledMods.map(async (mod) => {
      modPathByName.set(mod.name, mod.path);
      const idx = await getCachedPackIndex(mod.path);
      if (idx) indices.set(mod.path, idx);
    }));

    const analysis = detectOverwrites(
      enabledMods.map(m => ({ name: m.name, loadOrder: m.loadOrder ?? 0 })),
      indices,
      { modPathByName },
    );

    // 序列化 Map -> Record（IPC 不能传输 Map）
    const modStatsObj: Record<string, any> = {};
    for (const [k, v] of analysis.modStats) modStatsObj[k] = v;

    return {
      conflicts: analysis.conflicts,
      modStats: modStatsObj,
      modsWithConflicts: analysis.modsWithConflicts,
      totalConflicts: analysis.totalConflicts,
    };
  });

  // ── 保存 mod 状态（显式保存）────────────────────────────────────────────
  ipcMain.handle("save-mod-state", (_e, mods: Mod[]) => {
    syncModsFromRenderer(mods);
    mm.saveCurrentPreset();
    return { ok: true };
  });

  // ── 保存预设（显式保存）─────────────────────────────────────────────────
  ipcMain.handle("save-presets", (_e, presets: Preset[]) => {
    // Update core's presets
    const currentGame = mm.config.currentGame;
    mm.config.gamePresets[currentGame] = presets;
    mm.saveConfig();
    return { ok: true };
  });

  // ── 预设操作（使用 core 库的方法）──────────────────────────────────────
  ipcMain.handle("get-presets", () => mm.getPresets());
  ipcMain.handle("create-preset", (_e, n: string, copyFromCurrent?: boolean) => {
    try {
      mm.createPreset(n, copyFromCurrent !== false);
      return mm.getPresets();
    } catch (e: any) {
      return { error: e.message };
    }
  });
  ipcMain.handle("apply-preset", (_e, n: string) => {
    try {
      mm.applyPreset(n);
      return mm.getMods();
    } catch (e: any) {
      return { error: e.message };
    }
  });
  ipcMain.handle("set-active-preset-name", (_e, n: string | null) => {
    mm.setActivePresetName(n);
    return { ok: true };
  });
  ipcMain.handle("delete-preset", (_e, n: string) => {
    try {
      mm.deletePreset(n);
      return mm.getPresets();
    } catch (e: any) {
      return { error: e.message };
    }
  });
  ipcMain.handle("rename-preset", (_e, oldName: string, newName: string) => {
    try {
      mm.renamePreset(oldName, newName);
      return { presets: mm.getPresets(), activePresetName: mm.getActivePresetName() };
    } catch (e: any) {
      return { error: e.message };
    }
  });
  ipcMain.handle("update-preset", (_e, n: string) => {
    try {
      mm.replacePreset(n);
      return mm.getPresets();
    } catch (e: any) {
      return { error: e.message };
    }
  });

  ipcMain.handle("export-profile-order", (_e, profileName: string, mods?: Mod[]) => {
    if (mods?.length) syncModsFromRenderer(mods);
    return writeProfileOrderExport(profileName ?? mm.getActivePresetName());
  });
  ipcMain.handle("import-profile-order", (_e, mods?: Mod[]) => {
    if (mods?.length) syncModsFromRenderer(mods);
    return readProfileOrderImport();
  });

  // ── 切换游戏 ─────────────────────────────────────────────────────────────
  ipcMain.handle("set-game", async (_e, g: string) => {
    try {
      await mm.setGame(g as SupportedGame);
      return {
        mods: mm.getMods(),
        presets: mm.getPresets(),
        game: { id: g, name: mm.currentGame?.displayName },
        subscribedWorkshopIds: mm.subscribedWorkshopIds,
      };
    } catch (e: any) {
      const errorMsg = e.message.includes("Unknown game") 
        ? `Game '${g}' is not supported` 
        : `Failed to switch game: ${e.message}`;
      return { error: errorMsg };
    }
  });

  // ── 数据目录 ─────────────────────────────────────────────────────────────
  ipcMain.handle("get-data-dir", () => dataDir);
  ipcMain.handle("select-data-dir", async () => {
    const result = await dialog.showOpenDialog({ properties: ["openDirectory", "createDirectory"], defaultPath: dataDir });
    if (result.canceled || !result.filePaths[0]) return null;
    return result.filePaths[0];
  });
  ipcMain.handle("set-data-dir", async (_e, newDir: string) => {
    ensureDataDir(newDir);
    const settings = loadSettings();
    settings.dataDir = newDir;
    saveSettings(settings);
    dataDir = newDir;
    // 同步迁移 ModManager 到新目录（重新加载配置与扫描 mod）
    await mm.setConfigDir(newDir);
    return { ok: true, dataDir };
  });

  // ── 启动游戏 ─────────────────────────────────────────────────────────────
  // ── 外部链接 / 文件夹 ──
  // 用系统默认浏览器打开 URL（工坊页面等），避免在 Electron 内部打开
  ipcMain.handle("open-url", async (_e, url: string) => {
    try {
      await shell.openExternal(url);
      return { ok: true };
    } catch (e: any) {
      console.error("Failed to open URL:", e.message);
      return { ok: false, error: e.message };
    }
  });

  // 在系统文件资源管理器中打开文件夹（并选中指定文件）
  // 传入文件路径时，会用 showItemInFolder 选中该文件；传入文件夹时用 openPath 打开
  ipcMain.handle("open-folder", async (_e, targetPath: string) => {
    try {
      if (!targetPath) return { ok: false, error: "Empty path" };
      // 判断目标是文件还是目录
      let stat;
      try { stat = fs.statSync(targetPath); } catch { return { ok: false, error: "Path not found" }; }
      if (stat.isFile()) {
        // 选中文件（在资源管理器中高亮）
        shell.showItemInFolder(targetPath);
        return { ok: true };
      }
      // 目录：直接打开
      const err = await shell.openPath(targetPath);
      return { ok: !err, error: err || undefined };
    } catch (e: any) {
      console.error("Failed to open folder:", e.message);
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle("launch-game", async (_e, mods?: Mod[]) => {
    const game = mm.currentGame;
    if (!game) return { error: "No game selected" };

    // 使用当前会话中的 mod 状态（含未保存修改），不再重新 applyPreset
    if (mods?.length) syncModsFromRenderer(mods);

    const gamePath = mm.folderPaths?.gamePath;
    const dataFolder = mm.folderPaths?.dataFolder;
    if (!gamePath) return { error: "Game path not found" };
    if (!dataFolder) return { error: "Data folder not found" };

    const enabledMods = mm.getEnabledMods();

    // ── 1. 生成 used_mods.txt 内容 ──
    // 参考 WH3-Mod-Manager 的实现：
    //   - 按加载顺序（loadOrder 升序）排列，后加载的 mod 优先级更高
    //   - Workshop 目录的 mod 需要 add_working_directory
    //   - data/modding/ 的 mod 需要先复制到 data/
    const isLinux = process.platform === "linux";
    const { text: usedModsText, modsToCopyToData } = generateUsedModsContent(
      enabledMods,
      dataFolder,
      isLinux,
    );

    // ── 2. 复制 data/modding/ 的 mod 到 data/ 目录 ──
    for (const mod of modsToCopyToData) {
      try {
        const destPath = path.join(dataFolder, mod.name);
        fs.copyFileSync(mod.path, destPath);
      } catch (e: any) {
        console.error(`[launcher] Failed to copy ${mod.name} to data:`, e.message);
      }
    }

    // ── 3. 写入 used_mods.txt 到游戏根目录（不是 data 目录！）──
    const usedModsPath = path.join(gamePath, "used_mods.txt");
    const encoding = game.id === "shogun2" ? "utf16le" : "utf8";
    let modListFileName = "used_mods.txt";
    try {
      fs.writeFileSync(usedModsPath, usedModsText, { encoding });
      console.log(`[launcher] Written ${enabledMods.length} mods to ${usedModsPath}`);
    } catch (e: any) {
      // 某些游戏/安装可能没有写权限到根目录，回退到 my_mods.txt
      console.error(`[launcher] Failed to write used_mods.txt:`, e.message);
      modListFileName = "my_mods.txt";
      try {
        fs.writeFileSync(path.join(gamePath, "my_mods.txt"), usedModsText, { encoding });
      } catch (e2: any) {
        return { error: `Failed to write mod list: ${e2.message}` };
      }
    }

    // ── 4. 同步到 CA 启动器的 moddata.dat（作为备选/兼容）──
    // 这样即使用户之后通过 Steam/CA 启动器启动，mod 状态也是一致的
    try {
      syncModsToLauncher(mm.getMods(), game.launcherGameId, {
        log: (msg) => console.log(`[launcher] ${msg}`),
      });
    } catch (e: any) {
      console.error(`[launcher] Failed to sync moddata.dat:`, e.message);
    }

    // ── 5. 为旧游戏创建 steam_appid.txt（Attila/Rome2/Shogun2 需要）──
    if (["attila", "rome2", "shogun2"].includes(game.id)) {
      const steamAppIdPath = path.join(gamePath, "steam_appid.txt");
      try {
        fs.writeFileSync(steamAppIdPath, game.steamId);
      } catch (e: any) {
        console.error(`[launcher] Failed to create steam_appid.txt:`, e.message);
      }
    }

    // ── 6. 启动游戏可执行文件，并传递 used_mods.txt 作为命令行参数 ──
    // 这是关键步骤！游戏 exe 接收到文件名参数后才会读取 mod 列表
    const gameExePath = path.join(gamePath, game.processName);
    if (!fs.existsSync(gameExePath)) {
      return { error: `Game executable not found: ${gameExePath}` };
    }

    try {
      if (isLinux) {
        // Linux: 通过 protontricks-launch 启动
        const batData = `protontricks-launch --cwd-app --appid ${game.steamId} "${gameExePath}" ${modListFileName};`;
        exec(batData, (error) => { if (error) console.error(`[launcher] exec error:`, error); });
      } else {
        // Windows: 用 start 命令在游戏目录启动，传递 mod 列表文件名
        // 参考 WH3-Mod-Manager 的实现
        const batData = `start /d "${gamePath}" ${game.processName} ${modListFileName};`;
        exec(batData, (error) => { if (error) console.error(`[launcher] exec error:`, error); });
      }
      console.log(`[launcher] Game launched with ${enabledMods.length} enabled mods`);
      const closeOnPlay = mm.config.preferences.isClosedOnPlay;
      if (closeOnPlay && mainWindow) {
        hasUnsavedChanges = false;
        setImmediate(() => mainWindow?.close());
      }
      return { success: true, modsCount: enabledMods.length, closeOnPlay };
    } catch (e: any) {
      return { error: `Failed to launch game: ${e.message}` };
    }
  });
}

// ─── 窗口 ────────────────────────────────────────────────────────────────────

function getAppIconPath(): string {
  if (app.isPackaged) return path.join(process.resourcesPath, "icon.png");
  return path.join(__dirname, "../build/icon.png");
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100, height: 720, minWidth: 800, minHeight: 500,
    frame: false, titleBarStyle: "hidden", backgroundColor: "#F5F0EB",
    icon: getAppIconPath(),
    webPreferences: { 
      preload: path.join(__dirname, "preload.js"), 
      contextIsolation: true, 
      nodeIntegration: false,
      webSecurity: false,  // 允许访问本地文件
    },
  });
  
  if (process.env.VITE_DEV_SERVER_URL) mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  else mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  
  // 处理窗口关闭事件——用应用内 Morandi 风格弹窗，而非 Windows 原生对话框
  mainWindow.on('close', async (e) => {
    if (!hasUnsavedChanges) return; // 没有未保存修改，直接关闭
    e.preventDefault();
    if (isConfirmingClose) return; // 已在弹窗中，避免重复
    isConfirmingClose = true;
    // 询问渲染进程，等待用户决定
    mainWindow!.webContents.send('confirm-close');
    const choice = await new Promise<"save" | "discard" | "cancel">((resolve) => {
      pendingCloseDecision = resolve;
    });
    pendingCloseDecision = null;
    isConfirmingClose = false;

    if (choice === "save") {
      // 保存并退出：通知渲染进程提交 saveModState
      mainWindow!.webContents.send('save-before-close');
      await new Promise(resolve => setTimeout(resolve, 200));
      try {
        await mm.flush();
      } catch (err) {
        console.error('[core] Failed to flush config on close:', err);
      }
      hasUnsavedChanges = false;
      mainWindow!.close();
    } else if (choice === "discard") {
      // 不保存退出
      hasUnsavedChanges = false;
      mainWindow!.close();
    }
    // cancel: 保持打开
  });
}

// ─── 启动 ────────────────────────────────────────────────────────────────────

// 注册自定义协议来支持本地文件访问（用于显示 mod 封面图片）
protocol.registerSchemesAsPrivileged([
  {
    scheme: "local-file",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      bypassCSP: true,
    },
  },
]);

app.whenReady().then(async () => {
  // 注册协议处理器 - 处理本地文件访问
  protocol.handle("local-file", (request) => {
    // 移除协议前缀，处理 Windows 路径
    let filePath = request.url.replace("local-file://", "");
    // 解码 URL 编码的字符
    filePath = decodeURIComponent(filePath);
    // 确保路径格式正确（Windows 使用反斜杠）
    filePath = filePath.replace(/\//g, "\\");
    return net.fetch(`file:///${filePath}`);
  });
  
  const settings = loadSettings();
  dataDir = settings.dataDir ?? app.getPath("userData");
  ensureDataDir(dataDir);

  mm = new ModManager({ configDir: dataDir, log: msg => console.log("[core]", msg) });
  await mm.init();
  registerIpc();
  createWindow();
});

app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
