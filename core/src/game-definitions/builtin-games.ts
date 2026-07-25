/**
 * Built-in game definitions for all supported Total War titles.
 * These are pre-registered when the mod manager starts.
 */

import { GameDefinition } from "../types";

export const WH3: GameDefinition = {
  id: "wh3",
  displayName: "Warhammer 3",
  steamId: "1142710",
  processName: "Warhammer3.exe",
  gameFolder: "Total War WARHAMMER III",
  appDataFolderName: "Warhammer3",
  launcherGameId: "warhammer3",
  packHeader: "PFH5",
  supportsCompression: true,
  packWithDBTablesName: "db.pack",
  vanillaPacksData: [{ name: "data.pack" }, { name: "db.pack" }, { name: "data_script.pack" }],
  introMovies: [
    "movies\\epilepsy_warning\\epilepsy_warning_en.ca_vp8",
    "movies\\gam_int.ca_vp8",
    "movies\\startup_movie_01.ca_vp8",
    "movies\\startup_movie_02.ca_vp8",
    "movies\\startup_movie_03.ca_vp8",
    "movies\\startup_movie_04.ca_vp8",
  ],
  supportedOptions: ["MakeUnitsGenerals", "SkipIntroMovies", "PlbuffInjection", "ScriptLogging", "AutoStartCustomBattle"],
};

export const WH2: GameDefinition = {
  id: "wh2",
  displayName: "Warhammer 2",
  steamId: "594570",
  processName: "Warhammer2.exe",
  gameFolder: "Total War WARHAMMER II",
  appDataFolderName: "Warhammer2",
  launcherGameId: "warhammer2",
  packHeader: "PFH5",
  supportsCompression: true,
  packWithDBTablesName: "data.pack",
  vanillaPacksData: [{ name: "data.pack" }],
  introMovies: [],
  supportedOptions: ["ScriptLogging"],
};

export const THREE_KINGDOMS: GameDefinition = {
  id: "threeKingdoms",
  displayName: "Three Kingdoms",
  steamId: "779340",
  processName: "Three_Kingdoms.exe",
  gameFolder: "Total War Three Kingdoms",
  appDataFolderName: "ThreeKingdoms",
  launcherGameId: "threekingdoms",
  packHeader: "PFH5",
  supportsCompression: true,
  packWithDBTablesName: "database.pack",
  vanillaPacksData: [{ name: "data.pack" }, { name: "database.pack" }],
  introMovies: ["movies\\startup_movie_01.ca_vp8", "movies\\startup_movie_02.ca_vp8"],
  supportedOptions: ["SkipIntroMovies", "ScriptLogging"],
};

export const ATTILA: GameDefinition = {
  id: "attila",
  displayName: "Attila",
  steamId: "325610",
  processName: "Attila.exe",
  gameFolder: "Total War Attila",
  appDataFolderName: "Attila",
  launcherGameId: "attila",
  packHeader: "PFH4",
  supportsCompression: false,
  packWithDBTablesName: "data.pack",
  vanillaPacksData: [{ name: "data.pack" }],
  introMovies: [],
  supportedOptions: ["ScriptLogging"],
};

export const TROY: GameDefinition = {
  id: "troy",
  displayName: "Troy",
  steamId: "1099410",
  processName: "Troy.exe",
  gameFolder: "Total War Troy",
  appDataFolderName: "Troy",
  launcherGameId: "troy",
  packHeader: "PFH5",
  supportsCompression: true,
  packWithDBTablesName: "data.pack",
  vanillaPacksData: [{ name: "data.pack" }],
  introMovies: [],
  supportedOptions: ["ScriptLogging"],
};

export const PHARAOH: GameDefinition = {
  id: "pharaoh",
  displayName: "Pharaoh",
  steamId: "1937780",
  processName: "Pharaoh.exe",
  gameFolder: "Total War Pharaoh",
  appDataFolderName: "Pharaoh",
  launcherGameId: "pharaoh",
  packHeader: "PFH5",
  supportsCompression: true,
  packWithDBTablesName: "data.pack",
  vanillaPacksData: [{ name: "data.pack" }],
  introMovies: [],
  supportedOptions: ["ScriptLogging"],
};

export const DYNASTIES: GameDefinition = {
  id: "dynasties",
  displayName: "Pharaoh Dynasties",
  steamId: "2951630",
  processName: "Pharaoh.exe",
  gameFolder: "Total War PHARAOH DYNASTIES",
  appDataFolderName: "PharaohDynasties",
  launcherGameId: "pharaoh-dynasties",
  packHeader: "PFH5",
  supportsCompression: true,
  packWithDBTablesName: "data_db.pack",
  vanillaPacksData: [{ name: "data_db.pack" }],
  introMovies: [],
  supportedOptions: ["ScriptLogging"],
};

export const ROME2: GameDefinition = {
  id: "rome2",
  displayName: "Rome 2",
  steamId: "214950",
  processName: "Rome2.exe",
  gameFolder: "Total War Rome II",
  appDataFolderName: "Rome2",
  launcherGameId: "rome2",
  packHeader: "PFH4",
  supportsCompression: false,
  packWithDBTablesName: "data_rome2.pack",
  vanillaPacksData: [{ name: "data_rome2.pack" }],
  introMovies: [],
  supportedOptions: [],
};

export const SHOGUN2: GameDefinition = {
  id: "shogun2",
  displayName: "Shogun 2",
  steamId: "201270",
  processName: "shogun2.exe",
  gameFolder: "Total War SHOGUN 2",
  appDataFolderName: "Shogun2",
  launcherGameId: "shogun2",
  packHeader: "PFH3",
  supportsCompression: false,
  packWithDBTablesName: "data.pack",
  vanillaPacksData: [{ name: "data.pack" }, { name: "data_fots.pack" }],
  introMovies: [],
  supportedOptions: [],
};

/** All built-in game definitions */
export const BUILTIN_GAMES: GameDefinition[] = [
  WH3,
  WH2,
  THREE_KINGDOMS,
  ATTILA,
  TROY,
  PHARAOH,
  DYNASTIES,
  ROME2,
  SHOGUN2,
];
