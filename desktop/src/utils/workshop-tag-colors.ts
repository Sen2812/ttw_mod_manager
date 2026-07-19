import type { ModSourceType } from "@core/mod-manager/mod-display";

export interface TagColorStyle {
  bg: string;
  text: string;
  border: string;
}

/** Low-contrast Morandi-style palette for hash fallback. */
const TAG_PALETTE: TagColorStyle[] = [
  { bg: "#E8E4DF", text: "#7A7368", border: "#DAD4CC" },
  { bg: "#E3E8E4", text: "#6B776F", border: "#D0DAD4" },
  { bg: "#E5E4EA", text: "#747081", border: "#D5D3DC" },
  { bg: "#EAE6E0", text: "#877A6E", border: "#DDD6CC" },
  { bg: "#E0E6EA", text: "#6B7780", border: "#CCD6DD" },
  { bg: "#EAE4E0", text: "#857870", border: "#DDD4CC" },
  { bg: "#E4EAE6", text: "#708077", border: "#D0DDD6" },
  { bg: "#EAE8E0", text: "#807A6E", border: "#DDD8CC" },
  { bg: "#E6E2E8", text: "#776F7A", border: "#D6D0D9" },
  { bg: "#E2E8E6", text: "#6E7A76", border: "#CDDAD5" },
  { bg: "#E8E0E4", text: "#7A7074", border: "#DAD0D4" },
  { bg: "#E0E4E8", text: "#6E747C", border: "#CCD2DA" },
  { bg: "#E8E6E0", text: "#7A776E", border: "#DAD6CC" },
  { bg: "#E4E0E8", text: "#726E7A", border: "#D0CCD8" },
];

