import { useCallback, useEffect, useRef } from "react";
import { useStore } from "../store";
import type { Mod } from "../types";
import { isUsableWorkshopTitle, resolveModWorkshopId } from "@core/mod-manager/mod-display";

const DEBOUNCE_MS = 350;
const BATCH_LIMIT = 24;

function needsWorkshopTitle(mod: Mod): boolean {
  const id = resolveModWorkshopId(mod);
  return !!id && !isUsableWorkshopTitle(mod.humanName, id);
}

/** Queue on-demand concurrent workshop HTML title fetches for visible mods. */
export function useWorkshopTitlePrefetch(mods: Mod[]) {
  const setMods = useStore(s => s.setMods);
  const pendingIds = useRef(new Set<string>());
  const inFlightIds = useRef(new Set<string>());
  const timerRef = useRef<number | null>(null);
  const modsRef = useRef(mods);
  modsRef.current = mods;

  const flush = useCallback(async () => {
    if (!window.api?.fetchWorkshopTitles) return;
    const batch = [...pendingIds.current]
      .filter(id => !inFlightIds.current.has(id))
      .slice(0, BATCH_LIMIT);
    if (batch.length === 0) return;

    for (const id of batch) {
      pendingIds.current.delete(id);
      inFlightIds.current.add(id);
    }

    try {
      const result = await window.api.fetchWorkshopTitles(batch);
      if (result?.mods) setMods(result.mods);
    } catch (e) {
      console.error("Failed to fetch workshop titles:", e);
    } finally {
      for (const id of batch) inFlightIds.current.delete(id);
    }
  }, [setMods]);

  const scheduleFlush = useCallback(() => {
    if (timerRef.current != null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      void flush();
    }, DEBOUNCE_MS);
  }, [flush]);

  const queueMods = useCallback((list: Mod[]) => {
    let added = false;
    for (const mod of list) {
      if (!needsWorkshopTitle(mod)) continue;
      const id = resolveModWorkshopId(mod);
      if (!id || inFlightIds.current.has(id)) continue;
      pendingIds.current.add(id);
      added = true;
    }
    if (added) scheduleFlush();
  }, [scheduleFlush]);

  const queueVisibleRange = useCallback((list: Mod[], startIndex: number, endIndex: number) => {
    if (list.length === 0) return;
    const start = Math.max(0, startIndex);
    const end = Math.min(list.length - 1, endIndex);
    queueMods(list.slice(start, end + 1));
  }, [queueMods]);

  const queueWorkshopIds = useCallback((workshopIds: string[]) => {
    const byId = new Map<string, Mod>();
    for (const mod of modsRef.current) {
      const id = resolveModWorkshopId(mod);
      if (id) byId.set(id, mod);
    }
    const toFetch: Mod[] = [];
    for (const id of workshopIds) {
      const mod = byId.get(id);
      if (mod && needsWorkshopTitle(mod)) toFetch.push(mod);
    }
    queueMods(toFetch);
  }, [queueMods]);

  useEffect(() => () => {
    if (timerRef.current != null) window.clearTimeout(timerRef.current);
  }, []);

  return { queueVisibleRange, queueWorkshopIds };
}
