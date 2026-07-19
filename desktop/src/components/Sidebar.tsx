import { useState, useRef, useEffect } from "react";
import { useStore } from "../store";
import { useT } from "../i18n";
import ConfirmDialog from "./ConfirmDialog";
import { Plus, Trash2, Save, Loader2, Star, Pencil, Check, X, Download, Upload, ChevronLeft, ChevronRight } from "lucide-react";
import clsx from "clsx";

const SIDEBAR_COLLAPSED_KEY = "ttw-sidebar-collapsed";

function readSidebarCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

function buildProfileTooltip(
  t: (key: string, params?: Record<string, string | number>) => string,
  name: string,
  isActive: boolean,
): string {
  const lines = [name];
  lines.push(isActive ? t("sidebar.profileTooltipActive") : t("sidebar.profileTooltipSwitch"));
  return lines.join("\n");
}

export default function Sidebar() {
  const t = useT();
  const { presets, activePresetName, setActivePresetName, setShowNewPresetModal,
    setMods, setPresets, enabledCount, totalCount,
    isDirty, isSaving, saveCurrentState, markDirty, currentGame, mods,
    saveError, profileSwitching, beginPresetSwitch, finishPresetSwitch, cancelPresetSwitch } = useStore();
  const [presetToDelete, setPresetToDelete] = useState<string | null>(null);
  const [pendingSwitch, setPendingSwitch] = useState<string | null>(null);
  const [importResultMsg, setImportResultMsg] = useState<string | null>(null);
  const [isExportingOrder, setIsExportingOrder] = useState(false);
  const [isImportingOrder, setIsImportingOrder] = useState(false);
  // 内联重命名状态
  const [renamingPreset, setRenamingPreset] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(readSidebarCollapsed);
  const renameInputRef = useRef<HTMLInputElement>(null);

  const toggleCollapsed = () => {
    setCollapsed(prev => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
      } catch {
        // ignore
      }
      return next;
    });
  };

  // 聚焦并全选重命名输入框
  useEffect(() => {
    if (renamingPreset && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingPreset]);

  const doApply = async (name: string) => {
    if (profileSwitching) return;
    const previousName = activePresetName;
    beginPresetSwitch(name);
    try {
      const result = await window.api.applyPreset(name);
      if (Array.isArray(result)) {
        finishPresetSwitch(name, result);
      } else {
        cancelPresetSwitch(previousName);
        console.error("Failed to apply preset:", result);
      }
    } catch (e) {
      cancelPresetSwitch(previousName);
      console.error("Failed to apply preset:", e);
    }
  };

  const handleApply = (name: string) => {
    if (profileSwitching) return;
    if (name === activePresetName && !isDirty) return;
    if (isDirty) {
      setPendingSwitch(name);
      return;
    }
    doApply(name);
  };

  const handleDelete = (name: string) => setPresetToDelete(name);

  const confirmDelete = async () => {
    if (!presetToDelete) return;
    const result = await window.api.deletePreset(presetToDelete);
    if ("presets" in result && result.presets) {
      setPresets(result.presets);
      if (result.mods) {
        finishPresetSwitch(result.activePresetName ?? "Default", result.mods);
      }
      if (result.activePresetName) setActivePresetName(result.activePresetName);
    } else if (Array.isArray(result)) {
      setPresets(result);
      if (activePresetName === presetToDelete) setActivePresetName("Default");
    }
    setPresetToDelete(null);
  };

  const handleExportOrder = async () => {
    if (!activePresetName || isExportingOrder) return;
    setIsExportingOrder(true);
    try {
      await window.api.exportProfileOrder(activePresetName, mods);
    } catch (e) {
      console.error("Failed to export load order:", e);
    } finally {
      setIsExportingOrder(false);
    }
  };

  const handleImportOrder = async () => {
    if (isImportingOrder) return;
    setIsImportingOrder(true);
    try {
      const result = await window.api.importProfileOrder(mods);
      if (!result.ok) {
        if (result.error === "INVALID_FORMAT") {
          setImportResultMsg(t("sidebar.importInvalidFormat"));
        } else if (result.error) {
          setImportResultMsg(result.error);
        }
        return;
      }
      if (result.mods) {
        setMods(result.mods);
        markDirty();
      }
      if (result.applied !== undefined) {
        setImportResultMsg(t("sidebar.importResult", {
          applied: result.applied,
          skipped: result.skipped ?? 0,
        }));
      }
    } catch (e) {
      console.error("Failed to import load order:", e);
      setImportResultMsg(t("sidebar.importFailed"));
    } finally {
      setIsImportingOrder(false);
    }
  };

  // ── 内联重命名 ──
  const startRename = (name: string) => {
    setRenamingPreset(name);
    setRenameValue(name);
    setRenameError(null);
  };

  const cancelRename = () => {
    setRenamingPreset(null);
    setRenameError(null);
  };

  const confirmRename = async () => {
    const oldName = renamingPreset;
    if (!oldName) return;
    const newName = renameValue.trim();
    if (!newName) {
      setRenameError(t("newPreset.errorEmpty"));
      return;
    }
    if (newName === oldName) { cancelRename(); return; }
    const result = await window.api.renamePreset(oldName, newName);
    if (!("presets" in result)) {
      setRenameError(result.error ?? t("newPreset.errorFailed"));
      renameInputRef.current?.focus();
      return;
    }
    // 更新 presets + activePresetName（后端在重命名激活 profile 时会改激活名）
    setPresets(result.presets);
    setActivePresetName(result.activePresetName);
    setRenamingPreset(null);
    setRenameError(null);
  };

  return (
    <div className={clsx(
      "bg-morandi-sidebar border-r border-morandi-border-light flex flex-col shrink-0 transition-[width] duration-200 overflow-hidden",
      collapsed ? "w-11" : "w-56",
    )}>
      {collapsed ? (
        <div className="flex flex-col items-center h-full py-3 gap-3">
          <button
            type="button"
            onClick={toggleCollapsed}
            className="icon-btn"
            title={t("sidebar.expandProfiles")}
            aria-label={t("sidebar.expandProfiles")}
          >
            <ChevronRight className="w-4 h-4 text-morandi-text-secondary" />
          </button>
          <div className="flex-1 min-h-0" />
          <button
            type="button"
            onClick={saveCurrentState}
            disabled={!isDirty || isSaving}
            className={clsx(
              "icon-btn relative shrink-0",
              !isDirty && "opacity-50 cursor-not-allowed pointer-events-none",
              isDirty && "text-morandi-accent",
            )}
            title={t("sidebar.saveChanges")}
            aria-label={t("sidebar.saveChanges")}
          >
            {isSaving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {isDirty && !isSaving && (
              <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-morandi-accent" />
            )}
          </button>
        </div>
      ) : (
        <>
      <div className="px-4 pt-4 pb-2 flex items-center justify-between gap-1">
        <h2 className="field-label truncate">{t("sidebar.profiles")}</h2>
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            type="button"
            onClick={() => setShowNewPresetModal(true)}
            className="icon-btn-sm"
            title={t("newPreset.title")}
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={toggleCollapsed}
            className="icon-btn-sm"
            title={t("sidebar.collapseProfiles")}
            aria-label={t("sidebar.collapseProfiles")}
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-2 space-y-0.5">
        {/* Default Profile */}
        <button onClick={() => handleApply("Default")}
          disabled={profileSwitching}
          title={buildProfileTooltip(
            t,
            t("sidebar.defaultProfile"),
            activePresetName === "Default",
          )}
          className={clsx("nav-item",
            activePresetName === "Default" && "nav-item-active")}>
          <div className="flex items-center gap-1.5">
            <Star className="w-3.5 h-3.5 text-morandi-accent" />
            <span>{t("sidebar.defaultProfile")}</span>
          </div>
        </button>

        {/* 其他 Presets */}
        {presets.filter(p => p.name !== "Default").map(preset => {
          const isActive = activePresetName === preset.name;
          const isRenaming = renamingPreset === preset.name;
          return (
            <div key={preset.name}
              className={clsx("group nav-row", isActive && "nav-row-active")}>
              {isRenaming ? (
                // ── 重命名模式：名称变成输入框 ──
                <>
                  <input
                    ref={renameInputRef}
                    type="text"
                    value={renameValue}
                    onChange={e => { setRenameValue(e.target.value); setRenameError(null); }}
                    onKeyDown={e => {
                      if (e.key === "Enter") { e.preventDefault(); confirmRename(); }
                      else if (e.key === "Escape") { e.preventDefault(); cancelRename(); }
                    }}
                    placeholder={t("sidebar.renamePlaceholder")}
                    className="flex-1 min-w-0 mx-2 my-1 input-morandi !py-1 !text-sm"
                  />
                  <div className="flex items-center gap-0.5 shrink-0 pr-1.5">
                    <button onClick={e => { e.stopPropagation(); confirmRename(); }}
                      className="icon-btn-sm"
                      title={t("common.confirm")}>
                      <Check className="w-3 h-3 text-morandi-success" />
                    </button>
                    <button onClick={e => { e.stopPropagation(); cancelRename(); }}
                      className="icon-btn-sm"
                      title={t("common.cancel")}>
                      <X className="w-3 h-3 text-morandi-danger" />
                    </button>
                  </div>
                </>
              ) : (
                // ── 普通模式 ──
                <>
                  <button onClick={() => handleApply(preset.name)}
                    disabled={profileSwitching}
                    title={buildProfileTooltip(t, preset.name, isActive)}
                    className="flex-1 min-w-0 px-3 py-2 text-sm text-left">
                    <span className={clsx("truncate block",
                      isActive ? "text-morandi-text font-medium" : "text-morandi-text-secondary")}>
                      {preset.name}
                    </span>
                  </button>
                  <div className="flex items-center gap-0.5 shrink-0 pr-1.5">
                    <button onClick={e => { e.stopPropagation(); startRename(preset.name); }}
                        className="icon-btn-sm"
                        title={t("sidebar.renameProfile")}>
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button onClick={e => { e.stopPropagation(); handleDelete(preset.name); }}
                        className="icon-btn-sm hover:text-morandi-danger hover:bg-morandi-danger-light"
                        title={t("sidebar.deleteProfile")}>
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </>
              )}
            </div>
          );
        })}
        {/* 重命名错误提示（内联显示在列表底部） */}
        {renameError && (
          <p className="px-3 py-1 text-[11px] text-morandi-danger">{renameError}</p>
        )}
      </div>
      <div className="px-4 py-3 border-t border-morandi-border-light space-y-2">
        <div className="flex items-center gap-1">
          <button
            onClick={handleExportOrder}
            disabled={!activePresetName || isExportingOrder}
            className="btn-morandi-subtle flex-1"
            title={t("sidebar.exportOrder")}
          >
            {isExportingOrder ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            <span>{t("sidebar.exportOrder")}</span>
          </button>
          <button
            onClick={handleImportOrder}
            disabled={isImportingOrder}
            className="btn-morandi-subtle flex-1"
            title={t("sidebar.importOrder")}
          >
            {isImportingOrder ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            <span>{t("sidebar.importOrder")}</span>
          </button>
        </div>
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs text-morandi-text-muted">
            {t("sidebar.modsCount", { n: totalCount(), m: enabledCount() })}
          </div>
          {isDirty && (
            <span className="text-xs text-morandi-accent animate-pulse">{t("sidebar.unsaved")}</span>
          )}
        </div>
        <button
          onClick={saveCurrentState}
          disabled={!isDirty || isSaving}
          className={clsx(
            "w-full flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-morandi",
            isDirty
              ? "btn-morandi !w-full"
              : "bg-morandi-border text-morandi-text-muted cursor-not-allowed",
          )}
        >
          {isSaving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>{t("sidebar.saving")}</span>
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              <span>{t("sidebar.saveChanges")}</span>
            </>
          )}
        </button>
        {saveError && (
          <p className="mt-2 text-xs text-morandi-danger">{t("sidebar.saveFailed", { error: saveError })}</p>
        )}
      </div>
        </>
      )}

      {/* 删除确认弹窗 */}
      <ConfirmDialog
        open={presetToDelete !== null}
        title={t("sidebar.deleteTitle")}
        message={presetToDelete ? t("sidebar.deleteConfirm", { name: presetToDelete }) : ""}
        confirmText={t("common.delete")}
        variant="danger"
        onConfirm={confirmDelete}
        onCancel={() => setPresetToDelete(null)}
      />

      {/* 未保存修改 → 切换 profile 确认弹窗 */}
      <ConfirmDialog
        open={pendingSwitch !== null}
        title={t("sidebar.unsavedSwitchTitle")}
        message={pendingSwitch ? t("sidebar.unsavedSwitchMsg", { name: pendingSwitch }) : ""}
        confirmText={t("sidebar.switchSaveAndSwitch")}
        secondaryText={t("sidebar.switchWithoutSaving")}
        variant="warning"
        onConfirm={async () => {
          const name = pendingSwitch;
          setPendingSwitch(null);
          if (name && await saveCurrentState()) await doApply(name);
        }}
        onSecondary={() => {
          if (pendingSwitch) void doApply(pendingSwitch);
          setPendingSwitch(null);
        }}
        onCancel={() => setPendingSwitch(null)}
      />

      {/* 导入排序结果 */}
      <ConfirmDialog
        open={importResultMsg !== null}
        title={t("sidebar.importTitle")}
        message={importResultMsg ?? ""}
        confirmText={t("common.done")}
        variant="primary"
        onConfirm={() => setImportResultMsg(null)}
        onCancel={() => setImportResultMsg(null)}
      />
    </div>
  );
}
