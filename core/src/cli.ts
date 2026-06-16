#!/usr/bin/env node
/**
 * Mod Manager CLI
 *
 * A command-line interface for the mod manager core.
 * Demonstrates that the core is fully functional without any UI framework.
 *
 * Usage:
 *   npx ts-node cli.ts list
 *   npx ts-node cli.ts scan
 *   npx ts-node cli.ts enable <mod-name>
 *   npx ts-node cli.ts disable <mod-name>
 *   npx ts-node cli.ts preset list
 *   npx ts-node cli.ts preset create <name>
 *   npx ts-node cli.ts preset apply <name>
 *   npx ts-node cli.ts game list
 *   npx ts-node cli.ts game set <game-id>
 *   npx ts-node cli.ts info
 */

import { ModManager } from "./mod-manager/mod-manager";
import { SupportedGame, SUPPORTED_GAMES } from "./types";
import { gameRegistry, BUILTIN_GAMES } from "./game-definitions";
import { sortByEnabled, sortByLoadOrder, filterMods } from "./mod-manager/mod-sorting";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  blue: "\x1b[34m",
};

function printModTable(mods: any[], showIndex = false) {
  if (mods.length === 0) {
    console.log(`${C.dim}  No mods found.${C.reset}`);
    return;
  }

  const maxName = Math.max(4, ...mods.map((m: any) => (m.humanName || m.name).length));
  const maxAuthor = Math.max(6, ...mods.map((m: any) => (m.author || "").length));

  console.log(
    `${C.bold}${showIndex ? "#  " : ""}Status  ${"Mod Name".padEnd(maxName)}  ${"Author".padEnd(maxAuthor)}  LoadOrder  WorkshopID${C.reset}`,
  );
  console.log("─".repeat(maxName + maxAuthor + 50));

  for (let i = 0; i < mods.length; i++) {
    const m = mods[i];
    const status = m.isEnabled ? `${C.green}✓ ON ${C.reset}` : `${C.red}✗ OFF${C.reset}`;
    const name = (m.humanName || m.name).slice(0, maxName).padEnd(maxName);
    const author = (m.author || "").slice(0, maxAuthor).padEnd(maxAuthor);
    const loadOrder = m.loadOrder != null ? String(m.loadOrder).padStart(5) : "    -";
    const idx = showIndex ? `${String(i + 1).padStart(3)} ` : "";

    console.log(`${idx}${status}  ${name}  ${author}  ${loadOrder}    ${m.workshopId}`);
  }
}

// ─── Commands ─────────────────────────────────────────────────────────────────

async function cmdList(mm: ModManager, args: string[]) {
  const filter = args[0] ?? "";
  let mods = mm.getMods();
  if (filter) {
    mods = filterMods(mods, filter, true);
    console.log(`\n${C.bold}Filtered by: "${filter}"${C.reset}`);
  }
  console.log(`\n${C.bold}=== Mod List (${mods.length} mods, ${mods.filter((m) => m.isEnabled).length} enabled) ===${C.reset}\n`);
  printModTable(mods, true);
}

async function cmdScan(mm: ModManager) {
  console.log(`\n${C.bold}Scanning mods...${C.reset}\n`);
  const mods = await mm.scanMods();
  console.log(`\n${C.green}Found ${mods.length} mods${C.reset}`);
  printModTable(sortByEnabled(mods));
}

async function cmdEnable(mm: ModManager, args: string[]) {
  if (args.length === 0) {
    console.log(`${C.red}Usage: enable <mod-name>${C.reset}`);
    return;
  }
  const name = args.join(" ");
  mm.enableMod(name);
  console.log(`${C.green}Enabled: ${name}${C.reset}`);
}

async function cmdDisable(mm: ModManager, args: string[]) {
  if (args.length === 0) {
    console.log(`${C.red}Usage: disable <mod-name>${C.reset}`);
    return;
  }
  const name = args.join(" ");
  mm.disableMod(name);
  console.log(`${C.yellow}Disabled: ${name}${C.reset}`);
}

