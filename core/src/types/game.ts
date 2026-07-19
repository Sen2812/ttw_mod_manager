/**
 * Game definition types
 * Describes how to interact with a specific Total War game.
 */

/** All supported Total War game identifiers */
export const SUPPORTED_GAMES = [
  "wh3",
  "wh2",
  "threeKingdoms",
  "attila",
  "troy",
  "pharaoh",
  "dynasties",
  "rome2",
  "shogun2",
] as const;

export type SupportedGame = (typeof SUPPORTED_GAMES)[number];

/** Folder paths for a specific game installation */
export interface GameFolderPaths {
  /** Game installation root, e.g. "K:\SteamLibrary\common\Total War WARHAMMER III" */
  gamePath: string | undefined;
  /** Workshop content folder, e.g. "K:\SteamLibrary\steamapps\workshop\content\1142710" */
  contentFolder: string | undefined;
  /** Game data folder, usually gamePath + "/data" */
  dataFolder: string | undefined;
}

/**
 * A complete game definition — the contract between the mod manager core
 * and any specific Total War game.
 *
 * Implement this interface to add support for a new game.
 */
export interface GameDefinition {
  /** Internal game identifier */
  readonly id: SupportedGame;
  /** Display name shown in the UI */
  readonly displayName: string;
  /** Steam App ID */
  readonly steamId: string;
  /** Process executable name, e.g. "Warhammer3.exe" */
  readonly processName: string;
  /** Folder name under steamapps/common */
  readonly gameFolder: string;
  /** AppData folder name, e.g. "Warhammer3" */
  readonly appDataFolderName: string;
  /** Launcher (moddata.dat) game identifier, e.g. "warhammer3" */
  readonly launcherGameId: string;

  /** Pack file header magic, e.g. "PFH5" */
  readonly packHeader: string;
  /** Whether this game supports zstd compression in pack files */
  readonly supportsCompression: boolean;

  /** Name of the main DB pack file, e.g. "db.pack" or "data.pack" */
  readonly packWithDBTablesName: string;
  /** Vanilla pack files that ship with the game (for collision detection) */
  readonly vanillaPacksData: { name: string }[];
  /** Optional: exhaustive list of vanilla pack names from manifest */
  readonly manifest?: string[];

  /** Intro movie paths that can be skipped */
  readonly introMovies: string[];
  /** Supported game options (skip intro, script logging, etc.) */
  readonly supportedOptions: string[];
}

import { Preset } from "./mod";

/** Preset storage per game */
export type GamePresetsMap = Record<SupportedGame, Preset[]>;
