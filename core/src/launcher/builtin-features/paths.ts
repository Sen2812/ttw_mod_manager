import * as fs from "fs";
import * as path from "path";
import type { SupportedGame } from "../../types";

/** Path to a bundled feature pack under the app resources tree. */
export function getBundledFeaturePackPath(
  resourcesRoot: string,
  gameId: SupportedGame,
  packFileName: string,
): string {
  return path.join(resourcesRoot, "builtin-features", gameId, packFileName);
}

export function bundledFeaturePackExists(
  resourcesRoot: string,
  gameId: SupportedGame,
  packFileName: string,
): boolean {
  if (!resourcesRoot) return false;
  return fs.existsSync(getBundledFeaturePackPath(resourcesRoot, gameId, packFileName));
}

/** Pick the first candidate whose builtin-features/ folder exists. */
export function resolveBuiltinFeaturesResourcesRoot(candidates: string[]): string {
  for (const root of candidates) {
    if (root && fs.existsSync(path.join(root, "builtin-features"))) return root;
  }
  return candidates.find(Boolean) ?? "";
}

/** Copy a bundled pack into the manager data dir for used_mods injection. */
export function stageBundledPack(
  resourcesRoot: string,
  gameId: SupportedGame,
  packFileName: string,
  stagingDir: string,
): string | undefined {
  const source = getBundledFeaturePackPath(resourcesRoot, gameId, packFileName);
  if (!fs.existsSync(source)) return undefined;
  fs.mkdirSync(stagingDir, { recursive: true });
  const dest = path.join(stagingDir, packFileName);
  fs.copyFileSync(source, dest);
  return dest;
}