async function cmdToggle(mm: ModManager, args: string[]) {
  if (args.length === 0) {
    console.log(`${C.red}Usage: toggle <mod-name>${C.reset}`);
    return;
  }
  const name = args.join(" ");
  const newState = mm.toggleMod(name);
  console.log(`${newState ? C.green : C.yellow}${newState ? "Enabled" : "Disabled"}: ${name}${C.reset}`);
}

async function cmdEnableAll(mm: ModManager) {
  mm.enableAll();
  console.log(`${C.green}All mods enabled${C.reset}`);
}

async function cmdDisableAll(mm: ModManager) {
  mm.disableAll();
  console.log(`${C.yellow}All mods disabled (except always-enabled)${C.reset}`);
}

async function cmdPreset(mm: ModManager, args: string[]) {
  const subcmd = args[0];

  if (subcmd === "list" || !subcmd) {
    const presets = mm.getPresets();
    console.log(`\n${C.bold}=== Presets (${presets.length}) ===${C.reset}\n`);
    if (presets.length === 0) {
      console.log(`${C.dim}  No presets saved.${C.reset}`);
    } else {
      for (const preset of presets) {
        const enabledCount = preset.mods.filter((m) => m.isEnabled).length;
        console.log(`  ${C.cyan}${preset.name}${C.reset} — ${enabledCount} enabled mods`);
      }
    }
    return;
  }

  if (subcmd === "create") {
    const name = args.slice(1).join(" ");
    if (!name) {
      console.log(`${C.red}Usage: preset create <name>${C.reset}`);
      return;
    }
    mm.createPreset(name);
    console.log(`${C.green}Created preset: ${name}${C.reset}`);
    return;
  }

  if (subcmd === "apply") {
    const name = args.slice(1).join(" ");
    if (!name) {
      console.log(`${C.red}Usage: preset apply <name>${C.reset}`);
      return;
    }
    try {
      mm.applyPreset(name);
      console.log(`${C.green}Applied preset: ${name}${C.reset}`);
    } catch (e: any) {
      console.log(`${C.red}${e.message}${C.reset}`);
    }
    return;
  }

  if (subcmd === "delete") {
    const name = args.slice(1).join(" ");
    if (!name) {
      console.log(`${C.red}Usage: preset delete <name>${C.reset}`);
      return;
    }
    mm.deletePreset(name);
    console.log(`${C.yellow}Deleted preset: ${name}${C.reset}`);
    return;
  }

  if (subcmd === "update") {
    const name = args.slice(1).join(" ");
    if (!name) {
      console.log(`${C.red}Usage: preset update <name>${C.reset}`);
      return;
    }
    mm.replacePreset(name);
    console.log(`${C.green}Updated preset: ${name}${C.reset}`);
    return;
  }

  console.log(`${C.red}Unknown preset command: ${subcmd}${C.reset}`);
  console.log(`Available: list, create, apply, delete, update`);
}

async function cmdGame(mm: ModManager, args: string[]) {
  const subcmd = args[0];

  if (subcmd === "list" || !subcmd) {
    console.log(`\n${C.bold}=== Supported Games ===${C.reset}\n`);
    for (const game of BUILTIN_GAMES) {
      const current = game.id === mm.config.currentGame ? `${C.green} ◀ current${C.reset}` : "";
      console.log(`  ${C.cyan}${game.id.padEnd(15)}${C.reset} ${game.displayName}${current}`);
    }
    return;
  }

  if (subcmd === "set") {
    const gameId = args[1] as SupportedGame;
    if (!gameId || !SUPPORTED_GAMES.includes(gameId)) {
      console.log(`${C.red}Usage: game set <game-id>${C.reset}`);
      console.log(`Available: ${SUPPORTED_GAMES.join(", ")}`);
      return;
    }
    try {
      await mm.setGame(gameId);
      console.log(`${C.green}Switched to: ${mm.currentGame?.displayName}${C.reset}`);
    } catch (e: any) {
      console.log(`${C.red}${e.message}${C.reset}`);
    }
    return;
  }

  console.log(`${C.red}Unknown game command: ${subcmd}${C.reset}`);
}

