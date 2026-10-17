/**
 * Workshop page HTML helpers for display titles only.
 * Required mod IDs are fetched exclusively via the Steam client (see workshop-required-fetcher).
 */

import * as https from "https";
import { isSteamPlaceholderTitle } from "./mod-display";

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
    if (isSteamPlaceholderTitle(raw)) return undefined;
    return raw;
  }

  const itemTitle = html.match(/class="workshopItemTitle[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
  if (itemTitle?.[1]) {
    const title = decodeWorkshopHtmlEntities(stripHtmlTags(itemTitle[1]).trim());
    if (!isSteamPlaceholderTitle(title)) return title;
  }

  const modTitle = html.match(/id="modTitle"[^>]*>([\s\S]*?)<\/div>/i);
  if (modTitle?.[1]) {
    const title = decodeWorkshopHtmlEntities(stripHtmlTags(modTitle[1]).trim());
    if (!isSteamPlaceholderTitle(title)) return title;
  }

  return undefined;
}

/** Steam community responded with an error or rate-limit page instead of the item. */
export class WorkshopHtmlError extends Error {
  readonly statusCode?: number;
  readonly rateLimited: boolean;

  constructor(message: string, statusCode?: number, rateLimited = false) {
    super(message);
    this.name = "WorkshopHtmlError";
    this.statusCode = statusCode;
    this.rateLimited = rateLimited;
  }
}

export function htmlLooksLikeSteamError(html: string): boolean {
  if (/<title>\s*steam\s*(community|社区|社區)\s*::\s*(error|错误|錯誤)\s*<\/title>/i.test(html)) return true;
  if (/property="og:title"\s+content="steam\s*(community|社区|社區)\s*::\s*(error|错误|錯誤)"/i.test(html)) return true;
  return false;
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

/** Resolve Steam Workshop page language from environment (schinese for zh locales). */
export function resolveSteamWorkshopLanguage(): string {
  const candidates = [
    process.env.STEAM_WORKSHOP_LANG,
    process.env.LANG,
    process.env.LANGUAGE,
    typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().locale : undefined,
  ];
  for (const raw of candidates) {
    if (!raw) continue;
    const lower = raw.toLowerCase();
    if (lower.includes("zh")) return "schinese";
    if (lower.startsWith("en")) return "english";
  }
  return "english";
}

function finishWorkshopHtml(statusCode: number | undefined, body: string): string {
  const rateLimited = statusCode === 429 || statusCode === 403 || htmlLooksLikeSteamError(body);
  if (rateLimited) {
    throw new WorkshopHtmlError(
      `Steam workshop page blocked (${statusCode ?? "error page"})`,
      statusCode,
      true,
    );
  }
  if (statusCode && statusCode >= 400) {
    throw new WorkshopHtmlError(`Steam workshop page HTTP ${statusCode}`, statusCode, false);
  }
  return body;
}

/** Fetch a workshop item page (used for missing display titles only). */
export async function fetchWorkshopHtml(
  workshopId: string,
  language = resolveSteamWorkshopLanguage(),
): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "steamcommunity.com",
        path: `/sharedfiles/filedetails/?id=${workshopId}&l=${encodeURIComponent(language)}`,
        method: "GET",
        headers: {
          "User-Agent": USER_AGENT,
          "Accept-Language": language === "schinese" ? "zh-CN,zh;q=0.9" : "en-US,en;q=0.9",
          Cookie: WORKSHOP_COOKIE,
        },
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          const loc = res.headers.location;
          const url = loc.startsWith("http") ? new URL(loc) : new URL(loc, "https://steamcommunity.com");
          https.get(
            url.toString(),
            { headers: { "User-Agent": USER_AGENT } },
            (res2) => {
              const chunks: Buffer[] = [];
              res2.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
              res2.on("end", () => {
                try {
                  resolve(finishWorkshopHtml(res2.statusCode, Buffer.concat(chunks).toString("utf8")));
                } catch (e) {
                  reject(e);
                }
              });
            },
          ).on("error", reject);
          return;
        }
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
        res.on("end", () => {
          try {
            resolve(finishWorkshopHtml(res.statusCode, Buffer.concat(chunks).toString("utf8")));
          } catch (e) {
            reject(e);
          }
        });
      },
    );
    req.on("error", reject);
    req.end();
  });
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
