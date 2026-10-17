/**
 * Content-based load order for enabled Total War mods.
 *
 * The game replaces an earlier pack only when both packs contain the same
 * internal path. Database tables with different file names are merged, so
 * sharing a table name is a soft hint (a small patch should follow a wide
 * overhaul), not a reason to ignore what the mod is actually for.
 *
 * Top of the list loads first. Bottom loads last and wins path conflicts.
 *
 * Bands, first to last:
 *   1. Mixed / new content
 *   2. Gameplay table edits (broad overhauls, then smaller patches)
 *   3. Visuals, so reskins win meshes and textures
 *   4. Localization, so translated text wins English strings shipped by mods
 *
 * A pack that merely contains a script is not shoved to the end. Most content
 * mods ship campaign scripts next to their tables. Scripts only affect order
 * when two mods contain the same script path.
 *
 * Dependencies are a constraint, not a bucket: if A requires B, B is placed
 * before A even when that pulls B out of a later band.
 */

import type { Mod } from "../types";
import { readPackIndex } from "../pack-file";
import { getEnabledModsInLoadOrder } from "./mod-sorting";

export const MOD_SORT_CLASSES = [
  "content",
  "vanillaDb",
  "visual",
  "localization",
] as const;

export type ModSortClass = (typeof MOD_SORT_CLASSES)[number];

export interface AutoSortSummary {
  count: number;
  moved: number;
  /** Table names edited by two or more enabled mods. */
  duplicateTables: number;
  /** Enabled mods that list another enabled mod as a requirement. */
  dependencyLinks: number;
  classes: Record<ModSortClass, number>;
}

interface PackSignals {
  tables: Set<string>;
  dbPaths: Set<string>;
  visualPaths: Set<string>;
  locPaths: Set<string>;
  scriptPaths: Set<string>;
  dbFiles: number;
  visualFiles: number;
  locFiles: number;
  scriptFiles: number;
  total: number;
}

interface SortableMod {
  name: string;
  index: number;
  signals: PackSignals;
  sortClass: ModSortClass;
  /** Enabled pack names or workshop ids this mod requires. */
  requires: string[];
}

function emptyClassCounts(): Record<ModSortClass, number> {
  return { content: 0, vanillaDb: 0, visual: 0, localization: 0 };
}

function emptySignals(): PackSignals {
  return {
    tables: new Set(),
    dbPaths: new Set(),
    visualPaths: new Set(),
    locPaths: new Set(),
    scriptPaths: new Set(),
    dbFiles: 0,
    visualFiles: 0,
    locFiles: 0,
    scriptFiles: 0,
    total: 0,
  };
}

function normalizePath(name: string): string {
  return name.replace(/\//g, "\\").toLowerCase();
}

function isVisualPath(path: string): boolean {
  return path.startsWith("textures\\")
    || path.startsWith("variantmeshes\\")
    || path.startsWith("models\\")
    || path.startsWith("rigidmodels\\")
    || path.startsWith("animations\\")
    || path.startsWith("ui\\")
    || path.startsWith("materials\\")
    || path.startsWith("fx\\")
    || path.endsWith(".dds")
    || path.endsWith(".png")
    || path.endsWith(".tga");
}

function isScriptPath(path: string): boolean {
  return path.startsWith("script\\") || path.endsWith(".lua");
}

function isLocPath(path: string): boolean {
  return path.startsWith("text\\") || path.endsWith(".loc");
}

function tableName(path: string): string | undefined {
  if (!path.startsWith("db\\")) return undefined;
  return path.split("\\")[1] || undefined;
}

function readSignals(entries: { name: string }[]): PackSignals {
  const signals = emptySignals();
  for (const entry of entries) {
    const path = normalizePath(entry.name);
    if (!path) continue;
    signals.total++;
    const table = tableName(path);
    if (table) {
      signals.dbFiles++;
      signals.tables.add(table);
      signals.dbPaths.add(path);
    } else if (isLocPath(path)) {
      signals.locFiles++;
      signals.locPaths.add(path);
    } else if (isVisualPath(path)) {
      signals.visualFiles++;
      signals.visualPaths.add(path);
    } else if (isScriptPath(path)) {
      signals.scriptFiles++;
      signals.scriptPaths.add(path);
    }
  }
  return signals;
}

/**
 * Group by the payload that should decide conflicts.
 * A handful of script or text files does not reclassify a table overhaul.
 */
export function classifyModContent(signals: PackSignals): ModSortClass {
  const { total, dbFiles, visualFiles, locFiles } = signals;
  if (total === 0) return "content";
  if (locFiles >= visualFiles && locFiles >= dbFiles && locFiles * 2 >= total) return "localization";
  if (visualFiles > dbFiles && visualFiles >= locFiles && visualFiles * 2 >= total) return "visual";
  if (dbFiles > 0) return "vanillaDb";
  return "content";
}

function setsOverlap(a: Set<string>, b: Set<string>): boolean {
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const value of small) {
    if (large.has(value)) return true;
  }
  return false;
}

