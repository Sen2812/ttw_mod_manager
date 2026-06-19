/**
 * Pluggable fetcher for Steam Workshop required mod IDs (UGC children).
 * Desktop registers a steamworks.js implementation at startup.
 */

import type { GameDefinition } from "../types";
import type { LogCallback } from "./mod-discovery";

export type WorkshopRequiredIdsFetcher = (
  ids: string[],
  game: GameDefinition,
  log?: LogCallback,
) => Promise<Map<string, string[]>>;

let fetcher: WorkshopRequiredIdsFetcher | null = null;

export function setWorkshopRequiredIdsFetcher(next: WorkshopRequiredIdsFetcher | null): void {
  fetcher = next;
}

export function getWorkshopRequiredIdsFetcher(): WorkshopRequiredIdsFetcher | null {
  return fetcher;
}

export async function fetchWorkshopRequiredIds(
  ids: string[],
  game: GameDefinition,
  log?: LogCallback,
): Promise<Map<string, string[]>> {
  if (ids.length === 0) return new Map();
  if (!fetcher) {
    throw new Error("Steam client fetcher not configured");
  }
  return fetcher(ids, game, log);
}
