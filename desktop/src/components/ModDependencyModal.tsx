import { useMemo, useCallback } from "react";
import { useStore } from "../store";
import { useT } from "../i18n";
import { X, AlertTriangle, Package, Loader2 } from "lucide-react";
import { getModDependencyIssues } from "@core/mod-manager/dependency-checker";
import { getModDisplayName } from "@core/mod-manager/mod-display";
import RequiredModIssueRow from "./RequiredModIssueRow";
import type { Mod } from "../types";

export default function ModDependencyModal() {
  const t = useT();
  const show = useStore(s => s.showDependencyModal);
  const focusModName = useStore(s => s.dependencyFocusMod);
  const close = useStore(s => s.closeDependencyModal);
  const mods = useStore(s => s.mods);
  const setMods = useStore(s => s.setMods);
  const markDirty = useStore(s => s.markDirty);
  const subscribedWorkshopIds = useStore(s => s.subscribedWorkshopIds);
  const isChecking = useStore(s => focusModName ? !!s.prerequisiteChecking[focusModName] : false);

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

  const handleModsUpdated = useCallback((nextMods: Mod[]) => {
    setMods(nextMods);
    markDirty();
  }, [setMods, markDirty]);

  if (!show || !mod) return null;

  const displayName = getModDisplayName(mod);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="modal-backdrop" onClick={close} />
      <div className="modal-panel w-[560px] max-w-[95vw] max-h-[75vh] flex flex-col overflow-hidden">
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
              {issues.length > 0
                ? t("dependency.modalSubtitle", { n: issues.length })
                : t("dependency.allSatisfied")}
            </p>
          </div>
          <button onClick={close} className="p-1.5 rounded-lg hover:bg-morandi-hover transition-colors shrink-0">
            <X className="w-5 h-5 text-morandi-text-secondary" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3">
          {isChecking ? (
            <div className="py-10 text-center space-y-3">
              <Loader2 className="w-7 h-7 animate-spin mx-auto text-morandi-accent" />
              <p className="text-sm text-morandi-text-muted">{t("dependency.checking")}</p>
            </div>
          ) : issues.length === 0 ? (
            <p className="text-sm text-morandi-text-muted text-center py-8">{t("dependency.allSatisfied")}</p>
          ) : (
            <>
              <div className="text-[11px] text-morandi-text-muted mb-2">{t("dependency.missingRequiredList")}</div>
              <ul className="rounded-lg border border-morandi-border-light px-3 bg-morandi-page/40">
                {issues.map(issue => (
                  <RequiredModIssueRow
                    key={`${issue.kind}-${issue.id}`}
                    issue={issue}
                    onModsUpdated={handleModsUpdated}
                  />
                ))}
              </ul>
            </>
          )}
        </div>

        <div className="px-5 py-3 border-t border-morandi-border-light shrink-0 flex justify-end">
          <button onClick={close} className="btn-morandi-ghost text-xs">{t("common.close")}</button>
        </div>
      </div>
    </div>
  );
}
