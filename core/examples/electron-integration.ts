/**
 * Example: Integrating mod-manager-core with Electron
 *
 * This shows how to replace the hardcoded game definitions and
 * mod management logic in WH3-Mod-Manager with the core library.
 */

import {
  gameRegistry,
  BUILTIN_GAMES,
  SupportedGame,
  GameDefinition,
  GameFolderPaths,
  Mod,
  Preset,
  sortByLoadOrder,
  filterMods,
  createPreset,
  applyPreset,
  ConfigManager,
  AppConfig,
  readPackHeader,
  detectFileCollisions,
} from "../src";

// ─── Step 1: Register Games ──────────────────────────────────────────────────

BUILTIN_GAMES.forEach((game) => gameRegistry.register(game));

// You can also register custom games:
// gameRegistry.register({
//   id: "customGame" as SupportedGame,
//   displayName: "Custom Game",
//   steamId: "99999",
//   processName: "CustomGame.exe",
//   gameFolder: "Custom Game",
//   appDataFolderName: "CustomGame",
//   packHeader: "PFH5",
//   supportsCompression: true,
//   packWithDBTablesName: "data.pack",
//   vanillaPacksData: [{ name: "data.pack" }],
//   introMovies: [],
//   supportedOptions: [],
// });

// ─── Step 2: Config Manager ──────────────────────────────────────────────────

import * as fs from "fs";
import * as path from "path";
import { app } from "electron";

const configPath = path.join(app.getPath("userData"), "config.json");

const configManager = new ConfigManager({
  read: async () => {
    try {
      return await fs.promises.readFile(configPath, "utf8");
    } catch {
      return null;
    }
  },
  write: async (data: string) => {
    const tempPath = configPath + ".tmp";
    await fs.promises.writeFile(tempPath, data);
    await fs.promises.rename(tempPath, configPath);
  },
});

// On app startup:
async function onAppStart() {
  const config = await configManager.read("wh3");
  console.log("Current game:", config.currentGame);
  console.log("Preferences:", config.preferences);

  // Apply saved folder paths
  const gameDef = gameRegistry.get(config.currentGame);
  if (gameDef) {
    console.log(`Game: ${gameDef.displayName} (Steam: ${gameDef.steamId})`);
  }
}

// ─── Step 3: Replace Inline Sorting ──────────────────────────────────────────

// BEFORE (in appSlice.ts):
// state.currentPreset.mods = sortByNameAndLoadOrder(state.currentPreset.mods);

// AFTER (using core):
function handleSetMods(mods: Mod[]) {
  return sortByLoadOrder(mods);
}

// ─── Step 4: Replace Inline Filtering ────────────────────────────────────────

// BEFORE (in modSortingHelpers.ts):
// function getFilteredMods(mods, filter, doAuthorFiltering) { ... }

// AFTER (using core):
function handleFilterChange(mods: Mod[], filter: string, showAuthor: boolean) {
  return filterMods(mods, filter, showAuthor);
}

// ─── Step 5: Preset Management ───────────────────────────────────────────────

// BEFORE: Preset logic scattered across appSlice.ts (500+ lines)
// AFTER: Clean API from core

function handleCreatePreset(name: string, currentMods: Mod[]) {
  const preset = createPreset(name, currentMods);

  // Save to config
  const config = configManager.getCached()!;
  const game = config.currentGame;
  if (!config.gamePresets[game]) config.gamePresets[game] = [];
  config.gamePresets[game].push(preset);
  configManager.write(config);

  return preset;
}

function handleApplyPreset(preset: Preset, currentMods: Mod[]) {
  return applyPreset(currentMods, preset, "unary");
}

// ─── Step 6: Pack Header Reading ─────────────────────────────────────────────

// BEFORE: Direct binary-file usage in packFileHandler.ts
// AFTER: Core's readPackHeader with pluggable reader

import BinaryFile from "binary-file";

async function readModHeader(packPath: string) {
  return readPackHeader(packPath, (filePath) => {
    const file = new BinaryFile(filePath, "r", true);
    return {
      open: () => file.open(),
      close: () => file.close(),
      seek: (pos) => file.seek(pos),
      readInt32: () => file.readInt32(),
      readBytes: (len) => file.read(len),
    };
  });
}

// ─── Step 7: Game-Specific Logic via Registry ────────────────────────────────

// BEFORE: Huge Record<SupportedGames, T> maps everywhere
//   const gameToSteamId: Record<SupportedGames, string> = { ... };
//   const gameToProcessName: Record<SupportedGames, string> = { ... };

// AFTER: Query the registry
function getSteamId(gameId: SupportedGame): string | undefined {
  return gameRegistry.get(gameId)?.steamId;
}

function getProcessName(gameId: SupportedGame): string | undefined {
  return gameRegistry.get(gameId)?.processName;
}

function isCompressionSupported(gameId: SupportedGame): boolean {
  return gameRegistry.get(gameId)?.supportsCompression ?? false;
}

// List all supported games for a dropdown:
function getGameOptions() {
  return gameRegistry.getAll().map((g) => ({
    value: g.id,
    label: g.displayName,
  }));
}

// ─── Summary ─────────────────────────────────────────────────────────────────

/**
 * By extracting the core logic:
 *
 * 1. ~2000 lines of business logic extracted from appSlice.ts
 * 2. Game definitions are now data, not code spread across 10+ files
 * 3. Sorting/filtering are pure functions, easily testable
 * 4. Preset management is a clean API, not a tangle of Redux reducers
 * 5. Config I/O is abstracted — can be swapped from fs to IndexedDB, etc.
 * 6. Pack header reading works without Electron's binary-file
 * 7. Collision detection is reusable for CLI tools or web UIs
 */
