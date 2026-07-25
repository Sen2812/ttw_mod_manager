import type { SupportedGame } from "../../types";

/** Built-in auxiliary feature identifiers. */
export type BuiltinFeatureId = "skipIntro" | "plbuff";

/**
 * How a feature is applied at launch:
 * - temp-pack: manager generates a minimal override pack (e.g. skip intro)
 * - bundled-pack: manager stages a pack shipped with the app
 * - external-pack: requires user-enabled external packs (e.g. MCT companion mod)
 */
export type BuiltinFeatureKind = "temp-pack" | "bundled-pack" | "external-pack";

export interface BuiltinFeatureDefinition {
  id: BuiltinFeatureId;
  games: SupportedGame[];
  kind: BuiltinFeatureKind;
  /** Legacy preference flag on UserPreferences. */
  preferenceKey: "isSkipIntroMoviesEnabled" | "isPlbuffInjectionEnabled";
  /** GameDefinition.supportedOptions entry gating this feature. */
  supportedOption: string;
}

export interface HeadPackRef {
  workDir: string;
  packName: string;
}

export interface ExternalPackRef {
  workDir?: string;
  packName: string;
}

import type { PlbuffOptions } from "./plbuff-config";

export interface BuiltinFeaturePreferences {
  isSkipIntroMoviesEnabled?: boolean;
  /** @deprecated Campaign helpers no longer inject packs. */
  isPlbuffInjectionEnabled?: boolean;
  /** @deprecated Options live in MCT. */
  plbuffOptions?: Partial<PlbuffOptions>;
}

export interface BuiltinFeatureStatus {
  id: BuiltinFeatureId;
  kind: BuiltinFeatureKind;
  available: boolean;
  enabled: boolean;
  bundled: boolean;
  /** Campaign helpers: MCT pack enabled. */
  mctEnabled?: boolean;
  /** Campaign helpers: companion mod enabled. */
  modEnabled?: boolean;
}

export interface PrepareBuiltinFeaturesOptions {
  gameId: SupportedGame;
  supportedOptions: string[];
  packHeader: string;
  introMoviePaths: string[];
  supportsCompression: boolean;
  appDataFolderName: string;
  dataDir: string;
  dataFolder: string;
  contentFolder?: string;
  resourcesRoot: string;
  preferences: BuiltinFeaturePreferences;
  enabledModNames: Iterable<string>;
}

export interface PrepareBuiltinFeaturesResult {
  headPacks: HeadPackRef[];
  externalPacks: ExternalPackRef[];
  warnings: string[];
  statuses: BuiltinFeatureStatus[];
}
