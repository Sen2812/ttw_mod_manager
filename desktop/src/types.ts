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
}

export interface Preset { name: string; mods: Mod[]; version?: number; }

export interface GameInfo { id: string; name: string; }

export interface AppConfigResponse {
  currentGame: string; games: GameInfo[]; presets: Preset[];
  currentPresetName: string;
  folderPaths?: { gamePath?: string; contentFolder?: string; dataFolder?: string };
  subscribedWorkshopIds?: string[];
  categories?: string[];
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
      scanMods: () => Promise<{ mods: Mod[]; subscribedWorkshopIds: string[] }>;
      toggleMod: (n: string) => Promise<Mod[] | ApiResponse>;
      enableMod: (n: string) => Promise<Mod[] | ApiResponse>;
      disableMod: (n: string) => Promise<Mod[] | ApiResponse>;
      enableAll: () => Promise<Mod[] | ApiResponse>;
      disableAll: () => Promise<Mod[] | ApiResponse>;
      reorderMod: (n: string, i: number) => Promise<Mod[] | ApiResponse>;
      applyDragOrder: (ns: string[]) => Promise<Mod[] | ApiResponse>;
      resetLoadOrder: () => Promise<Mod[] | ApiResponse>;
      getConfig: () => Promise<AppConfigResponse>;
      setGame: (g: string) => Promise<{ mods?: Mod[]; presets?: Preset[]; game?: GameInfo; error?: string; subscribedWorkshopIds?: string[] }>;
      getPresets: () => Promise<Preset[]>;
      createPreset: (n: string, copyFromCurrent?: boolean) => Promise<Preset[] | ApiResponse>;
      applyPreset: (n: string) => Promise<Mod[] | ApiResponse>;
      deletePreset: (n: string) => Promise<Preset[] | ApiResponse>;
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
      launchGame: (mods?: Mod[]) => Promise<{ success?: boolean; error?: string; modsCount?: number; closeOnPlay?: boolean }>;
      saveUiState: (s: any) => Promise<{ ok: boolean }>;
      saveModState: (m: Mod[]) => Promise<{ ok: boolean }>;
      savePresets: (p: Preset[]) => Promise<{ ok: boolean }>;
      getDataDir: () => Promise<string>;
      selectDataDir: () => Promise<string | null>;
      setDataDir: (d: string) => Promise<{ ok: boolean; dataDir: string }>;
      setUnsavedChanges: (hasChanges: boolean) => Promise<{ ok: boolean }>;
      hasUnsavedChanges: () => Promise<boolean>;
      analyzeOverwrites: () => Promise<OverwriteAnalysis>;
      getCategories: () => Promise<string[]>;
      setModCategory: (modName: string, category: string | null) => Promise<{ mods: Mod[]; categories: string[] }>;
      addCustomCategory: (name: string) => Promise<string[]>;
      checkModUpdates: (force?: boolean) => Promise<{ mods: Mod[]; outdatedCount: number }>;
      forceUpdateMod: (modName: string) => Promise<{ ok: boolean; error?: string; mods: Mod[]; outdatedCount: number }>;
      forceUpdateAllOutdated: () => Promise<{ updated: number; failed: string[]; mods: Mod[]; outdatedCount: number }>;
      // External links / folders
      openUrl: (url: string) => Promise<{ ok: boolean; error?: string }>;
      openFolder: (targetPath: string) => Promise<{ ok: boolean; error?: string }>;
      // 关闭确认
      onConfirmClose: (callback: () => void) => void;
      closeDecision: (choice: "save" | "discard" | "cancel") => void;
      onSaveBeforeClose: (callback: () => void) => void;
      minimize?: () => void;
      maximize?: () => void;
      close?: () => void;
    };
  }
}
