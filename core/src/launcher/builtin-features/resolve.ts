import * as path from "path";

import { START_GAME_PACK_DIR, START_GAME_PACK_NAME, writeSkipIntroPack } from "../start-game-pack";

import { BUILTIN_FEATURES, BUILTIN_FEATURES_STAGING_DIR } from "./registry";

import {
  getCampaignHelpersAvailability,
} from "./plbuff";

import type {
  BuiltinFeatureStatus,
  PrepareBuiltinFeaturesOptions,
  PrepareBuiltinFeaturesResult,
} from "./types";

function isFeatureEnabled(
  preferences: PrepareBuiltinFeaturesOptions["preferences"],
  preferenceKey: "isSkipIntroMoviesEnabled" | "isPlbuffInjectionEnabled",
): boolean {
  return !!preferences[preferenceKey];
}

/** Inspect built-in features for the features page (no staging). */
export function getBuiltinFeatureStatuses(
  options: {
    gameId: PrepareBuiltinFeaturesOptions["gameId"];
    supportedOptions: string[];
    resourcesRoot: string;
    dataFolder?: string;
    contentFolder?: string;
    preferences: PrepareBuiltinFeaturesOptions["preferences"];
    introMoviePaths: string[];
    enabledModNames?: Iterable<string>;
  },
): BuiltinFeatureStatus[] {
  const statuses: BuiltinFeatureStatus[] = [];
  const enabledNames = options.enabledModNames ?? [];

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
        mctEnabled: false,
        modEnabled: false,
      });
      continue;
    }

    if (feature.id === "plbuff") {
      const avail = getCampaignHelpersAvailability(supported, enabledNames);
      statuses.push({
        id: feature.id,
        kind: feature.kind,
        available: avail.available,
        enabled: avail.available,
        bundled: false,
        mctEnabled: avail.mctEnabled,
        modEnabled: avail.modEnabled,
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
      continue;
    }

    // Campaign helpers: user enables MCT + companion mod themselves — no injection.
  }

  const statuses = getBuiltinFeatureStatuses({
    gameId: options.gameId,
    supportedOptions: options.supportedOptions,
    resourcesRoot: options.resourcesRoot,
    dataFolder: options.dataFolder,
    preferences: options.preferences,
    introMoviePaths: options.introMoviePaths,
    enabledModNames: options.enabledModNames,
  });

  return { headPacks, externalPacks, warnings, statuses };
}
