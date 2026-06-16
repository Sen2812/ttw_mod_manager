/**
 * Core mod type definitions
 * These are the fundamental types that the mod manager operates on.
 */

export interface Mod {
  /** Human-readable display name (from Steam Workshop or mod metadata) */
  humanName: string;
  /** Internal pack file name, e.g. "my_mod.pack" */
  name: string;
  /** Absolute path to the .pack file on disk */
  path: string;
  /** Directory containing the mod */
  modDirectory: string;
  /** Path to thumbnail image (png/jpg) */
  imgPath: string;
  /** Steam Workshop ID, or filename if in data folder */
  workshopId: string;
  /** Whether this mod is currently enabled in the load order */
  isEnabled: boolean;
  /** Whether this mod resides in the game's data/ folder */
  isInData: boolean;
  /** Whether this mod resides in data/modding/ subfolder */
  isInModding?: boolean;
  /** Whether this is a symbolic link */
  isSymbolicLink?: boolean;
  /** Custom load order index (lower = loaded first). undefined = alphabetical default */
  loadOrder?: number;
  /** Timestamp of last local file modification */
  lastChangedLocal?: number;
  /** Timestamp of last Steam Workshop update */
  lastChanged?: number;
  /** Mod author name */
  author: string;
  /** Whether the Workshop item has been deleted */
  isDeleted: boolean;
  /** Whether this is a movie-type pack */
  isMovie: boolean;
  /** File size in bytes */
  size?: number;
  /** Workshop subscription timestamp */
  subbedTime?: number;
  /** Merged mods metadata (if this is a merged pack) */
  mergedModsData?: MergedModsData | null;
  /** Required mod IDs: [workshopId, humanName][] */
  reqModIdToName?: [string, string][];
  /** Required mod IDs (raw) */
  reqModIds?: string[];
  /** Pack dependency names */
  dependencyPacks?: string[];
  /** User-assigned categories */
  categories?: string[];
  /** Tags from Steam Workshop */
  tags: string[];
  /** Custom user-assigned tags */
  customTags?: string[];
}

export interface MergedModsData {
  mergedFrom: { name: string; path: string }[];
}

/** Mod data fetched from Steam Workshop API */
export interface ModData {
  workshopId: string;
  humanName: string;
  author: string;
  reqModIdToName: [string, string][];
  reqModIds: string[];
  lastChanged: number;
  subscriptionTime: number;
  isDeleted: boolean;
  tags: string[];
}

/** Preset - a saved configuration of mods */
export interface Preset {
  name: string;
  mods: Mod[];
  version?: number;
}

/** Mod with its load order for import/export */
export interface ModIdAndLoadOrder {
  workshopId: string;
  loadOrder?: number;
}
