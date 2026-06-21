export interface Mod {
  name: string; humanName: string; path: string; workshopId: string;
  isEnabled: boolean; loadOrder?: number; author: string; imgPath: string;
  isInData: boolean; tags: string[]; categories?: string[];
  dependencyPacks?: string[];
  modDirectory: string;
  isDeleted: boolean;
  isMovie: boolean;
  size?: number;
  subbedTime?: number;
  lastChangedLocal?: number;
  lastChanged?: number;
  isInModding?: boolean;
  isSymbolicLink?: boolean;
  mergedModsData?: { mergedFrom: { name: string; path: string }[] } | null;
  reqModIdToName?: [string, string][];
  reqModIds?: string[];
  customTags?: string[];
  /** Subscribed but local .pack not present (re-downloading). */
  pendingDownload?: boolean;
  downloadBytesCurrent?: number;
  downloadBytesTotal?: number;
}

export interface Preset { name: string; mods: Mod[]; version?: number; }

export interface GameInfo { id: string; name: string; }

export interface AppConfigResponse {
  currentGame: string; games: GameInfo[]; presets: Preset[];
  currentPresetName: string;
  folderPaths?: { gamePath?: string; contentFolder?: string; dataFolder?: string };
  subscribedWorkshopIds?: string[];
  categories?: string[];
  dataDir?: string;
  preferences?: { isClosedOnPlay: boolean };
}

export interface BootstrapResponse extends AppConfigResponse {
  mods: Mod[];
  profileFilterModes?: Record<string, string>;
  modFilterMode?: string;
}

export interface ModsUpdatedPayload {
  mods: Mod[];
  subscribedWorkshopIds: string[];
  categories: string[];
  outdatedCount: number;
}

export interface ApiResponse<T = any> {
  data?: T;
  error?: string;
}

// ─── 覆盖/冲突分析 ──

export interface ConflictParticipant {
  modName: string;
  loadOrder: number;
  size: number;
}

export interface FileConflict {
  fileName: string;
  category: "db" | "script" | "ui" | "loc" | "other";
  participants: ConflictParticipant[];
  winner: string;
  losers: string[];
}

export interface ModRelation {
  modName: string;
  fileCount: number;
}

export interface ModConflictStats {
  wins: number;
  losses: number;
  total: number;
  overwrites: ModRelation[];
  overwrittenBy: ModRelation[];
}

export interface OverwriteAnalysis {
  conflicts: FileConflict[];
  modStats: Record<string, ModConflictStats>;
  modsWithConflicts: number;
  totalConflicts: number;
}

