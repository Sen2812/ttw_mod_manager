import { useSteamStatus } from "../hooks/useSteamStatus";
import clsx from "clsx";
import { useT } from "../i18n";

export default function SteamStatusHint() {
  const t = useT();
  const status = useSteamStatus();

  if (!status) return null;

  const tooltip = status.state === "online"
    ? t("steamStatus.runningTooltip")
    : status.state === "offline"
      ? t("steamStatus.offlineTooltip")
      : status.state === "not_running"
        ? t("steamStatus.notRunningTooltip")
        : t("steamStatus.notInstalledTooltip");

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
