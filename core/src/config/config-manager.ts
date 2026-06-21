/**
 * Configuration Manager
 *
 * Manages persistent application configuration.
 * Stores mod presets, user preferences, and folder paths.
 *
 * The config is a JSON file that is read on startup and
 * written (debounced) whenever state changes.
 */

import { GameFolderPaths, GamePresetsMap, Mod, Preset, SupportedGame } from "../types";

// ─── Config Schema ────────────────────────────────────────────────────────────

/** User preferences that persist across sessions */
export interface UserPreferences {
  areThumbnailsEnabled: boolean;
  isClosedOnPlay: boolean;
  isAuthorEnabled: boolean;
  isCompatCheckingVanillaPacks: boolean;
  isMakeUnitsGeneralsEnabled: boolean;
  isSkipIntroMoviesEnabled: boolean;
  isScriptLoggingEnabled: boolean;
  isAutoStartCustomBattleEnabled: boolean;
  isChangingGameProcessPriority: boolean;
  isFeaturesForModdersEnabled: boolean;
  moddersPrefix: string;
  modRowsSortingType: string;
  currentLanguage?: string;
  wasOnboardingEverRun: boolean;
}

/** The complete app configuration that gets persisted */
export interface AppConfig {
  /** Current active game */
  currentGame: SupportedGame;
  /** User preferences */
  preferences: UserPreferences;
  /** Per-game folder paths */
  gameFolderPaths: Record<SupportedGame, GameFolderPaths>;
  /** Per-game presets */
  gamePresets: Record<SupportedGame, Preset[]>;
  /** Per-game current preset */
  gameCurrentPreset: Record<SupportedGame, Preset | undefined>;
  /** Per-game saved Default preset state (so Default survives app restart) */
  gameDefaultPresets: Record<SupportedGame, Preset | undefined>;
  /** Mods that should always be enabled */
  alwaysEnabledMods: { name: string }[];
  /** Mods hidden from the list */
  hiddenMods: { name: string }[];
  /** User-assigned categories */
  categories: string[];
  /** Category colors */
  categoryColors: Record<string, string>;
  /** Custom pack data overwrites */
  packDataOverwrites: Record<string, any[]>;
  /** User flow option overrides */
  userFlowOptions: Record<string, Record<string, any>>;
}

/** Partial config for updates */
export type AppConfigUpdate = Partial<AppConfig>;

// ─── Default Config ───────────────────────────────────────────────────────────

export function createDefaultConfig(currentGame: SupportedGame = "wh3"): AppConfig {
  return {
    currentGame,
    preferences: {
      areThumbnailsEnabled: true,
      isClosedOnPlay: false,
      isAuthorEnabled: true,
      isCompatCheckingVanillaPacks: false,
      isMakeUnitsGeneralsEnabled: false,
      isSkipIntroMoviesEnabled: false,
      isScriptLoggingEnabled: false,
      isAutoStartCustomBattleEnabled: false,
      isChangingGameProcessPriority: false,
      isFeaturesForModdersEnabled: false,
      moddersPrefix: "",
      modRowsSortingType: "ordered",
      wasOnboardingEverRun: false,
    },
    gameFolderPaths: {} as Record<SupportedGame, GameFolderPaths>,
    gamePresets: {} as Record<SupportedGame, Preset[]>,
    gameCurrentPreset: {} as Record<SupportedGame, Preset | undefined>,
    gameDefaultPresets: {} as Record<SupportedGame, Preset | undefined>,
    alwaysEnabledMods: [],
    hiddenMods: [],
    categories: [],
    categoryColors: {},
    packDataOverwrites: {},
    userFlowOptions: {},
  };
}

// ─── Config Serialization Helpers ─────────────────────────────────────────────

/** Strip runtime-only data from mods before saving */
export function sanitizeModsForSave(mods: Mod[]): Mod[] {
  return mods.map((m) => ({
    ...m,
    lastChanged: undefined,
    lastChangedLocal: undefined,
    reqModIdToName: [],
    isDeleted: false,
    isMovie: false,
    dependencyPacks: [],
    tags: [],
  }));
}

