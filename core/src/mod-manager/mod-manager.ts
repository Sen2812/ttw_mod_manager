/**
 * Mod Manager — Main orchestrator
 *
 * Ties together all subsystems into a usable mod manager.
 * This is the primary API surface for applications.
 */

import * as fs from "fs";
import * as path from "path";
import { GameDefinition, GameFolderPaths, Mod, Preset, SupportedGame } from "../types";
import { gameRegistry, BUILTIN_GAMES } from "../game-definitions";
import { ConfigManager, AppConfig, createDefaultConfig, ConfigIO } from "../config";
import { scanMods, enrichWorkshopNetwork, ensureModPrerequisites as ensureModPrerequisitesForMod, resolveGameFolderPaths, LogCallback, checkWorkshopUpdates, type ScanModsOptions } from "./mod-discovery";
import { fetchWorkshopTitlesForIds } from "./workshop-title-fetch";
import {
  countOutdatedMods,
  isModOutdated,
} from "./workshop-update-status";
import {
  sortByLoadOrder,
  getEnabledModsInLoadOrder,
  deduplicateDataContent,
  adjustDuplicateLoadOrders,
  compareModNames,
} from "./mod-sorting";
import {
  normalizeModTagFields,
} from "./category-utils";
import {
  createPreset,
  deletePreset as deletePresetFn,
  SelectOperation,
} from "./preset-manager";
import {
  exportProfileOrder,
  importProfileOrder,
  type ProfileOrderFile,
  type ImportProfileOrderResult,
} from "./preset-order";
import { isUsableWorkshopTitle } from "./mod-display";
import { importLocalPackFiles, deleteLocalModFiles, isLocalMod, type ImportLocalPacksResult, type DeleteLocalModResult } from "./local-pack-import";

// ─── Mod Manager Class ───────────────────────────────────────────────────────

function modHasLocalPack(mod: Mod): boolean {
  if (!mod.path) return false;
  try {
    return fs.existsSync(mod.path);
  } catch {
    return false;
  }
}

export interface ModManagerOptions {
  /** Path to config file directory (defaults to cwd) */
  configDir?: string;
  /** Logging callback */
  log?: LogCallback;
  /** Initial game to load (defaults to config's currentGame) */
  initialGame?: SupportedGame;
}

export class ModManager {
  /** Application configuration */
  config: AppConfig;
  /** Currently loaded mods */
  mods: Mod[] = [];
  /** Currently active game definition */
  currentGame: GameDefinition | undefined;
  /** Current folder paths for the active game */
  folderPaths: GameFolderPaths = { gamePath: undefined, contentFolder: undefined, dataFolder: undefined };
  /** Vanilla pack names for the active game */
  vanillaPacks: Set<string> = new Set();
  /** Workshop IDs with a content-folder entry (subscribed). */
  subscribedWorkshopIds: string[] = [];

  private configManager: ConfigManager;
  private configDir: string;
  private log: LogCallback;
  
  /** The name of the currently active preset */
  private activePresetName: string | null = null;
  /** The default preset (stores the initial state) */
  private defaultPreset: Preset | null = null;

  constructor(options: ModManagerOptions = {}) {
    this.log = options.log ?? console.log;
    this.configDir = options.configDir ?? process.cwd();

    // Register built-in games
    for (const game of BUILTIN_GAMES) {
      if (!gameRegistry.has(game.id)) {
        gameRegistry.register(game);
      }
    }

    this.configManager = this.createConfigManager(this.configDir);
    this.config = createDefaultConfig(options.initialGame ?? "wh3");
  }

  /** Build a ConfigManager backed by the given directory */
  private createConfigManager(dir: string): ConfigManager {
    const configPath = path.join(dir, "mod-manager-config.json");
    return new ConfigManager({
      read: async () => {
        try {
          return await fs.promises.readFile(configPath, "utf8");
        } catch {
          return null;
        }
      },
      write: async (data: string) => {
        // 直接写入文件，避免 rename 操作在 Windows 上的权限问题
        await fs.promises.writeFile(configPath, data, "utf8");
      },
    });
  }

