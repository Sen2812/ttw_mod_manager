import type { BuiltinFeatureDefinition } from "./types";

export const BUILTIN_FEATURES: BuiltinFeatureDefinition[] = [
  {
    id: "skipIntro",
    games: ["wh3", "threeKingdoms"],
    kind: "temp-pack",
    preferenceKey: "isSkipIntroMoviesEnabled",
    supportedOption: "SkipIntroMovies",
  },
  {
    id: "plbuff",
    games: ["wh3"],
    kind: "external-pack",
    preferenceKey: "isPlbuffInjectionEnabled",
    supportedOption: "PlbuffInjection",
  },
];

export const BUILTIN_FEATURES_STAGING_DIR = "temp-packs/builtin";