/** Same table name, or the same db/script/visual/loc file path. */
function conflicts(a: SortableMod, b: SortableMod): boolean {
  return setsOverlap(a.signals.tables, b.signals.tables)
    || setsOverlap(a.signals.dbPaths, b.signals.dbPaths)
    || setsOverlap(a.signals.scriptPaths, b.signals.scriptPaths)
    || setsOverlap(a.signals.visualPaths, b.signals.visualPaths)
    || setsOverlap(a.signals.locPaths, b.signals.locPaths);
}

function specificity(mod: SortableMod): number {
  const s = mod.signals;
  if (mod.sortClass === "visual") return s.visualFiles;
  if (mod.sortClass === "localization") return s.locFiles;
  return s.tables.size || s.dbFiles || s.scriptFiles;
}

/**
 * Inside one band, mods that touch the same files stay together.
 * The broader pack loads first; the smaller override loads later and wins.
 */
function orderWithinClass(mods: SortableMod[]): SortableMod[] {
  const parent = mods.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const unite = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };

  for (let i = 0; i < mods.length; i++) {
    for (let j = i + 1; j < mods.length; j++) {
      if (conflicts(mods[i], mods[j])) unite(i, j);
    }
  }

  const members = new Map<number, number[]>();
  for (let i = 0; i < mods.length; i++) {
    const root = find(i);
    const list = members.get(root);
    if (list) list.push(i);
    else members.set(root, [i]);
  }

  const emitted = new Set<number>();
  const result: SortableMod[] = [];
  for (let i = 0; i < mods.length; i++) {
    const root = find(i);
    if (emitted.has(root)) continue;
    emitted.add(root);
    const group = (members.get(root) ?? [i]).map(index => mods[index]);
    if (group.length > 1) {
      group.sort((a, b) => specificity(b) - specificity(a) || a.index - b.index);
    }
    result.push(...group);
  }
  return result;
}

function orderByBands(mods: SortableMod[]): string[] {
  const byClass = new Map<ModSortClass, SortableMod[]>();
  for (const sortClass of MOD_SORT_CLASSES) byClass.set(sortClass, []);
  for (const mod of [...mods].sort((a, b) => a.index - b.index)) {
    byClass.get(mod.sortClass)?.push(mod);
  }
  const names: string[] = [];
  for (const sortClass of MOD_SORT_CLASSES) {
    names.push(...orderWithinClass(byClass.get(sortClass) ?? []).map(mod => mod.name));
  }
  return names;
}

/**
 * Place each requirement before the mod that needs it, preferring the band
 * order whenever the constraint allows it.
 */
