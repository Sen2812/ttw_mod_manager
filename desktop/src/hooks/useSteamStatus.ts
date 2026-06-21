import { useEffect, useState } from "react";

export type SteamClientState = "not_installed" | "not_running" | "offline" | "online";

export interface SteamStatusSnapshot {
  installed: boolean;
  running: boolean;
  ipcAvailable: boolean;
  state: SteamClientState;
}

const POLL_MS = 30_000;

export function useSteamStatus(): SteamStatusSnapshot | null {
  const [status, setStatus] = useState<SteamStatusSnapshot | null>(null);

  useEffect(() => {
    if (!window.api.getSteamStatus) return;

    let cancelled = false;
    const refresh = () => {
      void window.api.getSteamStatus?.().then((s) => {
        if (!cancelled) setStatus(s);
      }).catch(() => {
        if (!cancelled) setStatus(null);
      });
    };

    refresh();
    const timer = setInterval(refresh, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return status;
}

export function isSteamWorkshopOnline(status: SteamStatusSnapshot | null): boolean {
  return status?.state === "online";
}
