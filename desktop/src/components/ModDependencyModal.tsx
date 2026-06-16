import { useMemo } from "react";
import { useStore } from "../store";
import { useT } from "../i18n";
import { X, AlertTriangle, Package, ExternalLink } from "lucide-react";
import clsx from "clsx";
import type { DependencyIssue, DependencyIssueStatus } from "@core/mod-manager/dependency-checker";
import { getModDependencyIssues } from "@core/mod-manager/dependency-checker";

function shortPack(name: string): string {
  return name.replace(/\.pack$/i, "");
}

const STATUS_STYLE: Record<DependencyIssueStatus, string> = {
  ok: "text-morandi-success",
  not_enabled: "text-morandi-warning",
  not_downloaded: "text-morandi-danger",
  not_subscribed: "text-morandi-danger",
};

export default function ModDependencyModal() {
  const t = useT();
  const show = useStore(s => s.showDependencyModal);
  const focusModName = useStore(s => s.dependencyFocusMod);
  const close = useStore(s => s.closeDependencyModal);
  const mods = useStore(s => s.mods);
  const subscribedWorkshopIds = useStore(s => s.subscribedWorkshopIds);

  const mod = useMemo(
    () => mods.find(m => m.name === focusModName),
    [mods, focusModName],
  );

  const issues = useMemo(() => {
    if (!mod) return [];
    return getModDependencyIssues(mod, {
      mods,
      subscribedWorkshopIds: new Set(subscribedWorkshopIds),
    });
  }, [mod, mods, subscribedWorkshopIds]);

  if (!show || !mod) return null;

  const displayName = mod.humanName || shortPack(mod.name);
  const workshopUrl = (id: string) =>
    `https://steamcommunity.com/sharedfiles/filedetails/?id=${id}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-morandi-text/30 backdrop-blur-sm" onClick={close} />
      <div className="relative card-morandi w-[520px] max-w-[95vw] max-h-[75vh] flex flex-col overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-3.5 border-b border-morandi-border-light shrink-0">
          <div className="w-9 h-9 rounded-md bg-morandi-sidebar flex items-center justify-center shrink-0 overflow-hidden">
            {mod.imgPath ? (
              <img src={`file:///${mod.imgPath.replace(/\\/g, '/')}`} className="w-full h-full object-cover" alt="" draggable={false} />
            ) : (
              <Package className="w-5 h-5 text-morandi-text-muted" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-morandi-text truncate">{displayName}</h2>
            <p className="text-xs text-morandi-danger flex items-center gap-1 mt-0.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              {t("dependency.modalSubtitle", { n: issues.length })}
            </p>
          </div>
          <button onClick={close} className="p-1.5 rounded-lg hover:bg-morandi-hover transition-colors shrink-0">
            <X className="w-5 h-5 text-morandi-text-secondary" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3">
          {issues.length === 0 ? (
            <p className="text-sm text-morandi-text-muted text-center py-8">{t("dependency.allSatisfied")}</p>
          ) : (
            <div className="space-y-2">
              {issues.map(issue => (
                <IssueRow key={`${issue.kind}-${issue.id}`} issue={issue} workshopUrl={workshopUrl} />
              ))}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-morandi-border-light shrink-0 flex justify-end">
          <button onClick={close} className="btn-morandi text-xs">{t("common.close")}</button>
        </div>
      </div>
    </div>
  );
}

function IssueRow({ issue, workshopUrl }: {
  issue: DependencyIssue;
  workshopUrl: (id: string) => string;
}) {
  const t = useT();

  const handleOpenWorkshop = async () => {
    if (issue.kind !== "workshop") return;
    try {
      await window.api.openUrl(workshopUrl(issue.id));
    } catch (e) {
      console.error("Failed to open workshop URL:", e);
    }
  };

  return (
    <div className="rounded-lg border border-morandi-border-light px-3 py-2.5 bg-morandi-page/40">
      <div className="flex items-start gap-2">
        <AlertTriangle className={clsx("w-4 h-4 mt-0.5 shrink-0", STATUS_STYLE[issue.status])} />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-morandi-text truncate">{issue.displayName}</div>
          <div className="text-[11px] text-morandi-text-muted font-mono truncate mt-0.5">
            {issue.kind === "workshop" ? issue.id : shortPack(issue.id)}
          </div>
          <div className={clsx("text-xs mt-1 font-medium", STATUS_STYLE[issue.status])}>
            {t(`dependency.status.${issue.status}`)}
          </div>
          {issue.matchedModName && issue.status === "not_enabled" && (
            <div className="text-[11px] text-morandi-text-secondary mt-0.5">
              {t("dependency.installedAs", { name: shortPack(issue.matchedModName) })}
            </div>
          )}
        </div>
        {issue.kind === "workshop" && (
          <button onClick={handleOpenWorkshop}
            className="btn-morandi-ghost text-[10px] shrink-0 flex items-center gap-1"
            title={t("dependency.openWorkshop")}>
            <ExternalLink className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  );
}
