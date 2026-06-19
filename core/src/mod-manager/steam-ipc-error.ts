/** True when Steamworks cannot connect (offline mode, not logged in, or client not running). */
export function isSteamIpcUnavailableError(e: unknown): boolean {
  if (e instanceof Error && e.name === "SteamIpcUnavailableError") return true;
  const msg = e instanceof Error ? e.message : String(e);
  return /ipc pipe|steam is probably not running|steam ipc unavailable/i.test(msg);
}

export function formatSteamFetchSkipReason(e: unknown): string {
  if (isSteamIpcUnavailableError(e)) {
    return "Steam IPC unavailable (client offline, not logged in, or not accepting connections)";
  }
  return e instanceof Error ? e.message : String(e);
}
