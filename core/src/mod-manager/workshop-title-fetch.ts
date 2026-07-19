/**
 * On-demand Steam Workshop HTML title fetch (fallback when API metadata has no title).
 */

import type { Mod } from "../types";
import { applyWorkshopTitle, isUsableWorkshopTitle } from "./mod-display";
import { fetchWorkshopHtml, parseWorkshopTitle, resolveSteamWorkshopLanguage } from "./workshop-dependencies";
import { WorkshopCache } from "./workshop-cache";

type LogCallback = (msg: string) => void;

const DEFAULT_CONCURRENCY = 4;

async function mapWithConcurrency<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  if (items.length === 0) return;
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const i = nextIndex++;
      await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
}

/** Fetch workshop page titles for the given IDs; mutates matching mods in-place. */
export async function fetchWorkshopTitlesForIds(
  mods: Mod[],
  workshopIds: string[],
  cacheDir: string,
  log?: LogCallback,
  options: { concurrency?: number } = {},
): Promise<number> {
  const idSet = new Set(workshopIds.filter(id => /^\d{5,15}$/.test(id)));
  if (idSet.size === 0) return 0;

  const pending = mods.filter(
    m => idSet.has(m.workshopId) && !isUsableWorkshopTitle(m.humanName, m.workshopId),
  );
  if (pending.length === 0) return 0;

  const cache = new WorkshopCache(cacheDir).load(log);
  const preferredLang = resolveSteamWorkshopLanguage();
  let applied = 0;

  await mapWithConcurrency(pending, options.concurrency ?? DEFAULT_CONCURRENCY, async (mod) => {
    try {
      let html = await fetchWorkshopHtml(mod.workshopId, preferredLang);
      let title = parseWorkshopTitle(html);
      if (!applyWorkshopTitle(mod, title) && preferredLang !== "english") {
        html = await fetchWorkshopHtml(mod.workshopId, "english");
        title = parseWorkshopTitle(html);
        applyWorkshopTitle(mod, title);
      }
      if (isUsableWorkshopTitle(mod.humanName, mod.workshopId)) {
        cache.mergeMetadata([[mod.workshopId, { title: mod.humanName }]]);
        applied++;
      }
    } catch (e) {
      log?.(`Failed to fetch workshop title for ${mod.workshopId}: ${e}`);
    }
  });

  if (applied > 0) cache.save();
  if (applied > 0) log?.(`Workshop titles: fetched ${applied} name(s) on demand`);
  return applied;
}