function applyDependencyOrder(preferred: string[], edges: Array<[string, string]>): string[] {
  const index = new Map(preferred.map((name, i) => [name, i]));
  const incoming = new Map<string, number>();
  const outgoing = new Map<string, string[]>();
  for (const name of preferred) {
    incoming.set(name, 0);
    outgoing.set(name, []);
  }
  for (const [before, after] of edges) {
    if (!incoming.has(before) || !incoming.has(after) || before === after) continue;
    outgoing.get(before)?.push(after);
    incoming.set(after, (incoming.get(after) ?? 0) + 1);
  }

  const ready = preferred.filter(name => incoming.get(name) === 0);
  const result: string[] = [];
  while (ready.length > 0) {
    ready.sort((a, b) => (index.get(a) ?? 0) - (index.get(b) ?? 0));
    const next = ready.shift();
    if (!next) break;
    result.push(next);
    for (const child of outgoing.get(next) ?? []) {
      const left = (incoming.get(child) ?? 1) - 1;
      incoming.set(child, left);
      if (left === 0) ready.push(child);
    }
  }
  if (result.length < preferred.length) {
    const seen = new Set(result);
    for (const name of preferred) {
      if (!seen.has(name)) result.push(name);
    }
  }
  return result;
}

function countDuplicateTables(mods: SortableMod[]): number {
  const seen = new Map<string, number>();
  for (const mod of mods) {
    for (const table of mod.signals.tables) seen.set(table, (seen.get(table) ?? 0) + 1);
  }
  let count = 0;
  for (const n of seen.values()) {
    if (n > 1) count++;
  }
  return count;
}

/** Read enabled packs and return the new top-to-bottom order plus a summary. */
export async function planEnabledAutoSort(mods: Mod[]): Promise<{ names: string[]; summary: AutoSortSummary }> {
  const enabled = getEnabledModsInLoadOrder(mods);
  const enabledPacks = new Set(enabled.map(mod => mod.name.toLowerCase()));
  const workshopToName = new Map<string, string>();
  for (const mod of enabled) {
    if (/^\d{5,15}$/.test(mod.workshopId)) workshopToName.set(mod.workshopId, mod.name);
  }

  const sortable: SortableMod[] = [];
  for (let index = 0; index < enabled.length; index++) {
    const mod = enabled[index];
    let entries: { name: string }[] = [];
    let dependencyPacks = mod.dependencyPacks ?? [];
    if (mod.path && !mod.pendingDownload) {
      try {
        const pack = await readPackIndex(mod.path);
        entries = pack.entries;
        if (pack.dependencyPacks.length > 0) dependencyPacks = pack.dependencyPacks;
      } catch {
        entries = [];
      }
    }
    const signals = readSignals(entries);
    const requires: string[] = [];
    for (const id of mod.reqModIds ?? []) {
      if (workshopToName.has(id)) requires.push(`workshop:${id}`);
    }
    for (const pack of dependencyPacks) {
      const name = pack.toLowerCase();
      if (name !== mod.name.toLowerCase() && enabledPacks.has(name)) requires.push(name);
    }
    sortable.push({
      name: mod.name,
      index,
      signals,
      sortClass: classifyModContent(signals),
      requires,
    });
  }

  const edges: Array<[string, string]> = [];
  const seenEdges = new Set<string>();
  for (const mod of sortable) {
    for (const key of mod.requires) {
      const target = key.startsWith("workshop:")
        ? workshopToName.get(key.slice("workshop:".length))
        : sortable.find(item => item.name.toLowerCase() === key)?.name;
      if (!target || target === mod.name) continue;
      const edge = `${target}\0${mod.name}`;
      if (seenEdges.has(edge)) continue;
      seenEdges.add(edge);
      edges.push([target, mod.name]);
    }
  }

  const names = applyDependencyOrder(orderByBands(sortable), edges);
  const classes = emptyClassCounts();
  for (const mod of sortable) classes[mod.sortClass]++;
  let moved = 0;
  for (let i = 0; i < names.length; i++) {
    if (names[i] !== enabled[i]?.name) moved++;
  }

  return {
    names,
    summary: {
      count: names.length,
      moved,
      duplicateTables: countDuplicateTables(sortable),
      dependencyLinks: edges.length,
      classes,
    },
  };
}
