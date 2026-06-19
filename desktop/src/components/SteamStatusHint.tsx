import { useEffect, useState } from "react";
import clsx from "clsx";
import { useT } from "../i18n";

const POLL_MS = 30_000;

type SteamStatus = {
  installed: boolean;
  running: boolean;
  ipcAvailable: boolean;
  state: "not_installed" | "not_running" | "offline" | "online";
};

export default function SteamStatusHint() {
  const t = useT();
  const [status, setStatus] = useState<SteamStatus | null>(null);

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

  if (!status?.installed) return null;

  const tooltip = status.state === "online"
    ? t("steamStatus.runningTooltip")
    : status.state === "offline"
      ? t("steamStatus.offlineTooltip")
      : t("steamStatus.notRunningTooltip");

  const dotClass = status.state === "online"
    ? "bg-morandi-success"
    : status.state === "offline"
      ? "bg-morandi-warning"
      : "bg-morandi-text-muted/50";

  return (
    <div
      className="titlebar-no-drag flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs text-morandi-text-muted select-none"
      title={tooltip}
    >
      <span className={clsx("w-2 h-2 rounded-full shrink-0", dotClass)} />
      <span>{t("steamStatus.label")}</span>
    </div>
  );
}
