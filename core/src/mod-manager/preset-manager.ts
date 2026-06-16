/**
 * Preset Manager
 *
 * Manages mod presets — named snapshots of which mods are enabled and their order.
 * Handles preset CRUD, application, import/export, and bisect for debugging.
 */

import { Mod, Preset } from "../types";
import { deduplicateDataContent, sortByLoadOrder, sortAsInPreset } from "./mod-sorting";

/** How to apply a preset to the current mod list */
export type SelectOperation = "unary" | "addition" | "subtraction";

// ─── Preset CRUD ──────────────────────────────────────────────────────────────

/** Create a new preset from the currently enabled mods */
export function createPreset(
  name: string,
  currentMods: Mod[],
  currentVersion?: number,
): Preset {
  const enabledOnly = currentMods.filter((m) => m.isEnabled);
  return {
    name,
    mods: [...enabledOnly.map((m) => ({ ...m }))],
    version: currentVersion ?? 2,
  };
}

/** Clone a preset with a new name */
export function clonePreset(preset: Preset, newName: string): Preset {
  return {
    name: newName,
    mods: preset.mods.map((m) => ({ ...m })),
    version: preset.version,
  };
}

/** Replace a preset's mod list with the current state */
export function replacePreset(
  presets: Preset[],
  name: string,
  currentMods: Mod[],
  currentVersion?: number,
): Preset | undefined {
  const preset = presets.find((p) => p.name === name);
  if (!preset) return undefined;
  preset.mods = [...currentMods.map((m) => ({ ...m }))];
  preset.version = currentVersion ?? 2;
  return preset;
}

/** Delete a preset by name */
export function deletePreset(presets: Preset[], name: string): Preset[] {
  return presets.filter((p) => p.name !== name);
}

/** Check if a preset name already exists */
export function presetExists(presets: Preset[], name: string): boolean {
  return presets.some((p) => p.name === name);
}

// ─── Preset Application ──────────────────────────────────────────────────────

/**
 * Apply a preset to the current mod list.
 *
 * - "unary": Replace the entire enabled state (disable all, then enable preset mods)
 * - "addition": Add preset's enabled mods to currently enabled mods
 * - "subtraction": Remove preset's enabled mods from currently enabled mods
 */
export function applyPreset(
  currentMods: Mod[],
  preset: Preset,
  operation: SelectOperation,
  alwaysEnabledNames?: Set<string>,
): Mod[] {
  const result = currentMods.map((m) => ({ ...m }));

  if (operation === "unary") {
    // Disable all first
    result.forEach((m) => (m.isEnabled = false));

    // Normalize preset mods
    const normalizedPresetMods = deduplicateDataContent(
      preset.version == null ? sortByLoadOrder(preset.mods) : preset.mods,
    );
    const presetByName = new Map(normalizedPresetMods.map((m) => [m.name, m]));

    // Apply preset state
    result.forEach((m) => {
      const presetMod = presetByName.get(m.name);
      if (presetMod) {
        m.isEnabled = presetMod.isEnabled;
        m.loadOrder = presetMod.loadOrder;
      }
    });

    // Sort to match preset order
    return sortAsInPreset(result, normalizedPresetMods);
  }

  if (operation === "addition" || operation === "subtraction") {
    const presetEnabledNames = new Set(
      preset.mods.filter((m) => m.isEnabled).map((m) => m.name),
    );

    result.forEach((m) => {
      if (presetEnabledNames.has(m.name)) {
        m.isEnabled = operation === "addition";
      }
    });
  }

  // Apply always-enabled mods
  if (alwaysEnabledNames) {
    result
      .filter((m) => alwaysEnabledNames.has(m.name))
      .forEach((m) => (m.isEnabled = true));
  }

  return result;
}

// ─── Bisect (for debugging mod conflicts) ────────────────────────────────────

export interface BisectOptions {
  /** Randomize which mods go into each half */
  isRandom: boolean;
  /** Ignore mod dependencies when splitting */
  ignoreDependencies: boolean;
}

export interface BisectResult {
  firstPreset: Preset;
  secondPreset: Preset;
}

/**
 * Create two presets that bisect the currently enabled mods.
 * Useful for binary-search debugging of mod conflicts.
 */
export function createBisectPresets(
  currentMods: Mod[],
  options: BisectOptions,
  timestamp?: string,
): BisectResult {
  const enabled = currentMods.filter((m) => m.isEnabled);
  const isLoadOrder = enabled.some((m) => m.loadOrder != null);

  const clones = enabled.map((m, i) => {
    const clone = { ...m };
    if (isLoadOrder) clone.loadOrder = i;
    return clone;
  });

  let first: Mod[];
  let second: Mod[];

  const sorted = [...clones].sort((a, b) => {
    const na = a.name.toLowerCase();
    const nb = b.name.toLowerCase();
    return na < nb ? -1 : na > nb ? 1 : 0;
  });

  if (options.isRandom) {
    const shuffled = [...sorted];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const cutoff = Math.ceil(shuffled.length / 2);
    first = shuffled.slice(0, cutoff);
    second = shuffled.slice(cutoff);
  } else {
    const cutoff = Math.ceil(sorted.length / 2);
    first = sorted.slice(0, cutoff);
    second = sorted.slice(cutoff);
  }

  const ts = timestamp ?? new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

  return {
    firstPreset: { name: `${ts}_${first.length}_First`, mods: first, version: 2 },
    secondPreset: { name: `${ts}_${second.length}_Second`, mods: second, version: 2 },
  };
}

// ─── Import/Export ────────────────────────────────────────────────────────────

/** Export a preset to a JSON-serializable format */
export function exportPreset(preset: Preset): string {
  const serializable = {
    name: preset.name,
    version: preset.version,
    mods: preset.mods.map((m) => ({
      name: m.name,
      workshopId: m.workshopId,
      isEnabled: m.isEnabled,
      loadOrder: m.loadOrder,
      humanName: m.humanName,
      author: m.author,
    })),
  };
  return JSON.stringify(serializable, null, 2);
}

/** Import a preset from JSON */
export function importPreset(json: string): Preset {
  const data = JSON.parse(json);
  return {
    name: data.name ?? "Imported Preset",
    version: data.version ?? 2,
    mods: (data.mods ?? []).map((m: any) => ({
      ...m,
      tags: m.tags ?? ["mod"],
      isEnabled: m.isEnabled ?? false,
      isDeleted: false,
      isMovie: false,
      isInData: false,
      author: m.author ?? "",
    })),
  };
}
