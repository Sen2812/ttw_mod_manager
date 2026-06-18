import { useCallback } from "react";
import { useStore } from "../store";
import { useT } from "../i18n";
import { X, AlertTriangle } from "lucide-react";
import { getModDisplayName } from "@core/mod-manager/mod-display";
import { scanEnabledDependencyReports } from "../utils/dependency-actions";
import RequiredModIssueRow from "./RequiredModIssueRow";
import type { Mod } from "../types";

export default function DependencyAlertModal() {
  const t = useT();
  const reports = useStore(s => s.dependencyAlertReports);
  const close = useStore(s => s.closeDependencyAlert);
  const mods = useStore(s => s.mods);
  const subscribedWorkshopIds = useStore(s => s.subscribedWorkshopIds);
  const setMods = useStore(s => s.setMods);
  const markDirty = useStore(s => s.markDirty);
  const openDependencyAlert = useStore(s => s.openDependencyAlert);

  const handleModsUpdated = useCallback((nextMods: Mod[]) => {
    setMods(nextMods);
    markDirty();
    const remaining = scanEnabledDependencyReports(nextMods, subscribedWorkshopIds);
    if (remaining.length > 0) openDependencyAlert(remaining);
    else close();
  }, [setMods, markDirty, subscribedWorkshopIds, openDependencyAlert, close]);

  if (!reports?.length) return null;

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center">
      <div className="absolute inset-0 bg-morandi-text/30 backdrop-blur-sm" onClick={close} />
      <div className="relative card-morandi w-[560px] max-w-[95vw] max-h-[75vh] flex flex-col overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-3.5 border-b border-morandi-border-light shrink-0">
          <div className="w-10 h-10 rounded-full bg-morandi-warning-light/70 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-morandi-warning" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-morandi-text">{t("dependency.alertTitle")}</h2>
            <p className="text-xs text-morandi-text-secondary mt-0.5">{t("dependency.alertSubtitle")}</p>
          </div>
          <button onClick={close} className="p-1.5 rounded-lg hover:bg-morandi-hover transition-colors shrink-0">
            <X className="w-5 h-5 text-morandi-text-secondary" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-4">
          {reports.map(report => {
            const mod = mods.find(m => m.name === report.modName);
            const displayName = mod ? getModDisplayName(mod) : report.modName;
            return (
              <section key={report.modName}>
                <div className="text-sm font-semibold text-morandi-text mb-1 truncate">{displayName}</div>
                <div className="text-[11px] text-morandi-text-muted mb-2">{t("dependency.missingRequiredList")}</div>
                <ul className="rounded-lg border border-morandi-border-light px-3 bg-morandi-page/40">
                  {report.issues.map(issue => (
                    <RequiredModIssueRow
                      key={`${report.modName}-${issue.kind}-${issue.id}`}
                      issue={issue}
                      onModsUpdated={handleModsUpdated}
                    />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>

        <div className="px-5 py-3 border-t border-morandi-border-light shrink-0 flex justify-end">
          <button onClick={close} className="btn-morandi-ghost text-xs">{t("common.gotIt")}</button>
        </div>
      </div>
    </div>
  );
}
