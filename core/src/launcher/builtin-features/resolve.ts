import * as path from "path";

import { START_GAME_PACK_DIR, START_GAME_PACK_NAME, writeSkipIntroPack } from "../start-game-pack";

import { BUILTIN_FEATURES, BUILTIN_FEATURES_STAGING_DIR } from "./registry";

import type {
  BuiltinFeatureStatus,
  PrepareBuiltinFeaturesOptions,
  PrepareBuiltinFeaturesResult,
} from "./types";

function isFeatureEnabled(
  preferences: PrepareBuiltinFeaturesOptions["preferences"],
  preferenceKey: "isSkipIntroMoviesEnabled",
): boolean {
  return !!preferences[preferenceKey];
}

/** Inspect built-in features for the features page (no staging). */
export function getBuiltinFeatureStatuses(
  options: {
    gameId: PrepareBuiltinFeaturesOptions["gameId"];
    supportedOptions: string[];
    preferences: PrepareBuiltinFeaturesOptions["preferences"];
    introMoviePaths: string[];
  },
): BuiltinFeatureStatus[] {
  const statuses: BuiltinFeatureStatus[] = [];

  for (const feature of BUILTIN_FEATURES) {
    if (!feature.games.includes(options.gameId)) continue;

    const supported = options.supportedOptions.includes(feature.supportedOption);

    if (feature.id === "skipIntro") {
      const hasMovies = options.introMoviePaths?.length > 0;
      statuses.push({
        id: feature.id,
        kind: feature.kind,
        available: supported && hasMovies,
        enabled: isFeatureEnabled(options.preferences, feature.preferenceKey),
        bundled: true,
      });
    }
  }

  return statuses;
}

/** Stage temp packs and collect external injections for launch. */
export function prepareBuiltinFeaturesForLaunch(
  options: PrepareBuiltinFeaturesOptions,
): PrepareBuiltinFeaturesResult {
  const headPacks: PrepareBuiltinFeaturesResult["headPacks"] = [];
  const externalPacks: PrepareBuiltinFeaturesResult["externalPacks"] = [];
  const warnings: string[] = [];
  const stagingRoot = path.join(options.dataDir, BUILTIN_FEATURES_STAGING_DIR);
  void stagingRoot;

  for (const feature of BUILTIN_FEATURES) {
    if (!feature.games.includes(options.gameId)) continue;
    if (!options.supportedOptions.includes(feature.supportedOption)) continue;

    if (feature.id === "skipIntro") {
      if (!isFeatureEnabled(options.preferences, feature.preferenceKey)) continue;
      if (options.introMoviePaths.length === 0) continue;

      const tempPackDir = path.join(options.dataDir, START_GAME_PACK_DIR);
      const tempPackPath = path.join(tempPackDir, START_GAME_PACK_NAME);
      try {
        writeSkipIntroPack(tempPackPath, {
          packHeader: options.packHeader,
          introMoviePaths: options.introMoviePaths,
          supportsCompression: options.supportsCompression,
        });
        headPacks.push({ workDir: tempPackDir, packName: START_GAME_PACK_NAME });
      } catch (e) {
        warnings.push(`Failed to write skip-intro pack: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  const statuses = getBuiltinFeatureStatuses({
    gameId: options.gameId,
    supportedOptions: options.supportedOptions,
    preferences: options.preferences,
    introMoviePaths: options.introMoviePaths,
  });

  return { headPacks, externalPacks, warnings, statuses };
}