  /**
   * Switch the on-disk config directory at runtime.
   * Flushes pending writes to the old dir, migrates the current in-memory
   * config to the new dir, then re-scans mods to restore state.
   */
  async setConfigDir(newDir: string): Promise<void> {
    // 1. 把旧目录的待写入落盘
    await this.configManager.flush();
    // 2. 切换到新目录，并把当前内存中的配置迁移过去（立即写入）
    this.configDir = newDir;
    this.configManager = this.createConfigManager(newDir);
    this.configManager.write(this.config);
    await this.configManager.flush();
    // 3. 重新扫描 mod，loadPresetsAndRestoreState 会从内存配置恢复启用状态
    await this.setGame(this.config.currentGame);
    this.log(`Config directory changed to: ${newDir}`);
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────────

  /** Initialize the mod manager: read config, detect game, scan mods */
  async init(): Promise<void> {
    this.log("Initializing mod manager...");

    // Read saved config
    this.config = await this.configManager.read(this.config.currentGame);
    this.log(`Config loaded. Current game: ${this.config.currentGame}`);

    // Resolve game
    await this.setGame(this.config.currentGame);
  }

  /** Save current config to disk (debounced) */
  async saveConfig(): Promise<void> {
    this.configManager.write(this.config);
  }

  /**
   * Force any pending debounced config write to disk immediately.
   * Call before app quit or data-dir switch to avoid data loss.
   */
  async flush(): Promise<void> {
    await this.configManager.flush();
  }

  // ─── Game Management ────────────────────────────────────────────────────

  /** Switch to a different game */
  async setGame(gameId: SupportedGame): Promise<void> {
    const gameDef = gameRegistry.get(gameId);
    if (!gameDef) {
      throw new Error(`Unknown game: ${gameId}`);
    }

    this.currentGame = gameDef;
    this.config.currentGame = gameId;
    this.log(`Switching to ${gameDef.displayName}...`);

    // Resolve folder paths
    this.folderPaths = await resolveGameFolderPaths(gameDef, this.log);

    // Scan mods (fast path: cache-only workshop data; network enrichment runs separately)
    await this.scanMods({ deferNetwork: true });
  }

  /** Re-scan mods from disk */
  async scanMods(options: ScanModsOptions = {}): Promise<Mod[]> {
    if (!this.currentGame) throw new Error("No game selected");

    const pendingToPreserve = options.skipSteamSubscriptionFetch
      ? this.mods.filter(m => m.pendingDownload && m.workshopId && !m.isInData)
      : [];
    const preserveWorkshopMods = [
      ...(options.preserveWorkshopMods ?? []),
      ...pendingToPreserve,
    ];

    const result = await scanMods(
      this.currentGame,
      this.folderPaths,
      this.configDir,
      this.log,
      {
        ...options,
        cachedSubscribedWorkshopIds: options.skipSteamSubscriptionFetch
          ? (options.cachedSubscribedWorkshopIds ?? this.subscribedWorkshopIds)
          : options.cachedSubscribedWorkshopIds,
      },
    );
    this.mods = result.mods;
    this.vanillaPacks = result.vanillaPacks;
    if (!options.skipSteamSubscriptionFetch) {
      this.subscribedWorkshopIds = result.subscribedWorkshopIds;
    }

    // Create default preset from initial scan
    this.defaultPreset = {
      name: "Default",
      mods: this.mods.map(m => ({ ...m, isEnabled: false })),  // All disabled by default
      version: 2,
    };

    // Load saved presets and restore state
    this.loadPresetsAndRestoreState();

    // Sort by load order
    this.mods = sortByLoadOrder(this.mods);

    for (const mod of this.mods) normalizeModTagFields(mod);

    this.log(`Loaded ${this.mods.length} mods (${this.mods.filter((m) => m.isEnabled).length} enabled)`);
    return this.mods;
  }

  /** Fetch deferred workshop metadata, prerequisites, and update timestamps. */
  async enrichWorkshopNetwork(): Promise<void> {
    if (!this.currentGame) return;
    await enrichWorkshopNetwork(
      this.mods,
      this.currentGame,
      this.configDir,
      this.subscribedWorkshopIds,
      this.log,
    );
    this.mods = sortByLoadOrder(this.mods);
    for (const mod of this.mods) normalizeModTagFields(mod);
  }

  /** Fetch workshop HTML titles for specific item IDs (on-demand, concurrent). */
  async fetchWorkshopTitles(workshopIds: string[]): Promise<number> {
    if (!this.configDir || workshopIds.length === 0) return 0;
    const applied = await fetchWorkshopTitlesForIds(
      this.mods,
      workshopIds,
      this.configDir,
      this.log,
    );
    if (applied > 0) {
      this.mods = sortByLoadOrder(this.mods);
    }
    return applied;
  }

  /** Load presets and restore the current preset state */
  private loadPresetsAndRestoreState(): void {
    const presets = this.config.gamePresets[this.config.currentGame] || [];

    // 优先从持久化的 gameDefaultPresets 恢复 Default 预设。
    // 这样 Default 的启用状态能在应用重启、切换 profile 后仍然保留。
    const savedDefault = this.config.gameDefaultPresets?.[this.config.currentGame];
    if (savedDefault && this.defaultPreset) {
      this.defaultPreset = {
        name: "Default",
        mods: savedDefault.mods.map((m) => ({ ...m })),
        version: 2,
      };
    }

    // If there's a saved current preset, restore it (skip if preset was deleted)
    const savedCurrentPreset = this.config.gameCurrentPreset[this.config.currentGame];
    if (savedCurrentPreset) {
      const presetName = savedCurrentPreset.name;
      const presetExists = presetName === "Default"
        || presets.some((p) => p.name === presetName);
      if (presetExists) {
        this.applyPresetToMods(savedCurrentPreset);
        this.activePresetName = presetName;
      } else {
        this.activePresetName = "Default";
      }
    } else {
      // Otherwise, use default (all mods disabled)
      this.activePresetName = "Default";
    }

    // Apply always-enabled mods
    const alwaysEnabledNames = new Set(this.config.alwaysEnabledMods.map((m) => m.name));
    for (const mod of this.mods) {
      if (alwaysEnabledNames.has(mod.name)) {
        mod.isEnabled = true;
      }
    }
  }

  /** Apply a preset's state to the current mods */
  private applyPresetToMods(preset: Preset): void {
    const presetByName = new Map(preset.mods.map((m) => [m.name, m]));
    const presetByWorkshopId = new Map(
      preset.mods
        .filter((m) => m.workshopId && /^\d{5,15}$/.test(m.workshopId))
        .map((m) => [m.workshopId, m]),
    );

    for (const mod of this.mods) {
      const presetMod = presetByName.get(mod.name)
        ?? (mod.workshopId ? presetByWorkshopId.get(mod.workshopId) : undefined);
      if (presetMod) {
        mod.isEnabled = presetMod.isEnabled;
        mod.loadOrder = presetMod.loadOrder;
        if (presetMod.humanName && isUsableWorkshopTitle(presetMod.humanName, mod.workshopId)) {
          mod.humanName = presetMod.humanName;
        }
        if (presetMod.author) mod.author = presetMod.author;
      } else {
        // Mod not in preset, disable it
        mod.isEnabled = false;
        mod.loadOrder = undefined;
      }
    }
  }

  // ─── Preset Management ──────────────────────────────────────────────────

  /** Set the active preset name */
  setActivePresetName(name: string | null): void {
    this.activePresetName = name || "Default";
    this.log(`Active preset set to: ${this.activePresetName}`);
  }

  /** Get the active preset name */
  getActivePresetName(): string {
    return this.activePresetName || "Default";
  }

  /** Get all presets (including a virtual "Default" preset) */
  getPresets(): Preset[] {
    const savedPresets = this.config.gamePresets[this.config.currentGame] || [];
    // Return default + saved presets
    return [
      { name: "Default", mods: (this.defaultPreset?.mods || []).map((m) => ({ ...m })), version: 2 },
      ...savedPresets,
    ];
  }

  /** Get only user-created presets (excluding Default) */
  getUserPresets(): Preset[] {
    return this.config.gamePresets[this.config.currentGame] || [];
  }

  /** Create a new preset from current state */
  createPreset(name: string, copyFromCurrent: boolean = true): Preset {
    // Check for duplicate name
    if (name === "Default") {
      throw new Error("'Default' is a reserved name");
    }
    
    const existingPresets = this.config.gamePresets[this.config.currentGame] || [];
    if (existingPresets.some(p => p.name === name)) {
      throw new Error(`Profile "${name}" already exists`);
    }

    // Create preset from current mods or empty
    const modsToUse = copyFromCurrent ? this.mods : [];
    const preset = createPreset(name, modsToUse);

    if (!this.config.gamePresets[this.config.currentGame]) {
      this.config.gamePresets[this.config.currentGame] = [];
    }
    this.config.gamePresets[this.config.currentGame].push(preset);
    this.saveConfig();
    this.log(`Created preset: ${name} (copyFromCurrent: ${copyFromCurrent})`);
    return preset;
  }

  /** Apply a preset */
  applyPreset(name: string, operation: SelectOperation = "unary"): void {
    if (name === "Default") {
      // Apply default preset (all mods disabled, except always-enabled)
      this.applyPresetToMods(this.defaultPreset!);
      const alwaysEnabledNames = new Set(this.config.alwaysEnabledMods.map((m) => m.name));
      for (const mod of this.mods) {
        if (alwaysEnabledNames.has(mod.name)) {
          mod.isEnabled = true;
        }
      }
    } else {
      const presets = this.getUserPresets();
      const preset = presets.find((p) => p.name === name);
      if (!preset) throw new Error(`Preset not found: ${name}`);

      this.applyPresetToMods(preset);
      
      // Apply always-enabled mods
      const alwaysEnabledNames = new Set(this.config.alwaysEnabledMods.map((m) => m.name));
      for (const mod of this.mods) {
        if (alwaysEnabledNames.has(mod.name)) {
          mod.isEnabled = true;
        }
      }
    }

    this.activePresetName = name;
    this.syncSessionPreset();
    this.log(`Applied preset: ${name} (${operation})`);
  }

  /** Delete a preset */
  deletePreset(name: string): void {
    if (name === "Default") {
      throw new Error("Cannot delete the Default profile");
    }
    
    this.config.gamePresets[this.config.currentGame] = deletePresetFn(
      this.getUserPresets(),
      name,
    );
    
    // If we deleted the active preset, switch to Default and persist state
    if (this.activePresetName === name) {
      this.applyPreset("Default");
      return;
    }

    const savedCurrent = this.config.gameCurrentPreset[this.config.currentGame];
    if (savedCurrent?.name === name) {
      this.applyPreset("Default");
      return;
    }
    
    this.saveConfig();
    this.log(`Deleted preset: ${name}`);
  }

  /** Rename a preset */
  renamePreset(oldName: string, newName: string): void {
    if (oldName === "Default") {
      throw new Error("Cannot rename the Default profile");
    }
    const trimmed = newName.trim();
    if (!trimmed) {
      throw new Error("Profile name cannot be empty");
    }
    if (trimmed === "Default") {
      throw new Error("'Default' is a reserved name");
    }
    const presets = this.getUserPresets();
    const preset = presets.find((p) => p.name === oldName);
    if (!preset) {
      throw new Error(`Preset not found: ${oldName}`);
    }
    if (presets.some((p) => p.name === trimmed)) {
      throw new Error(`Profile "${trimmed}" already exists`);
    }
    preset.name = trimmed;

    // 如果重命名的是当前激活的 preset，同步更新激活名与 gameCurrentPreset
    if (this.activePresetName === oldName) {
      this.activePresetName = trimmed;
      const currentPreset = this.config.gameCurrentPreset[this.config.currentGame];
      if (currentPreset) {
        currentPreset.name = trimmed;
      }
    }

    this.saveConfig();
    this.log(`Renamed preset: ${oldName} -> ${trimmed}`);
  }

  /** Update a preset with current state */
  replacePreset(name: string): void {
    if (name === "Default") {
      // Update default preset (memory + persisted)
      this.defaultPreset = {
        name: "Default",
        mods: this.mods.map((m) => ({ ...m })),
        version: 2,
      };
      this.config.gameDefaultPresets[this.config.currentGame] = {
        name: "Default",
        mods: this.mods.map((m) => ({ ...m })),
        version: 2,
      };
    } else {
      this.config.gamePresets[this.config.currentGame] = this.getUserPresets().map((p) => {
        if (p.name === name) {
          return {
            ...p,
            mods: this.mods.map((m) => ({ ...m })),
            version: 2,
          };
        }
        return p;
      });
    }
    
    this.saveConfig();
    this.log(`Updated preset: ${name}`);
  }

  // ─── Mod Operations ─────────────────────────────────────────────────────

  /** Get all mods */
  getMods(): Mod[] {
    return this.mods;
  }

  /** Get enabled mods in UI load-order (top → bottom). */
  getEnabledMods(): Mod[] {
    return getEnabledModsInLoadOrder(this.mods);
  }

  /** Fetch workshop prerequisites for one mod and merge into the mod list. */
  async ensureModPrerequisites(modName: string): Promise<void> {
    if (!this.currentGame) return;
    await ensureModPrerequisitesForMod(
      this.mods,
      modName,
      this.currentGame,
      this.configDir,
      this.subscribedWorkshopIds,
      this.log,
    );
  }

  /** Toggle a mod's enabled state */
  toggleMod(modName: string): boolean {
    const mod = this.mods.find((m) => m.name === modName);
    if (!mod) return false;
    if (mod.pendingDownload && !mod.isEnabled && !modHasLocalPack(mod)) return false;
    mod.isEnabled = !mod.isEnabled;
    return mod.isEnabled;
  }

  /** Enable a specific mod with dependency checking */
  enableMod(modName: string): void {
    const mod = this.mods.find((m) => m.name === modName);
    if (!mod) return;
    if (mod.pendingDownload && !modHasLocalPack(mod)) return;
    // Check dependencies
    const missingDeps = this.checkDependencies(mod);
    if (missingDeps.length > 0) {
      this.log(`Warning: ${modName} has missing dependencies: ${missingDeps.join(', ')}`);
    }
    
    mod.isEnabled = true;
    const maxOrder = this.mods
      .filter((m) => m.isEnabled && m.name !== modName)
      .reduce((max, m) => Math.max(max, m.loadOrder ?? -1), -1);
    mod.loadOrder = maxOrder + 1;
  }
  
  /** Check if all dependencies for a mod are available */
  private checkDependencies(mod: Mod): string[] {
    const missing: string[] = [];
    if (!mod.dependencyPacks || mod.dependencyPacks.length === 0) return missing;
    
    const availablePacks = new Set(this.mods.map(m => m.name));
    
    for (const dep of mod.dependencyPacks) {
      if (!availablePacks.has(dep)) {
        missing.push(dep);
      }
    }
    
    return missing;
  }

  /** Disable a specific mod */
  disableMod(modName: string): void {
    const mod = this.mods.find((m) => m.name === modName);
    if (mod) {
      mod.isEnabled = false;
    }
  }

  /** Enable all mods (skips mods still pending download without a local pack). */
  enableAll(): string[] {
    const skipped: string[] = [];
    for (const mod of this.mods) {
      if (mod.pendingDownload && !modHasLocalPack(mod)) {
        skipped.push(mod.name);
        continue;
      }
      mod.isEnabled = true;
    }
    return skipped;
  }

  /** Disable all mods (except always-enabled) */
  disableAll(): void {
    const alwaysEnabled = new Set(this.config.alwaysEnabledMods.map((m) => m.name));
    for (const mod of this.mods) {
      mod.isEnabled = alwaysEnabled.has(mod.name);
    }
  }

  /** Set a mod's load order */
  setModLoadOrder(modName: string, loadOrder: number): void {
    const mod = this.mods.find((m) => m.name === modName);
    if (!mod) return;
    mod.loadOrder = loadOrder;
    adjustDuplicateLoadOrders(this.mods, mod);
    this.mods = sortByLoadOrder(this.mods);
  }

  // ─── Workshop Updates ───────────────────────────────────────────────────

  /** Refresh workshop version timestamps and return mods with outdated count. */
  async checkModUpdates(force = false): Promise<{ mods: Mod[]; outdatedCount: number }> {
    if (!this.currentGame) throw new Error("No game selected");
    await checkWorkshopUpdates(this.mods, this.configDir, this.log, force);
    return { mods: this.mods, outdatedCount: countOutdatedMods(this.mods) };
  }

  /** Queue a Steam workshop re-download without removing local files. */
  async forceUpdateMod(modName: string): Promise<{ ok: boolean; error?: string; workshopId?: string }> {
    const mod = this.mods.find((m) => m.name === modName);
    if (!mod || mod.isInData || !mod.workshopId) {
      return { ok: false, error: "NOT_WORKSHOP_MOD" };
    }
    if (!this.folderPaths.contentFolder) {
      return { ok: false, error: "NO_CONTENT_FOLDER" };
    }
    return { ok: true, workshopId: mod.workshopId };
  }

  /** Validate every outdated workshop mod for force-update (Steam trigger is handled by the host app). */
  async forceUpdateAllOutdated(): Promise<{ updated: number; failed: string[]; mods: Mod[] }> {
    const outdated = this.mods.filter((m) => isModOutdated(m));
    const failed: string[] = [];
    let updated = 0;

    for (const mod of outdated) {
      const result = await this.forceUpdateMod(mod.name);
      if (result.ok) updated++;
      else failed.push(mod.name);
    }

    return { updated, failed, mods: this.mods };
  }

  /** Sync renderer mod state into memory (does not persist). */
  syncModsFromClient(mods: Pick<Mod, "name" | "isEnabled" | "loadOrder">[]): void {
    const map = new Map(this.mods.map(m => [m.name, m]));
    for (const m of mods) {
      const cm = map.get(m.name);
      if (!cm) continue;
      cm.isEnabled = m.isEnabled;
      cm.loadOrder = m.loadOrder;
    }
    this.mods = sortByLoadOrder(this.mods);
  }

  /** Export current load order as JSON-serializable data. */
  buildProfileOrderExport(profileName?: string): ProfileOrderFile {
    return exportProfileOrder(
      this.mods,
      this.config.currentGame,
      profileName ?? this.getActivePresetName(),
    );
  }

  /** Copy local .pack files into data/modding/ for mod management. */
  importLocalPacks(sourcePaths: string[]): ImportLocalPacksResult {
    if (!this.folderPaths.gamePath) {
      throw new Error("NO_GAME_PATH");
    }
    const moddingFolder = path.join(this.folderPaths.gamePath, "data", "modding");
    const dataFolder = this.folderPaths.dataFolder ?? path.join(this.folderPaths.gamePath, "data");
    return importLocalPackFiles({
      sourcePaths,
      moddingFolder,
      dataFolder,
      vanillaPacks: this.vanillaPacks,
      log: this.log,
    });
  }

  /** Delete a local mod from disk and remove it from the current profile. */
  deleteLocalMod(modName: string): DeleteLocalModResult {
    if (!this.folderPaths.gamePath) {
      return { ok: false, error: "NO_GAME_PATH" };
    }

    const mod = this.mods.find((m) => m.name === modName);
    if (!mod) {
      return { ok: false, error: "NOT_FOUND" };
    }
    if (!isLocalMod(mod)) {
      return { ok: false, error: "NOT_LOCAL_MOD" };
    }
    if (this.vanillaPacks.has(mod.name)) {
      return { ok: false, error: "VANILLA_PACK" };
    }

    const moddingFolder = path.join(this.folderPaths.gamePath, "data", "modding");
    const dataFolder = this.folderPaths.dataFolder ?? path.join(this.folderPaths.gamePath, "data");

    try {
      deleteLocalModFiles({ mod, moddingFolder, dataFolder, log: this.log });
    } catch (e) {
      return {
        ok: false,
        error: "DELETE_FAILED",
        message: e instanceof Error ? e.message : String(e),
      };
    }

    this.mods = this.mods.filter((m) => m.name !== modName);
    this.saveCurrentPreset();
    return { ok: true };
  }

  /** Import load order; skips mods not installed locally. */
  applyProfileOrderImport(file: ProfileOrderFile): ImportProfileOrderResult {
    const result = importProfileOrder(this.mods, file);
    this.mods = sortByLoadOrder(this.mods);
    return result;
  }

  // ─── Internal Helpers ───────────────────────────────────────────────────

  /** Persist which preset is active and its session snapshot (load-only switch). */
  private syncSessionPreset(): void {
    this.config.gameCurrentPreset[this.config.currentGame] = {
      name: this.activePresetName || "Default",
      mods: this.mods.map((m) => ({ ...m })),
      version: 2,
    };
    this.saveConfig().catch(err => this.log(`Failed to save config: ${err}`));
  }

  /** Save the current mod state to the active preset */
  saveCurrentPreset(): void {
    // Always save current state to gameCurrentPreset
    this.config.gameCurrentPreset[this.config.currentGame] = {
      name: this.activePresetName || "Default",
      mods: this.mods.map((m) => ({ ...m })),
      version: 2,
    };

    // If active preset is a user preset, also update it
    if (this.activePresetName && this.activePresetName !== "Default") {
      const presets = this.config.gamePresets[this.config.currentGame] || [];
      const presetIndex = presets.findIndex(p => p.name === this.activePresetName);
      if (presetIndex !== -1) {
        presets[presetIndex] = {
          ...presets[presetIndex],
          mods: this.mods.map((m) => ({ ...m })),
          version: 2,
        };
      }
    }
    // If active preset is Default, update defaultPreset AND persist it
    else if (this.activePresetName === "Default" || !this.activePresetName) {
      this.defaultPreset = {
        name: "Default",
        mods: this.mods.map((m) => ({ ...m })),
        version: 2,
      };
      // 持久化 Default，使其在切换到其他 profile / 重启后仍能恢复
      this.config.gameDefaultPresets[this.config.currentGame] = {
        name: "Default",
        mods: this.mods.map((m) => ({ ...m })),
        version: 2,
      };
    }

    // Fire and forget - don't block on save
    this.saveConfig().catch(err => this.log(`Failed to save config: ${err}`));
  }
}