async function cmdInfo(mm: ModManager) {
  console.log(`\n${C.bold}=== Mod Manager Info ===${C.reset}\n`);
  console.log(`  Current Game:    ${C.cyan}${mm.currentGame?.displayName ?? "none"}${C.reset} (${mm.config.currentGame})`);
  console.log(`  Game Path:       ${mm.folderPaths.gamePath ?? C.dim + "not found" + C.reset}`);
  console.log(`  Content Folder:  ${mm.folderPaths.contentFolder ?? C.dim + "not found" + C.reset}`);
  console.log(`  Data Folder:     ${mm.folderPaths.dataFolder ?? C.dim + "not found" + C.reset}`);
  console.log(`  Total Mods:      ${mm.mods.length}`);
  console.log(`  Enabled Mods:    ${mm.getEnabledMods().length}`);
  console.log(`  Vanilla Packs:   ${mm.vanillaPacks.size}`);
  console.log(`  Presets:         ${mm.getPresets().length}`);
  console.log(`  Categories:      ${mm.getCategories().join(", ") || C.dim + "none" + C.reset}`);
  console.log(`  Always Enabled:  ${mm.config.alwaysEnabledMods.map((m) => m.name).join(", ") || C.dim + "none" + C.reset}`);
}

async function cmdHelp() {
  console.log(`
${C.bold}Mod Manager CLI${C.reset}

${C.cyan}Usage:${C.reset}
  mod-manager <command> [options]

${C.cyan}Commands:${C.reset}
  list [filter]         List all mods (optionally filter by name)
  scan                  Re-scan mod directories
  enable <name>         Enable a mod
  disable <name>        Disable a mod
  toggle <name>         Toggle a mod's enabled state
  enable-all            Enable all mods
  disable-all           Disable all mods
  info                  Show mod manager status

  preset list           List saved presets
  preset create <name>  Create preset from enabled mods
  preset apply <name>   Apply a preset
  preset delete <name>  Delete a preset
  preset update <name>  Update preset with current state

  game list             List supported games
  game set <id>         Switch to a different game

  help                  Show this help message

${C.cyan}Examples:${C.reset}
  mod-manager list ui
  mod-manager enable "Better Camera"
  mod-manager preset create "My Modpack"
  mod-manager game set wh2
`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const commandArgs = args.slice(1);

  // Register games
  for (const game of BUILTIN_GAMES) {
    gameRegistry.register(game);
  }

  // Create mod manager
  const mm = new ModManager({
    log: (msg) => console.log(`  ${C.dim}${msg}${C.reset}`),
  });

  try {
    switch (command) {
      case "list":
      case "ls":
        await mm.init();
        await cmdList(mm, commandArgs);
        break;

      case "scan":
        await mm.init();
        await cmdScan(mm);
        break;

      case "enable":
        await mm.init();
        await cmdEnable(mm, commandArgs);
        break;

      case "disable":
        await mm.init();
        await cmdDisable(mm, commandArgs);
        break;

      case "toggle":
        await mm.init();
        await cmdToggle(mm, commandArgs);
        break;

      case "enable-all":
        await mm.init();
        await cmdEnableAll(mm);
        break;

      case "disable-all":
        await mm.init();
        await cmdDisableAll(mm);
        break;

      case "preset":
        await mm.init();
        await cmdPreset(mm, commandArgs);
        break;

      case "game":
        await mm.init();
        await cmdGame(mm, commandArgs);
        break;

      case "info":
        await mm.init();
        await cmdInfo(mm);
        break;

      case "help":
      case "--help":
      case "-h":
      case undefined:
        await cmdHelp();
        break;

      default:
        console.log(`${C.red}Unknown command: ${command}${C.reset}`);
        await cmdHelp();
        process.exit(1);
    }
  } catch (e: any) {
    console.error(`${C.red}Error: ${e.message}${C.reset}`);
    process.exit(1);
  }
}

main();
