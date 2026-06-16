/**
 * Overwrite / Conflict Detector
 *
 * Given a set of enabled mods and their internal file indices (from
 * readPackIndex), determine which files are claimed by more than one mod and,
 * based on the current load order, which mod "wins" each file.
 *
 * Load-order semantics (ascending — matches used_mods.txt generation):
 *   lower loadOrder  = loaded earlier  = gets overwritten
 *   higher loadOrder = loaded later    = overwrites earlier mods (wins)
 *
 * So for a contested file, the mod with the highest loadOrder wins, and every
 * other mod that also contains that file is overwritten on that file.
 */

import type { PackIndex } from "../pack-file";

/** A single mod participating in a conflict. */
export interface ConflictParticipant {
  /** Mod pack file name, e.g. "my_mod.pack". */
  modName: string;
  /** Load order (ascending). Higher = loaded later = higher priority. */
  loadOrder: number;
  /** Size of the contested file inside this mod's pack. */
  size: number;
}

/** One file that two or more enabled mods both contain. */
export interface FileConflict {
  /** The contested internal path (backslash-separated, e.g. "db\\...\\data\\..."). */
  fileName: string;
  /** Category bucket for display: "db" (database table), "script", "ui", "other". */
  category: "db" | "script" | "ui" | "loc" | "other";
  /** All mods containing this file, sorted by loadOrder ascending. */
  participants: ConflictParticipant[];
  /** The mod that wins this file (highest loadOrder). */
  winner: string;
  /** Mods whose version of the file is overridden. */
  losers: string[];
}

/** One mod this mod has a conflict relationship with. */
export interface ModRelation {
  /** The other mod's pack file name. */
  modName: string;
  /** How many contested files are involved in this pairwise relationship. */
  fileCount: number;
}

/** Per-mod summary across all conflicts. */
export interface ModConflictStats {
  /** How many contested files this mod wins. */
  wins: number;
  /** How many contested files this mod loses (gets overwritten). */
  losses: number;
  /** Total contested files this mod participates in. */
  total: number;
  /** Mods this mod overwrites (as winner), with per-pair file counts. Sorted by fileCount desc. */
  overwrites: ModRelation[];
  /** Mods that overwrite this mod (it is a loser), with per-pair file counts. Sorted by fileCount desc. */
  overwrittenBy: ModRelation[];
}

export interface OverwriteAnalysis {
  /** All file conflicts, sorted by impact (most participants first). */
  conflicts: FileConflict[];
  /** Per-mod win/loss tallies, keyed by mod name. */
  modStats: Map<string, ModConflictStats>;
  /** Number of mods involved in at least one conflict. */
  modsWithConflicts: number;
  /** Total distinct contested files. */
  totalConflicts: number;
}

/** Bucket an internal file path into a coarse category for grouping. */
function categorize(name: string): FileConflict["category"] {
  const lower = name.toLowerCase();
  if (lower.startsWith("db\\")) return "db";
  if (lower.endsWith(".lua")) return "script";
  if (lower.startsWith("script\\")) return "script";
  if (lower.endsWith(".loc") || lower.startsWith("localisa\\")) return "loc";
  if (lower.startsWith("ui\\")) return "ui";
  return "other";
}

export interface ModForAnalysis {
  /** Pack file name. */
  name: string;
  /** Load order used for priority. */
  loadOrder: number;
}

/**
 * Detect file-level overwrites among a set of mods.
 *
 * @param mods       The mods to analyze (typically enabled mods, in any order).
 * @param indices    Map from pack file path → PackIndex (from readPackIndex).
 */
export function detectOverwrites(
  mods: ModForAnalysis[],
  indices: Map<string, PackIndex>,
  options: { modPathByName?: Map<string, string> } = {},
): OverwriteAnalysis {
  // fileName → list of { modName, loadOrder, size }
  const fileOwners = new Map<string, ConflictParticipant[]>();

  for (const mod of mods) {
    const packPath = options.modPathByName?.get(mod.name);
    if (!packPath) continue;
    const index = indices.get(packPath);
    if (!index) continue;

    for (const entry of index.entries) {
      // We only care about files that could meaningfully conflict:
      // db tables, scripts, loc, ui. Skip trivial/noise files.
      const cat = categorize(entry.name);
      if (cat === "other") continue;

      let owners = fileOwners.get(entry.name);
      if (!owners) {
        owners = [];
        fileOwners.set(entry.name, owners);
      }
      owners.push({
        modName: mod.name,
        loadOrder: mod.loadOrder,
        size: entry.size,
      });
    }
  }

  // Build conflicts for files owned by more than one mod.
  const conflicts: FileConflict[] = [];
  for (const [fileName, owners] of fileOwners) {
    if (owners.length < 2) continue;

    // Sort by loadOrder ascending (earlier loaded first). Winner = last.
    owners.sort((a, b) => a.loadOrder - b.loadOrder);
    const winner = owners[owners.length - 1].modName;
    const losers = owners.slice(0, -1).map((o) => o.modName);

    conflicts.push({
      fileName,
      category: categorize(fileName),
      participants: owners,
      winner,
      losers,
    });
  }

  // Sort: more participants first, then alphabetically.
  conflicts.sort((a, b) => {
    if (b.participants.length !== a.participants.length) {
      return b.participants.length - a.participants.length;
    }
    return a.fileName < b.fileName ? -1 : 1;
  });

  // Per-mod stats + pairwise relationships.
  const modStats = new Map<string, ModConflictStats>();
  const getStats = (name: string): ModConflictStats => {
    let s = modStats.get(name);
    if (!s) {
      s = { wins: 0, losses: 0, total: 0, overwrites: [], overwrittenBy: [] };
      modStats.set(name, s);
    }
    return s;
  };
  const bump = (name: string, field: "wins" | "losses" | "total") => {
    getStats(name)[field]++;
  };
  // Pairwise counters: key = "winnerName\u0000loserName" → file count.
  // We accumulate then convert to relation arrays.
  const overwritesCount = new Map<string, Map<string, number>>(); // winner → (loser → count)
  const overwrittenByCount = new Map<string, Map<string, number>>(); // loser → (winner → count)
  const bumpPair = (
    table: Map<string, Map<string, number>>,
    a: string,
    b: string,
  ) => {
    let inner = table.get(a);
    if (!inner) { inner = new Map(); table.set(a, inner); }
    inner.set(b, (inner.get(b) ?? 0) + 1);
  };

  for (const c of conflicts) {
    for (const p of c.participants) {
      bump(p.modName, "total");
      if (p.modName === c.winner) bump(p.modName, "wins");
      else bump(p.modName, "losses");
    }
    // Record pairwise: winner overwrites every loser on this file.
    for (const loser of c.losers) {
      bumpPair(overwritesCount, c.winner, loser);
      bumpPair(overwrittenByCount, loser, c.winner);
    }
  }

  // Convert counters → sorted relation arrays.
  const toRelations = (m: Map<string, number> | undefined): ModRelation[] => {
    if (!m) return [];
    return [...m.entries()]
      .map(([modName, fileCount]) => ({ modName, fileCount }))
      .sort((a, b) => b.fileCount - a.fileCount);
  };
  for (const [name, s] of modStats) {
    s.overwrites = toRelations(overwritesCount.get(name));
    s.overwrittenBy = toRelations(overwrittenByCount.get(name));
  }

  return {
    conflicts,
    modStats,
    modsWithConflicts: modStats.size,
    totalConflicts: conflicts.length,
  };
}
