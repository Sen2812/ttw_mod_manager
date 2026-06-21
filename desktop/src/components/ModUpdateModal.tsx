import { useMemo, useState } from "react";
import { useStore } from "../store";
import { useT } from "../i18n";
import { X, Package, Download, Loader2 } from "lucide-react";
import clsx from "clsx";
import { getModUpdateStatus } from "@core/mod-manager/workshop-update-status";
import { getModDisplayName } from "@core/mod-manager/mod-display";
import ConfirmDialog from "./ConfirmDialog";

function formatDate(ts?: number): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleString();
}

export default function ModUpdateModal() {
  const t = useT();
  const show = useStore(s => s.showUpdateModal);
  const focusModName = useStore(s => s.updateFocusMod);
  const close = useStore(s => s.closeUpdateModal);
  const mods = useStore(s => s.mods);
  const setMods = useStore(s => s.setMods);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mod = useMemo(
    () => mods.find(m => m.name === focusModName),
    [mods, focusModName],
  );

  const status = mod ? getModUpdateStatus(mod) : "unknown";

  if (!show || !mod) return null;

  const displayName = getModDisplayName(mod);

  const handleForceUpdate = async () => {
    setConfirmOpen(false);
    setIsUpdating(true);
    setError(null);
    try {
      const result = await window.api.forceUpdateMod(mod.name);
      if (result.ok) {
        setMods(result.mods);
        close();
      } else {
        const code = (result as { errorCode?: string }).errorCode ?? result.error;
        setError(t(`update.error.${code ?? "unknown"}`));
      }
    } catch (e) {
      console.error("Force update failed:", e);
      setError(t("update.error.unknown"));
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-morandi-text/30 backdrop-blur-sm" onClick={close} />
        <div className="relative card-morandi w-[480px] max-w-[95vw] flex flex-col overflow-hidden">
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
              <p className={clsx(
                "text-xs mt-0.5 font-medium",
                status === "outdated" && "text-morandi-warning",
                status === "downloading" && "text-morandi-accent",
                status === "ok" && "text-morandi-success",
                status === "unknown" && "text-morandi-text-muted",
              )}>
                {t(`update.status.${status}`)}
              </p>
            </div>
            <button onClick={close} className="p-1.5 rounded-lg hover:bg-morandi-hover transition-colors shrink-0">
              <X className="w-5 h-5 text-morandi-text-secondary" />
            </button>
          </div>

          <div className="px-5 py-4 space-y-3">
            <VersionRow label={t("update.localVersion")} value={formatDate(mod.lastChangedLocal)} />
            <VersionRow label={t("update.workshopVersion")} value={formatDate(mod.lastChanged)} />
            {status === "downloading" && (
              <p className="text-xs text-morandi-text-secondary bg-morandi-accent-light/30 rounded-lg px-3 py-2">
                {t("update.status.downloading")}
              </p>
            )}
            {status === "outdated" && (
              <p className="text-xs text-morandi-text-secondary bg-morandi-warning-light/30 rounded-lg px-3 py-2">
                {t("update.outdatedHint")}
              </p>
            )}
            {error && (
              <p className="text-xs text-morandi-danger">{error}</p>
            )}
          </div>

          <div className="px-5 py-3 border-t border-morandi-border-light shrink-0 flex items-center justify-between gap-2">
            <button onClick={close} className="btn-morandi-ghost text-xs">{t("common.close")}</button>
            {status === "outdated" && (
              <button
                onClick={() => setConfirmOpen(true)}
                disabled={isUpdating}
                className="btn-morandi text-xs flex items-center gap-1.5"
              >
                {isUpdating ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Download className="w-3.5 h-3.5" />
                )}
                {t("update.forceUpdate")}
              </button>
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title={t("update.confirmTitle")}
        message={t("update.confirmMsg", { name: displayName })}
        confirmText={t("update.forceUpdate")}
        cancelText={t("common.cancel")}
        variant="warning"
        onConfirm={handleForceUpdate}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}

function VersionRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-morandi-text-secondary">{label}</span>
      <span className="text-morandi-text font-mono text-xs">{value}</span>
    </div>
  );
}
