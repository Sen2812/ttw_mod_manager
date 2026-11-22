import { useCallback, useEffect, useState } from "react";
import { useT } from "../i18n";
import ConfirmDialog from "./ConfirmDialog";
import type { AppUpdateState } from "../types";

function formatPercent(percent?: number): string {
  if (percent == null || Number.isNaN(percent)) return "0";
  return Math.max(0, Math.min(100, Math.round(percent))).toString();
}

/**
 * Prompts before download / install. Startup and manual checks share this dialog
 * for available → downloading → ready. Up-to-date / error toasts live in Settings.
 */
export default function AppUpdateDialog() {
  const t = useT();
  const [state, setState] = useState<AppUpdateState | null>(null);
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [hiddenWhileDownloading, setHiddenWhileDownloading] = useState(false);

  useEffect(() => {
    const off = window.api.onAppUpdateStatus?.((payload) => {
      setState(payload);
      if (payload.phase === "downloading" || payload.phase === "ready" || payload.phase === "available") {
        setBusy(false);
      }
      if (payload.phase !== "downloading") setHiddenWhileDownloading(false);
    });
    void window.api.getAppUpdateState?.().then(setState).catch(() => undefined);
    return () => { off?.(); };
  }, []);

  const availableVersion = state?.availableVersion;
  const showAvailable =
    state?.phase === "available" &&
    !!availableVersion &&
    availableVersion !== dismissedVersion;
  const showDownloading =
    state?.phase === "downloading" && !hiddenWhileDownloading;
  const showReady =
    state?.phase === "ready" &&
    !!availableVersion &&
    availableVersion !== dismissedVersion;

  const dismiss = useCallback(() => {
    if (availableVersion) setDismissedVersion(availableVersion);
    setBusy(false);
  }, [availableVersion]);

  const onUpdateNow = useCallback(async () => {
    if (!state) return;
    setBusy(true);
    try {
      if (state.portable) {
        await window.api.openAppReleasePage();
        dismiss();
        return;
      }
      await window.api.downloadAppUpdate();
    } catch {
      setBusy(false);
    }
  }, [state, dismiss]);

  const onInstallNow = useCallback(() => {
    setBusy(true);
    void Promise.resolve(window.api.installAppUpdate()).then((r) => {
      if (!r?.ok) setBusy(false);
    }).catch(() => setBusy(false));
  }, []);

  if (showDownloading) {
    return (
      <ConfirmDialog
        open
        title={t("appUpdate.downloadingTitle")}
        message={t("appUpdate.downloadingMsg", {
          version: state?.availableVersion ?? "",
          percent: formatPercent(state?.percent),
        })}
        confirmText={t("common.gotIt")}
        cancelText={t("appUpdate.later")}
        variant="primary"
        onConfirm={() => setHiddenWhileDownloading(true)}
        onCancel={() => setHiddenWhileDownloading(true)}
      />
    );
  }

  if (showReady) {
    return (
      <ConfirmDialog
        open
        title={t("appUpdate.readyTitle")}
        message={t("appUpdate.readyMsg", { version: availableVersion ?? "" })}
        confirmText={t("appUpdate.restartNow")}
        cancelText={t("appUpdate.later")}
        variant="primary"
        busy={busy}
        onConfirm={onInstallNow}
        onCancel={dismiss}
      />
    );
  }

  if (showAvailable) {
    return (
      <ConfirmDialog
        open
        title={t("appUpdate.availableTitle")}
        message={
          state?.portable
            ? t("appUpdate.availablePortableMsg", {
                version: availableVersion ?? "",
                current: state.currentVersion,
              })
            : t("appUpdate.availableMsg", {
                version: availableVersion ?? "",
                current: state?.currentVersion ?? "",
              })
        }
        confirmText={state?.portable ? t("appUpdate.openDownloadPage") : t("appUpdate.updateNow")}
        cancelText={t("appUpdate.later")}
        variant="primary"
        busy={busy}
        onConfirm={onUpdateNow}
        onCancel={dismiss}
      />
    );
  }

  return null;
}
