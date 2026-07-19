import { useState } from "react";
import { useStore } from "../store";
import { useT } from "../i18n";
import { DownloadCloud, Loader2 } from "lucide-react";
import clsx from "clsx";
import type { DependencyIssue } from "@core/mod-manager/dependency-checker";
import type { Mod } from "../types";
import { useSteamStatus, isSteamWorkshopOnline } from "../hooks/useSteamStatus";

function shortPack(name: string): string {
  return name.replace(/\.pack$/i, "");
}

interface RequiredModIssueRowProps {
  issue: DependencyIssue;
  onModsUpdated: (mods: Mod[]) => void;
}

export default function RequiredModIssueRow({ issue, onModsUpdated }: RequiredModIssueRowProps) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const steamStatus = useSteamStatus();
  const steamOnline = isSteamWorkshopOnline(steamStatus);

  const handleEnable = async () => {
    if (!issue.matchedModName || busy) return;
    setBusy(true);
    try {
      const next = await window.api.enableMod(issue.matchedModName);
      if (Array.isArray(next)) onModsUpdated(next);
    } catch (e) {
      console.error("Failed to enable required mod:", e);
    } finally {
      setBusy(false);
    }
  };

  const handleSteamWorkshop = async () => {
    if (issue.kind !== "workshop" || busy || !steamOnline) return;
    setBusy(true);
    setActionError(null);
    try {
      const result = await window.api.triggerWorkshopDownload(issue.id);
      if (Array.isArray(result.mods)) onModsUpdated(result.mods);
      if (result.subscribedWorkshopIds) {
        useStore.setState({ subscribedWorkshopIds: result.subscribedWorkshopIds });
      }
      if (!result.ok) {
        const code = result.errorCode ?? result.error ?? "unknown";
        const known = ["STEAM_UNAVAILABLE", "STEAM_DOWNLOAD_FAILED", "INVALID", "unknown"];
        setActionError(known.includes(code) ? t(`update.error.${code}`) : (result.error ?? code));
      }
    } catch (e) {
      console.error("Failed to subscribe/download workshop mod:", e);
      setActionError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const subtitle = issue.kind === "workshop"
    ? issue.id
    : shortPack(issue.id);

  if (issue.status === "not_enabled") {
    return (
      <li className="flex items-center gap-3 py-2 border-b border-morandi-border-light/60 last:border-0">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-morandi-text truncate">{issue.displayName}</div>
          <div className="text-[11px] text-morandi-text-muted font-mono truncate mt-0.5">{subtitle}</div>
          {issue.matchedModName && (
            <div className="text-[11px] text-morandi-text-secondary mt-0.5">
              {t("dependency.installedAs", { name: shortPack(issue.matchedModName) })}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={handleEnable}
          disabled={busy || !issue.matchedModName}
          className={clsx(
            "btn-morandi-subtle shrink-0 !pl-1 !pr-2",
            "disabled:opacity-50 disabled:cursor-not-allowed",
          )}
        >
          <span className="text-[11px] text-morandi-text-secondary whitespace-nowrap">
            {busy ? t("dependency.action.enabling") : t("dependency.action.enable")}
          </span>
          <span className={clsx(
            "w-9 h-5 rounded-full relative transition-colors",
            busy ? "bg-morandi-accent/60" : "bg-morandi-border",
          )}>
            <span className={clsx(
              "absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform",
              busy && "translate-x-4",
            )} />
          </span>
        </button>
      </li>
    );
  }

  if (issue.status === "not_subscribed") {
    return (
      <li className="flex items-center gap-3 py-2 border-b border-morandi-border-light/60 last:border-0">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-morandi-text truncate">{issue.displayName}</div>
          <div className="text-[11px] text-morandi-text-muted font-mono truncate mt-0.5">{subtitle}</div>
          <div className="text-[11px] text-morandi-danger mt-0.5">{t("dependency.status.not_subscribed")}</div>
          {actionError && <div className="text-[11px] text-morandi-danger mt-0.5">{actionError}</div>}
        </div>
        <button
          type="button"
          onClick={handleSteamWorkshop}
          disabled={busy || !steamOnline}
          title={!steamOnline ? t("steamStatus.offlineTooltip") : undefined}
          className="btn-morandi-accent-soft"
        >
          {busy
            ? <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin" />
            : <DownloadCloud className="w-3.5 h-3.5 shrink-0" />}
          {busy ? t("dependency.action.subscribing") : t("dependency.action.subscribe")}
        </button>
      </li>
    );
  }

  if (issue.status === "not_downloaded" && issue.kind === "workshop") {
    return (
      <li className="flex items-center gap-3 py-2 border-b border-morandi-border-light/60 last:border-0">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-morandi-text truncate">{issue.displayName}</div>
          <div className="text-[11px] text-morandi-text-muted font-mono truncate mt-0.5">{subtitle}</div>
          <div className="text-[11px] text-morandi-warning mt-0.5">{t("dependency.status.not_downloaded")}</div>
          {actionError && <div className="text-[11px] text-morandi-danger mt-0.5">{actionError}</div>}
        </div>
        <button
          type="button"
          onClick={handleSteamWorkshop}
          disabled={busy || !steamOnline}
          title={!steamOnline ? t("steamStatus.offlineTooltip") : undefined}
          className="btn-morandi-warning-soft"
        >
          {busy
            ? <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin" />
            : <DownloadCloud className="w-3.5 h-3.5 shrink-0" />}
          {busy ? t("dependency.action.downloading") : t("dependency.action.download")}
        </button>
      </li>
    );
  }

  return (
    <li className="flex items-center gap-3 py-2 border-b border-morandi-border-light/60 last:border-0">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-morandi-text truncate">{issue.displayName}</div>
        <div className="text-[11px] text-morandi-text-muted font-mono truncate mt-0.5">{subtitle}</div>
        <div className="text-[11px] text-morandi-danger mt-0.5">{t("dependency.status.not_downloaded")}</div>
      </div>
      <div className="flex items-center gap-2 shrink-0 opacity-50 cursor-not-allowed px-2 py-1">
        <span className="text-[11px] text-morandi-text-muted whitespace-nowrap">
          {t("dependency.action.notInstalled")}
        </span>
        <span className="w-9 h-5 rounded-full bg-morandi-border relative">
          <span className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow" />
        </span>
      </div>
    </li>
  );
}
