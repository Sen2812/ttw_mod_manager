/**
 * On-demand workshop display titles.
 *
 * Prefer the Steam Web API (one POST per batch). HTML scraping of steamcommunity.com
 * is a last resort: those pages are what trip Steam's traffic limits, and a rate-limit
 * response is an error page whose <title> is not a mod name.
 */

import type { Mod } from "../types";
import { applyWorkshopTitle, isUsableWorkshopTitle } from "./mod-display";
import { fetchWorkshopMetadata } from "./mod-discovery";
import {
  fetchWorkshopHtml,
  parseWorkshopTitle,
  resolveSteamWorkshopLanguage,
  sleep,
  WorkshopHtmlError,
} from "./workshop-dependencies";
import { WorkshopCache } from "./workshop-cache";

type LogCallback = (msg: string) => void;

/** Pause between community HTML requests so a missing-title fallback cannot burst. */
const HTML_GAP_MS = 1500;

/** Fetch workshop page titles for the given IDs; mutates matching mods in-place. */
export async function fetchWorkshopTitlesForIds(
  mods: Mod[],
  workshopIds: string[],
  cacheDir: string,
  log?: LogCallback,
): Promise<number> {
  const idSet = new Set(workshopIds.filter(id => /^\d{5,15}$/.test(id)));
  if (idSet.size === 0) return 0;

  const pending = mods.filter(
    m => idSet.has(m.workshopId) && !isUsableWorkshopTitle(m.humanName, m.workshopId),
  );
  if (pending.length === 0) return 0;

  const cache = new WorkshopCache(cacheDir).load(log);
  let applied = 0;

  for (const mod of pending) {
    if (applyWorkshopTitle(mod, cache.get(mod.workshopId)?.title)) applied++;
  }

  const needsApi = pending.filter(m => !isUsableWorkshopTitle(m.humanName, m.workshopId));
  if (needsApi.length === 0) return applied;

  const needsFetch = new Set(cache.idsNeedingMetadata(needsApi.map(m => m.workshopId), "routine"));
  const apiAnswered = new Set<string>();
  if (needsFetch.size > 0) {
    try {
      const fetched = await fetchWorkshopMetadata([...needsFetch], log);
      const patches: [string, { title?: string; creator?: string; tags?: { tag: string }[] | string[]; timeUpdated?: number; previewUrl?: string; consumerAppId?: number }][] = [];
      for (const [id, data] of fetched) {
        apiAnswered.add(id);
        if (data.apiResult && data.apiResult !== 1) {
          cache.setMetadataUnavailable(id, data.apiResult);
          continue;
        }
        patches.push([id, data]);
      }
      if (patches.length > 0) cache.mergeMetadata(patches);
      if (patches.length > 0 || fetched.size > 0) cache.save();
    } catch (e) {
      log?.(`Workshop titles: metadata API failed: ${e}`);
    }
  }

  for (const mod of needsApi) {
    if (applyWorkshopTitle(mod, cache.get(mod.workshopId)?.title)) applied++;
  }

  // HTML only when the Web API answered and still had no title.
  // A failed or rate-limited API call must not fall through into community page scraping.
  const needsHtml = needsApi.filter((mod) => {
    if (isUsableWorkshopTitle(mod.humanName, mod.workshopId)) return false;
    if (cache.get(mod.workshopId)?.metadataUnavailable) return false;
    if (needsFetch.has(mod.workshopId)) return apiAnswered.has(mod.workshopId);
    return true;
  });
  if (needsHtml.length === 0) {
    if (applied > 0) log?.(`Workshop titles: resolved ${applied} name(s)`);
    return applied;
  }

  const preferredLang = resolveSteamWorkshopLanguage();
  let rateLimited = false;
  const htmlPatches: [string, { title: string }][] = [];

  for (const mod of needsHtml) {
    if (rateLimited) break;
    try {
      const title = await fetchTitleFromHtml(mod.workshopId, preferredLang);
      if (applyWorkshopTitle(mod, title)) {
        htmlPatches.push([mod.workshopId, { title: mod.humanName }]);
        applied++;
      }
    } catch (e) {
      if (e instanceof WorkshopHtmlError && e.rateLimited) {
        rateLimited = true;
        log?.("Workshop titles: Steam rate-limited the community page; leftover names stay unresolved for a later retry");
      } else {
        log?.(`Failed to fetch workshop title for ${mod.workshopId}: ${e}`);
      }
    }
    if (!rateLimited) await sleep(HTML_GAP_MS);
  }

  if (htmlPatches.length > 0) {
    cache.mergeMetadata(htmlPatches);
    cache.save();
  }
  if (applied > 0) log?.(`Workshop titles: resolved ${applied} name(s)`);
  return applied;
}

async function fetchTitleFromHtml(workshopId: string, preferredLang: string): Promise<string | undefined> {
  const html = await fetchWorkshopHtml(workshopId, preferredLang);
  const title = parseWorkshopTitle(html);
  if (title || preferredLang === "english") return title;
  const english = await fetchWorkshopHtml(workshopId, "english");
  return parseWorkshopTitle(english);
}