declare global {
  interface Window {
    api: {
      getMods: () => Promise<Mod[]>;
      bootstrap: () => Promise<BootstrapResponse>;
      scanMods: () => Promise<{ mods: Mod[]; subscribedWorkshopIds: string[] }>;
      importLocalPacks: () => Promise<{
        ok: boolean;
        cancelled?: boolean;
        error?: string;
        imported?: string[];
        skipped?: { path: string; reason: string }[];
        failed?: { path: string; error: string }[];
        mods?: Mod[];
      }>;
      toggleMod: (n: string) => Promise<Mod[] | ApiResponse>;
      enableMod: (n: string) => Promise<Mod[] | ApiResponse>;
      disableMod: (n: string) => Promise<Mod[] | ApiResponse>;
      enableAll: () => Promise<{ mods: Mod[]; skipped?: string[] } | Mod[]>;
      disableAll: () => Promise<Mod[] | ApiResponse>;
      reorderMod: (n: string, i: number) => Promise<Mod[] | ApiResponse>;
      applyDragOrder: (ns: string[]) => Promise<Mod[] | ApiResponse>;
      getConfig: () => Promise<AppConfigResponse>;
      getSteamStatus: () => Promise<{
        installed: boolean;
        running: boolean;
        ipcAvailable: boolean;
        state: "not_installed" | "not_running" | "offline" | "online";
      }>;
      setGame: (g: string) => Promise<{ mods?: Mod[]; presets?: Preset[]; folderPaths?: AppConfigResponse["folderPaths"]; game?: GameInfo; error?: string; subscribedWorkshopIds?: string[] }>;
      getPresets: () => Promise<Preset[]>;
      createPreset: (n: string, copyFromCurrent?: boolean) => Promise<Preset[] | ApiResponse>;
      applyPreset: (n: string) => Promise<Mod[] | ApiResponse>;
      deletePreset: (n: string) => Promise<Preset[] | ApiResponse | {
        presets: Preset[];
        mods: Mod[];
        activePresetName: string;
        error?: string;
      }>;
      renamePreset: (oldName: string, newName: string) => Promise<{ presets: Preset[]; activePresetName: string } | ApiResponse>;
      updatePreset: (n: string) => Promise<Preset[] | ApiResponse>;
      setActivePresetName: (n: string | null) => Promise<{ ok: boolean }>;
      exportProfileOrder: (profileName: string, mods?: Mod[]) => Promise<{ ok: boolean; path?: string; error?: string }>;
      importProfileOrder: (mods?: Mod[]) => Promise<{
        ok: boolean;
        mods?: Mod[];
        applied?: number;
        skipped?: number;
        skippedNames?: string[];
        error?: string;
      }>;
      launchGame: (mods?: Mod[]) => Promise<{
        success?: boolean;
        error?: string;
        errorCode?: "GAME_ALREADY_RUNNING" | "LAUNCH_IN_PROGRESS" | string;
        modsCount?: number;
        copyFailures?: string[];
        closeOnPlay?: boolean;
      }>;
      getPreferences: () => Promise<{ isClosedOnPlay: boolean }>;
      setPreferences: (patch: { isClosedOnPlay?: boolean }) => Promise<{
        ok: boolean;
        preferences: { isClosedOnPlay: boolean };
      }>;
      saveUiState: (s: any) => Promise<{ ok: boolean }>;
      saveModState: (m: Mod[]) => Promise<{ ok: boolean }>;
      savePresets: (p: Preset[]) => Promise<{ ok: boolean }>;
      getDataDir: () => Promise<string>;
      selectDataDir: () => Promise<string | null>;
      setDataDir: (d: string) => Promise<{ ok: boolean; dataDir: string } & Partial<BootstrapResponse>>;
      setUnsavedChanges: (hasChanges: boolean) => Promise<{ ok: boolean }>;
      hasUnsavedChanges: () => Promise<boolean>;
      analyzeOverwrites: () => Promise<OverwriteAnalysis>;
      getCategories: () => Promise<string[]>;
      setModCategory: (modName: string, category: string | null) => Promise<{ mods: Mod[]; categories: string[] }>;
      addCustomCategory: (name: string) => Promise<string[]>;
      checkModUpdates: (force?: boolean) => Promise<{ mods: Mod[]; outdatedCount: number }>;
      forceUpdateMod: (modName: string) => Promise<{
        ok: boolean;
        error?: string;
        errorCode?: string;
        downloadTriggered?: boolean;
        mods: Mod[];
        outdatedCount: number;
      }>;
      triggerWorkshopDownload: (workshopId: string) => Promise<{
        ok: boolean;
        error?: string;
        errorCode?: string;
        inProgress?: boolean;
        mods: Mod[];
        subscribedWorkshopIds?: string[];
      }>;
      forceUpdateAllOutdated: () => Promise<{ updated: number; failed: string[]; mods: Mod[]; outdatedCount: number }>;
      // External links / folders
      openUrl: (url: string) => Promise<{ ok: boolean; error?: string }>;
      openFolder: (targetPath: string) => Promise<{ ok: boolean; error?: string }>;
      // 关闭确认
      onConfirmClose: (callback: () => void) => (() => void) | void;
      closeDecision: (choice: "save" | "discard" | "cancel") => void;
      onModsUpdated: (callback: (payload: ModsUpdatedPayload) => void) => (() => void) | void;
      onPrerequisitesCheckStarted?: (callback: (modName: string) => void) => (() => void) | void;
      onPrerequisitesCheckDone?: (callback: (modName: string) => void) => (() => void) | void;
      minimize?: () => void;
      maximize?: () => void;
      close?: () => void;
    };
  }
}
