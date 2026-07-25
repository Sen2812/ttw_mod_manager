import * as path from "path";
import { Mod } from "../types";
import { sortByLoadOrder } from "../mod-manager/mod-sorting";
import type { ExternalPackRef, HeadPackRef } from "./builtin-features/types";

export interface StartGamePackRef {
  /** Absolute path to the directory containing the temp pack. */
  workDir: string;
  /** Pack file name (e.g. !!!!out.pack). */
  packName: string;
}

/** @deprecated Use ExternalPackRef from builtin-features */
export type AuxiliaryPackRef = ExternalPackRef;

export interface UsedModsContent {
  /** The text to write into used_mods.txt. */
  text: string;
  /** Mods that live in data/modding/ and must be copied into data/ first. */
  modsToCopyToData: Mod[];
}

export interface GenerateUsedModsOptions {
  isLinux?: boolean;
  /** @deprecated Use headPacks */
  startGamePack?: StartGamePackRef;
  /** @deprecated Use externalPacks */
  auxiliaryPacks?: AuxiliaryPackRef[];
  /** Manager-generated packs injected at highest priority (skip intro, bundled features). */
  headPacks?: HeadPackRef[];
  /** External/bundled packs injected after headPacks (workshop deps, data-folder packs). */
  externalPacks?: ExternalPackRef[];
}

/**
 * Generate the content for used_mods.txt.
 */
export function generateUsedModsContent(
  enabledMods: Mod[],
  dataFolder: string,
  options: GenerateUsedModsOptions = {},
): UsedModsContent {
  const isLinux = options.isLinux ?? false;
  const headPacks: HeadPackRef[] = [
    ...(options.headPacks ?? []),
    ...(options.startGamePack ? [options.startGamePack] : []),
  ];
  const externalPacks: ExternalPackRef[] = [
    ...(options.externalPacks ?? []),
    ...(options.auxiliaryPacks ?? []),
  ];

  const sorted = [...sortByLoadOrder(enabledMods)].reverse();
  const enabledNames = new Set(sorted.map((mod) => mod.name));

  const modsToCopyToData = sorted.filter((mod) => mod.isInModding);

  const modsNeedingWorkDir = sorted.filter((mod) => {
    if (mod.isInModding) return false;
    if (!mod.modDirectory) return false;
    try {
      return path.relative(dataFolder, mod.modDirectory) !== "";
    } catch {
      return true;
    }
  });

  const prefix = isLinux ? "Z:" : "";
  const lines: string[] = [];

  const workDirs = new Set<string>();
  for (const pack of headPacks) {
    workDirs.add(pack.workDir.replace(/\\/g, "/"));
  }
  for (const pack of externalPacks) {
    if (pack.workDir) workDirs.add(pack.workDir.replace(/\\/g, "/"));
  }
  for (const dir of workDirs) {
    lines.push(`add_working_directory "${prefix}${dir}";`);
  }
  for (const mod of modsNeedingWorkDir) {
    const dir = mod.modDirectory.replace(/\\/g, "/");
    const line = `add_working_directory "${prefix}${dir}";`;
    if (!lines.includes(line)) lines.push(line);
  }

  for (const pack of headPacks) {
    lines.push(`mod "${pack.packName}";`);
  }
  for (const pack of externalPacks) {
    if (!enabledNames.has(pack.packName)) {
      lines.push(`mod "${pack.packName}";`);
    }
  }
  for (const mod of sorted) {
    lines.push(`mod "${mod.name}";`);
  }

  return {
    text: lines.join("\n"),
    modsToCopyToData,
  };
}
