/**
 * Fetch Steam Workshop item prerequisites (Required Items) from the public page.
 * Cached alongside other workshop metadata.
 */

import * as https from "https";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/** Cookies that bypass Steam age gates for mature workshop items. */
const WORKSHOP_COOKIE =
  "birthtime=568022401; lastagecheckage=1-January-1990; mature_content=1; wants_mature_content=1";

/** Parse workshop item title from a filedetails HTML page. */
export function parseWorkshopTitle(html: string): string | undefined {
  const og = html.match(/property="og:title"\s+content="([^"]+)"/i);
  if (og?.[1]) {
    const raw = decodeWorkshopHtmlEntities(og[1].trim());
    const wsMatch = raw.match(/^Steam Workshop::\s*(.+)$/i);
    if (wsMatch?.[1]) return wsMatch[1].trim();
    if (isRejectedSteamPlaceholderTitle(raw)) return undefined;
    return raw;
  }

  const itemTitle = html.match(/class="workshopItemTitle[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
  if (itemTitle?.[1]) {
    const title = decodeWorkshopHtmlEntities(stripHtmlTags(itemTitle[1]).trim());
    if (!isRejectedSteamPlaceholderTitle(title)) return title;
  }

  const modTitle = html.match(/id="modTitle"[^>]*>([\s\S]*?)<\/div>/i);
  if (modTitle?.[1]) {
    const title = decodeWorkshopHtmlEntities(stripHtmlTags(modTitle[1]).trim());
    if (!isRejectedSteamPlaceholderTitle(title)) return title;
  }

  return undefined;
}

function isRejectedSteamPlaceholderTitle(title: string): boolean {
  return /^steam community :: error$/i.test(title)
    || /^steam workshop$/i.test(title)
    || /^login$/i.test(title);
}

function stripHtmlTags(value: string): string {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function decodeWorkshopHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

/** Parse Required Items section from a workshop filedetails HTML page. */
export function parseRequiredWorkshopIds(html: string, selfId?: string): string[] {
  const ids = new Set<string>();

  // Legacy layout: <div id="RequiredItems">…</div>
  const requiredBlock = html.match(/id="RequiredItems"[\s\S]*?(?=<\/div>\s*<\/div>|<div id=")/i);
  if (requiredBlock) {
    for (const m of requiredBlock[0].matchAll(/filedetails\/\?id=(\d{5,15})/gi)) {
      ids.add(m[1]);
    }
  }

  // Fallback: links tagged as required-item in newer layouts
  for (const m of html.matchAll(/class="[^"]*required[^"]*"[^>]*href="[^"]*filedetails\/\?id=(\d{5,15})/gi)) {
    ids.add(m[1]);
  }

  if (selfId) ids.delete(selfId);
  return [...ids];
}

export async function fetchWorkshopHtml(workshopId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "steamcommunity.com",
        path: `/sharedfiles/filedetails/?id=${workshopId}&l=english`,
        method: "GET",
        headers: {
          "User-Agent": USER_AGENT,
          "Accept-Language": "en-US,en;q=0.9",
          Cookie: WORKSHOP_COOKIE,
        },
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          // Follow one redirect manually
          const loc = res.headers.location;
          const url = loc.startsWith("http") ? new URL(loc) : new URL(loc, "https://steamcommunity.com");
          https.get(
            url.toString(),
            { headers: { "User-Agent": USER_AGENT } },
            (res2) => {
              let body = "";
              res2.on("data", (c) => { body += c; });
              res2.on("end", () => resolve(body));
            },
          ).on("error", reject);
          return;
        }
        let body = "";
        res.on("data", (c) => { body += c; });
        res.on("end", () => resolve(body));
      },
    );
    req.on("error", reject);
    req.end();
  });
}

/** Fetch prerequisite workshop IDs for one item (network). */
export async function fetchWorkshopRequiredIds(workshopId: string): Promise<string[]> {
  const html = await fetchWorkshopHtml(workshopId);
  return parseRequiredWorkshopIds(html, workshopId);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** @deprecated Use sequential fetch with sleep instead of concurrent pool for Steam requests. */
export async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;

  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}
