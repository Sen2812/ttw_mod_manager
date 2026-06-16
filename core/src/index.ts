/**
 * Mod Manager Core
 *
 * Framework-agnostic core library for Total War mod management.
 * This module contains all business logic with zero UI dependencies.
 *
 * ## Quick Start
 *
 * ```typescript
 * import { ModManager } from "mod-manager-core";
 *
 * const mm = new ModManager({ configDir: "./my-config" });
 * await mm.init();
 *
 * // List mods
 * const mods = mm.getMods();
 *
 * // Enable/disable
 * mm.enableMod("my_mod.pack");
 * mm.disableMod("another_mod.pack");
 *
 * // Presets
 * mm.createPreset("My Modpack");
 * mm.applyPreset("My Modpack");
 *
 * // Switch games
 * await mm.setGame("wh2");
 * ```
 */

// ─── Types ────────────────────────────────────────────────────────────────────
export * from "./types";

// ─── Game Definitions ─────────────────────────────────────────────────────────
export * from "./game-definitions";

// ─── Mod Manager ──────────────────────────────────────────────────────────────
export * from "./mod-manager";

// ─── Pack File ────────────────────────────────────────────────────────────────
export * from "./pack-file";

// ─── Config ───────────────────────────────────────────────────────────────────
export * from "./config";

// ─── Compatibility ────────────────────────────────────────────────────────────
export * from "./compat";

// ─── CA Launcher Sync ─────────────────────────────────────────────────────────
export {
  type LauncherModEntry,
  type SyncResult,
  getDefaultLauncherFolder,
  findModDataFile,
  readLauncherData,
  writeLauncherData,
  syncModsToLauncher,
} from "./launcher";
export { type UsedModsContent, generateUsedModsContent } from "./launcher";
