import type { SupportedGame } from "../../types";

/** Built-in auxiliary feature identifiers. */
export type BuiltinFeatureId = "skipIntro";

/**
 * How a feature is applied at launch:
 * - temp-pack: manager generates a minimal override pack (e.g. skip intro)
 * - bundled-pack: manager stages a pack shipped with the app
 * - external-pack: requires user-enabled external packs
 */
export type BuiltinFeatureKind = "temp-pack" | "bundled-pack" | "external-pack";

export interface BuiltinFeatureDefinition {
  id: BuiltinFeatureId;
  games: SupportedGame[];
  kind: BuiltinFeatureKind;
  /** Preference flag on UserPreferences. */
  preferenceKey: "isSkipIntroMoviesEnabled";
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
  /** @deprecated Unused — campaign helpers are an external MCT mod. */
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
