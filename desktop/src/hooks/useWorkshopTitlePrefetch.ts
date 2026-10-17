import { useCallback, useEffect, useRef } from "react";
import { useStore } from "../store";
import type { Mod } from "../types";
import { isUsableWorkshopTitle, resolveModWorkshopId } from "@core/mod-manager/mod-display";

const DEBOUNCE_MS = 1200;
const BATCH_LIMIT = 20;
const RETRY_MS = 60_000;
const MAX_AUTO_RETRIES = 2;

function needsWorkshopTitle(mod: Mod): boolean {
  const id = resolveModWorkshopId(mod);
  return !!id && !isUsableWorkshopTitle(mod.humanName, id);
}

/** Queue on-demand workshop title lookups for visible mods that still have no usable name. */
export function useWorkshopTitlePrefetch(mods: Mod[]) {
  const setMods = useStore(s => s.setMods);
  const pendingIds = useRef(new Set<string>());
  const inFlightIds = useRef(new Set<string>());
  const retryCounts = useRef(new Map<string, number>());
  const timerRef = useRef<number | null>(null);
  const retryTimerRef = useRef<number | null>(null);
  const scheduleFlushRef = useRef<() => void>(() => {});
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

    let latest = modsRef.current;
    try {
      const result = await window.api.fetchWorkshopTitles(batch);
      if (result?.mods) {
        latest = result.mods;
        modsRef.current = result.mods;
        setMods(result.mods);
      }
    } catch (e) {
      console.error("Failed to fetch workshop titles:", e);
    } finally {
      for (const id of batch) inFlightIds.current.delete(id);
    }

    const byId = new Map<string, Mod>();
    for (const mod of latest) {
      const id = resolveModWorkshopId(mod);
      if (id) byId.set(id, mod);
    }
    const retryable: string[] = [];
    for (const id of batch) {
      const mod = byId.get(id);
      if (mod && !needsWorkshopTitle(mod)) {
        retryCounts.current.delete(id);
        continue;
      }
      const attempts = (retryCounts.current.get(id) ?? 0) + 1;
      retryCounts.current.set(id, attempts);
      if (attempts <= MAX_AUTO_RETRIES) retryable.push(id);
    }
    for (const id of retryable) pendingIds.current.add(id);
    const deferred = new Set(retryable);
    const hasReady = [...pendingIds.current].some(id => !deferred.has(id));
    if (hasReady) scheduleFlushRef.current();
    if (retryable.length === 0 || retryTimerRef.current != null) return;
    retryTimerRef.current = window.setTimeout(() => {
      retryTimerRef.current = null;
      void flush();
    }, RETRY_MS);
  }, [setMods]);

  const scheduleFlush = useCallback(() => {
    if (timerRef.current != null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      void flush();
    }, DEBOUNCE_MS);
  }, [flush]);
  scheduleFlushRef.current = scheduleFlush;

  const queueMods = useCallback((list: Mod[]) => {
    let added = false;
    for (const mod of list) {
      if (!needsWorkshopTitle(mod)) continue;
      const id = resolveModWorkshopId(mod);
      if (!id || inFlightIds.current.has(id) || pendingIds.current.has(id)) continue;
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
    if (retryTimerRef.current != null) window.clearTimeout(retryTimerRef.current);
  }, []);

  return { queueVisibleRange, queueWorkshopIds };
}