/** Prepare config for serialization */
export function prepareConfigForSave(config: AppConfig): AppConfig {
  const toSave = { ...config };

  // Sanitize mods in presets
  for (const game of Object.keys(toSave.gamePresets) as SupportedGame[]) {
    toSave.gamePresets[game] = (toSave.gamePresets[game] ?? []).map((preset) => ({
      ...preset,
      mods: sanitizeModsForSave(preset.mods),
    }));

    if (toSave.gameCurrentPreset[game]) {
      toSave.gameCurrentPreset[game] = {
        ...toSave.gameCurrentPreset[game]!,
        mods: sanitizeModsForSave(toSave.gameCurrentPreset[game]!.mods),
      };
    }

    if (toSave.gameDefaultPresets?.[game]) {
      toSave.gameDefaultPresets[game] = {
        ...toSave.gameDefaultPresets[game]!,
        mods: sanitizeModsForSave(toSave.gameDefaultPresets[game]!.mods),
      };
    }
  }

  return toSave;
}

// ─── Config I/O Interface ─────────────────────────────────────────────────────

/**
 * Interface for config persistence.
 * Implement this to provide platform-specific file I/O.
 */
export interface ConfigIO {
  /** Read the config file, returns null if it doesn't exist */
  read(): Promise<string | null>;
  /** Write the config file atomically */
  write(data: string): Promise<void>;
}

/**
 * Config manager that coordinates reading/writing configuration.
 */
export class ConfigManager {
  private io: ConfigIO;
  private cache: AppConfig | null = null;
  private writeTimeout: ReturnType<typeof setTimeout> | null = null;
  private isWriting = false;
  private pendingWrite: AppConfig | null = null;

  constructor(io: ConfigIO) {
    this.io = io;
  }

  /** Read config from disk, or return default if not found */
  async read(currentGame?: SupportedGame): Promise<AppConfig> {
    try {
      const raw = await this.io.read();
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<AppConfig>;
        this.cache = { ...createDefaultConfig(currentGame), ...parsed };
        return this.cache;
      }
    } catch (e) {
      console.error("Failed to read config:", e);
    }

    this.cache = createDefaultConfig(currentGame);
    return this.cache;
  }

  /** Write config to disk (debounced) */
  write(config: AppConfig, debounceMs = 300): void {
    this.pendingWrite = config;

    if (this.writeTimeout) {
      this.writeTimeout.refresh();
    } else {
      this.writeTimeout = setTimeout(async () => {
        await this.performWrite();
      }, debounceMs);
    }
  }

  /**
   * Immediately write any pending debounced config to disk.
   * Use this before quitting / switching data dir to guarantee persistence.
   */
  async flush(): Promise<void> {
    if (this.writeTimeout) {
      clearTimeout(this.writeTimeout);
      this.writeTimeout = null;
    }
    await this.performWrite();
  }

  /** Perform the actual write of pendingWrite, guarding against re-entrancy */
  private async performWrite(): Promise<void> {
    while (this.pendingWrite) {
      if (this.isWriting) {
        await new Promise<void>((resolve) => {
          const wait = () => {
            if (!this.isWriting) resolve();
            else setTimeout(wait, 10);
          };
          wait();
        });
        continue;
      }

      this.isWriting = true;
      const snapshot = this.pendingWrite;
      try {
        const toSave = prepareConfigForSave(snapshot);
        await this.io.write(JSON.stringify(toSave));
      } catch (e) {
        console.error("Failed to write config:", e);
        break;
      } finally {
        if (this.pendingWrite === snapshot) {
          this.pendingWrite = null;
        }
        this.isWriting = false;
      }
    }
  }

  /** Get the cached config (if read was called) */
  getCached(): AppConfig | null {
    return this.cache;
  }
}
