/**
 * Pluggable fetcher for currently subscribed Steam Workshop item IDs.
 * Desktop registers a steamworks.js implementation at startup.
 */

import type { GameDefinition } from "../types";
import type { LogCallback } from "./mod-discovery";

export type WorkshopSubscriptionsFetcher = (
  game: GameDefinition,
  log?: LogCallback,
) => Promise<string[]>;

let fetcher: WorkshopSubscriptionsFetcher | null = null;

export function setWorkshopSubscriptionsFetcher(next: WorkshopSubscriptionsFetcher | null): void {
  fetcher = next;
}

export async function fetchSubscribedWorkshopIds(
  game: GameDefinition,
  log?: LogCallback,
): Promise<string[]> {
  if (!fetcher) return [];
  try {
    const ids = await fetcher(game, log);
    if (ids.length > 0) {
      log?.(`Steam client: ${ids.length} subscribed workshop item(s)`);
    }
    return ids.filter(id => /^\d{5,15}$/.test(id));
  } catch (e) {
    log?.(`Steam client: subscribed items fetch failed: ${e}`);
    return [];
  }
}
