import { useState } from "react";
import { useT } from "../i18n";
import { ExternalLink } from "lucide-react";
import clsx from "clsx";
import type { DependencyIssue } from "@core/mod-manager/dependency-checker";
import type { Mod } from "../types";

function shortPack(name: string): string {
  return name.replace(/\.pack$/i, "");
}

function workshopUrl(id: string): string {
  return `https://steamcommunity.com/sharedfiles/filedetails/?id=${id}`;
}

interface RequiredModIssueRowProps {
  issue: DependencyIssue;
  onModsUpdated: (mods: Mod[]) => void;
}

export default function RequiredModIssueRow({ issue, onModsUpdated }: RequiredModIssueRowProps) {
  const t = useT();
  const [busy, setBusy] = useState(false);

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

  const handleOpenWorkshop = async () => {
    if (issue.kind !== "workshop" || busy) return;
    setBusy(true);
    try {
      await window.api.openUrl(workshopUrl(issue.id));
    } catch (e) {
      console.error("Failed to open workshop URL:", e);
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
            "flex items-center gap-2 shrink-0 pl-1 pr-2 py-1 rounded-lg transition-colors",
            "hover:bg-morandi-hover disabled:opacity-50 disabled:cursor-not-allowed",
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
        </div>
        <button
          type="button"
          onClick={handleOpenWorkshop}
          disabled={busy || issue.kind !== "workshop"}
          className={clsx(
            "flex items-center gap-1.5 shrink-0 px-2.5 py-1.5 rounded-lg text-[11px] font-medium",
            "bg-morandi-accent-light/50 text-morandi-accent hover:bg-morandi-accent-light transition-colors",
            "disabled:opacity-50 disabled:cursor-not-allowed",
          )}
        >
          <ExternalLink className="w-3.5 h-3.5 shrink-0" />
          {busy ? t("dependency.action.opening") : t("dependency.action.subscribe")}
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
        </div>
        <button
          type="button"
          onClick={handleOpenWorkshop}
          disabled={busy}
          className={clsx(
            "flex items-center gap-1.5 shrink-0 px-2.5 py-1.5 rounded-lg text-[11px] font-medium",
            "bg-morandi-warning-light/40 text-morandi-warning hover:bg-morandi-warning-light/60 transition-colors",
            busy && "opacity-60",
          )}
        >
          <ExternalLink className="w-3.5 h-3.5 shrink-0" />
          {busy ? t("dependency.action.opening") : t("dependency.action.download")}
        </button>
      </li>
    );
  }

  // Pack dependency not installed locally
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