/** Semantic colors for common Steam Workshop tags (keys normalized). */
const TAG_OVERRIDES: Record<string, TagColorStyle> = {
  campaign: { bg: "#EAE3D8", text: "#8A7560", border: "#DDD2C4" },
  graphical: { bg: "#DEE6EB", text: "#627585", border: "#C8D4DD" },
  graphics: { bg: "#DEE6EB", text: "#627585", border: "#C8D4DD" },
  units: { bg: "#E0E8E2", text: "#667A6C", border: "#CCDAD2" },
  unit: { bg: "#E0E8E2", text: "#667A6C", border: "#CCDAD2" },
  battle: { bg: "#EAE0DC", text: "#856E66", border: "#DACCCE" },
  battles: { bg: "#EAE0DC", text: "#856E66", border: "#DACCCE" },
  map: { bg: "#E8E4D6", text: "#7E765E", border: "#DAD4C4" },
  maps: { bg: "#E8E4D6", text: "#7E765E", border: "#DAD4C4" },
  ui: { bg: "#E4E2EA", text: "#6F6A7A", border: "#D0CDD8" },
  interface: { bg: "#E4E2EA", text: "#6F6A7A", border: "#D0CDD8" },
  audio: { bg: "#DCE8E6", text: "#5F7874", border: "#C6DAD6" },
  sound: { bg: "#DCE8E6", text: "#5F7874", border: "#C6DAD6" },
  music: { bg: "#E0E6EA", text: "#667480", border: "#CCD4DC" },
  translation: { bg: "#E2E8E0", text: "#6A7868", border: "#CEDAD0" },
  translations: { bg: "#E2E8E0", text: "#6A7868", border: "#CEDAD0" },
  localization: { bg: "#E2E8E0", text: "#6A7868", border: "#CEDAD0" },
  localisation: { bg: "#E2E8E0", text: "#6A7868", border: "#CEDAD0" },
  gameplay: { bg: "#E6E0D8", text: "#776A5E", border: "#D4CCC2" },
  overhaul: { bg: "#E8DDD8", text: "#826A62", border: "#D8CAC4" },
  minor: { bg: "#E8E6E2", text: "#78746C", border: "#DAD6D0" },
  fix: { bg: "#EAE2DC", text: "#84766A", border: "#DAD0C8" },
  bugfix: { bg: "#EAE2DC", text: "#84766A", border: "#DAD0C8" },
  script: { bg: "#E2E4EA", text: "#6A6E7A", border: "#CED2DC" },
  scripting: { bg: "#E2E4EA", text: "#6A6E7A", border: "#CED2DC" },
  lore: { bg: "#E8E0E6", text: "#7A6E76", border: "#DAD0D8" },
  faction: { bg: "#E6E2DC", text: "#746C62", border: "#D4CCC2" },
  factions: { bg: "#E6E2DC", text: "#746C62", border: "#D4CCC2" },
  building: { bg: "#E4E0D6", text: "#726A5E", border: "#D0C8BC" },
  buildings: { bg: "#E4E0D6", text: "#726A5E", border: "#D0C8BC" },
  items: { bg: "#E6E4DC", text: "#747060", border: "#D4D0C6" },
  item: { bg: "#E6E4DC", text: "#747060", border: "#D4D0C6" },
  skills: { bg: "#DEE6E2", text: "#5E7868", border: "#C8DAD0" },
  skill: { bg: "#DEE6E2", text: "#5E7868", border: "#C8DAD0" },
  animation: { bg: "#E6E2E8", text: "#726A76", border: "#D4CCD8" },
  animations: { bg: "#E6E2E8", text: "#726A76", border: "#D4CCD8" },
  portrait: { bg: "#EAE2E4", text: "#806A70", border: "#DACCCE" },
  portraits: { bg: "#EAE2E4", text: "#806A70", border: "#DACCCE" },
  reskin: { bg: "#E4E6EA", text: "#6A6E78", border: "#D0D4DC" },
  reskins: { bg: "#E4E6EA", text: "#6A6E78", border: "#D0D4DC" },
  compatibility: { bg: "#E0E8E4", text: "#627A6E", border: "#CCDAD2" },
  compatible: { bg: "#E0E8E4", text: "#627A6E", border: "#CCDAD2" },
  multiplayer: { bg: "#DDE6EA", text: "#5E7480", border: "#C8D4DC" },
  ai: { bg: "#E2E6EA", text: "#686E78", border: "#CED4DC" },
  balance: { bg: "#E8E4DC", text: "#7A7268", border: "#DAD4C8" },
  rebalance: { bg: "#E8E4DC", text: "#7A7268", border: "#DAD4C8" },
  weather: { bg: "#DCE6EA", text: "#5E7480", border: "#C6D4DC" },
  terrain: { bg: "#E0E6DC", text: "#687662", border: "#CCD4C6" },
  vfx: { bg: "#E4E0EA", text: "#6E6878", border: "#D0CCD8" },
  effects: { bg: "#E4E0EA", text: "#6E6878", border: "#D0CCD8" },
  cinematic: { bg: "#E6E0E4", text: "#746870", border: "#D4CCD4" },
  cinematics: { bg: "#E6E0E4", text: "#746870", border: "#D4CCD4" },
  movie: { bg: "#E6E0E4", text: "#746870", border: "#D4CCD4" },
  movies: { bg: "#E6E0E4", text: "#746870", border: "#D4CCD4" },
  total_conversion: { bg: "#E8DCD8", text: "#826660", border: "#D8C8C4" },
  submod: { bg: "#E6E4DE", text: "#726C62", border: "#D4D0C6" },
  patch: { bg: "#EAE4DC", text: "#807466", border: "#DAD2C8" },
  tool: { bg: "#E2E4E0", text: "#686E68", border: "#CED4CE" },
  tools: { bg: "#E2E4E0", text: "#686E68", border: "#CED4CE" },
  database: { bg: "#E0E4E8", text: "#646E78", border: "#CCD2DA" },
  db: { bg: "#E0E4E8", text: "#646E78", border: "#CCD2DA" },
  names: { bg: "#E6E4E0", text: "#726E66", border: "#D4D0C8" },
  voice: { bg: "#DCE8E4", text: "#5C7870", border: "#C6DAD2" },
  texture: { bg: "#E4E2DE", text: "#6E6A62", border: "#D0CCC4" },
  textures: { bg: "#E4E2DE", text: "#6E6A62", border: "#D0CCC4" },
  model: { bg: "#E2E6E4", text: "#66706A", border: "#CED6D0" },
  models: { bg: "#E2E6E4", text: "#66706A", border: "#CED6D0" },
  historical: { bg: "#E8E2D8", text: "#7A6E5E", border: "#DAD2C4" },
  fantasy: { bg: "#E6E0EA", text: "#706878", border: "#D4CCD8" },
  cheat: { bg: "#EAE0DC", text: "#846E68", border: "#DACCCE" },
  quick_battle: { bg: "#E6DED8", text: "#766860", border: "#D4C8C0" },
  custom: { bg: "#E4E2DC", text: "#6E6A60", border: "#D0CCC2" },
  compilation: { bg: "#E6E2DC", text: "#726A60", border: "#D4CCC2" },
  compilations: { bg: "#E6E2DC", text: "#726A60", border: "#D4CCC2" },
  landscape: { bg: "#E0E6D8", text: "#647060", border: "#CCD4C4" },
  environment: { bg: "#E0E8DE", text: "#627662", border: "#CCD6CA" },
  character: { bg: "#EAE2E0", text: "#7A6E6A", border: "#DACCCE" },
  characters: { bg: "#EAE2E0", text: "#7A6E6A", border: "#DACCCE" },
  hero: { bg: "#E8E0D8", text: "#786E60", border: "#D8CCC2" },
  heroes: { bg: "#E8E0D8", text: "#786E60", border: "#D8CCC2" },
  lord: { bg: "#E6E0D6", text: "#746A5C", border: "#D4CCC0" },
  lords: { bg: "#E6E0D6", text: "#746A5C", border: "#D4CCC0" },
  agent: { bg: "#E2E6E8", text: "#646C72", border: "#CED4DA" },
  agents: { bg: "#E2E6E8", text: "#646C72", border: "#CED4DA" },
  technology: { bg: "#DEE6EA", text: "#5E7480", border: "#C8D4DC" },
  technologies: { bg: "#DEE6EA", text: "#5E7480", border: "#C8D4DC" },
  ritual: { bg: "#E6E0E8", text: "#706878", border: "#D4CCD8" },
  rituals: { bg: "#E6E0E8", text: "#706878", border: "#D4CCD8" },
  spell: { bg: "#E4E0EA", text: "#6C6878", border: "#D0CCD8" },
  spells: { bg: "#E4E0EA", text: "#6C6878", border: "#D0CCD8" },
  magic: { bg: "#E6E2EA", text: "#6E6878", border: "#D4CCD8" },
  difficulty: { bg: "#E8E2DC", text: "#7A6E64", border: "#DAD2C8" },
  quality_of_life: { bg: "#E0E8E2", text: "#5E7866", border: "#CCDAD0" },
  qol: { bg: "#E0E8E2", text: "#5E7866", border: "#CCDAD0" },
  mod: { bg: "#E8E6E2", text: "#78746C", border: "#DAD6D0" },
};

/** Dedicated source badge colors — warmer local vs cooler workshop, kept soft/low-contrast. */
const SOURCE_COLORS: Record<ModSourceType, TagColorStyle> = {
  workshop: { bg: "#D6E2EA", text: "#4E6678", border: "#B4CCD8" },
  local: { bg: "#EAE4D6", text: "#7A684E", border: "#D8CEBC" },
};

function normalizeTagKey(tag: string): string {
  return tag.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

/** Stable soft color for a workshop tag string. */
export function getWorkshopTagColor(tag: string): TagColorStyle {
  const key = normalizeTagKey(tag);
  return TAG_OVERRIDES[key] ?? TAG_PALETTE[hashString(key) % TAG_PALETTE.length];
}

export function getModSourceColor(source: ModSourceType): TagColorStyle {
  return SOURCE_COLORS[source];
}
