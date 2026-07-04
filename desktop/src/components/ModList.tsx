import { useState, useMemo, useCallback, useEffect, useRef, memo } from "react";
import { DndContext, closestCenter, KeyboardSensor, MouseSensor, useSensor, useSensors,
  DragEndEvent, DragOverlay, DragStartEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useStore } from "../store";
import { useT } from "../i18n";
import { useViewModeStore } from "../viewModeStore";
import { ViewModeToggle } from "./ViewModeToggle";
import { Search, ToggleLeft, ToggleRight, GripVertical, Check, Package, Info, ArrowDown, ArrowUpToLine, ArrowDownToLine, AlertTriangle, DownloadCloud, RefreshCw, Loader2, FolderInput } from "lucide-react";
import clsx from "clsx";
import type { Mod, ModConflictStats } from "../types";
import ModDetailModal from "./ModDetailModal";
import ModCategorySelect from "./ModCategorySelect";
import CategoryFilter from "./CategoryFilter";
import { getModDependencyIssues } from "@core/mod-manager/dependency-checker";
import { getModCategory, normalizeWorkshopTags } from "@core/mod-manager/category-utils";
import { getModDisplayName, hasWorkshopDisplayName } from "@core/mod-manager/mod-display";
import { isModOutdated } from "@core/mod-manager/workshop-update-status";
import { getModDependencyReport } from "../utils/dependency-actions";
import { reorderModToEdge } from "../utils/load-order";

// ─── 单行 Mod（memo 化，拖拽时不触发整列表重渲染）─────────────────────────

function modLabel(mods: Mod[], packName: string): string {
  const m = mods.find(x => x.name === packName);
  return m ? getModDisplayName(m) : packName.replace(/\.pack$/i, "");
}

function buildOverwriteTooltip(t: (key: string, params?: Record<string, string | number>) => string, stats: ModConflictStats, mods: Mod[]): string {
  const lines = [t("modlist.rowOverwriteDetail", { wins: stats.wins, losses: stats.losses })];
  const beatNames = stats.overwrites?.slice(0, 2).map(r => modLabel(mods, r.modName));
  const loseNames = stats.overwrittenBy?.slice(0, 2).map(r => modLabel(mods, r.modName));
  if (beatNames?.length) lines.push(t("modlist.rowOverwriteBeats", { mods: beatNames.join(" · ") }));
  if (loseNames?.length) lines.push(t("modlist.rowOverwriteLosesTo", { mods: loseNames.join(" · ") }));
  lines.push(t("modlist.rowOverwriteTooltip"));
  return lines.join("\n");
}

interface ModRowProps {
  mod: Mod;
  onToggle: (mod: Mod) => void;
  onShowDetail: (mod: Mod) => void;
  onShowCompat: (modName: string) => void;
  onShowDependency: (modName: string) => void;
  onShowUpdate: (modName: string) => void;
  onRequestDownload: (mod: Mod) => void;
  dependencyIssueCount: number;
  hasUpdate: boolean;
  category: string | null;
  categories: string[];
  onCategoryChange: (modName: string, category: string | null) => void;
  onAddCategory: (name: string) => void;
  onMoveToTop: (mod: Mod) => void;
  onMoveToBottom: (mod: Mod) => void;
  isAtListTop: boolean;
  isAtListBottom: boolean;
}

const ModRow = memo(function ModRow({
  mod, onToggle, onShowDetail, onShowCompat, onShowDependency, onShowUpdate, onRequestDownload, dependencyIssueCount,
  hasUpdate, category, categories, onCategoryChange, onAddCategory,
  onMoveToTop, onMoveToBottom, isAtListTop, isAtListBottom,
}: ModRowProps) {
  const t = useT();
  const allMods = useStore(s => s.mods);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging: isSortDragging } = useSortable({ id: mod.name });
  const style = { transform: CSS.Transform.toString(transform), transition };
  // 仅订阅本行的覆盖统计，避免其他 mod 统计变化导致重渲染
  const stats = useStore(s => mod.isEnabled ? s.overwriteStats?.[mod.name] : undefined);
  const isCheckingPrerequisites = useStore(s => !!s.prerequisiteChecking[mod.name]);

  const displayName = getModDisplayName(mod);
  const hasWorkshopName = hasWorkshopDisplayName(mod);
  const downloadPct = mod.downloadBytesTotal && mod.downloadBytesTotal > 0
    ? Math.min(100, Math.round(100 * (mod.downloadBytesCurrent ?? 0) / mod.downloadBytesTotal))
    : null;
  const isValidating = mod.pendingDownload && downloadPct === 100;
  const awaitingDownloadOnly = mod.pendingDownload && !(mod.size && mod.size > 0);

  return (
    <div ref={setNodeRef} style={style} data-mod-name={mod.name}
      className={clsx("group flex items-center gap-3 px-4 py-2.5 border-b border-morandi-border-light transition-all duration-200 cursor-pointer hover:bg-morandi-hover/50",
        isSortDragging && "opacity-50",
        isCheckingPrerequisites && "bg-morandi-accent-light/15",
        mod.pendingDownload && awaitingDownloadOnly && "bg-morandi-accent-light/10",
        mod.isEnabled ? "bg-morandi-card" : "bg-morandi-page/50")}
      onDoubleClick={() => onShowDetail(mod)}>
      <div className="flex items-center gap-0.5 shrink-0">
        <div {...attributes} {...listeners}
          className="cursor-grab active:cursor-grabbing p-1 rounded hover:bg-morandi-hover transition-colors touch-none">
          <GripVertical className="w-4 h-4 text-morandi-text-muted" />
        </div>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onMoveToTop(mod); }}
          disabled={isAtListTop}
          className="p-1 rounded hover:bg-morandi-hover transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-30 disabled:cursor-not-allowed"
          title={t("modlist.moveToTopHint")}
          aria-label={t("modlist.moveToTop")}
        >
          <ArrowUpToLine className="w-3.5 h-3.5 text-morandi-text-muted" />
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onMoveToBottom(mod); }}
          disabled={isAtListBottom}
          className="p-1 rounded hover:bg-morandi-hover transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-30 disabled:cursor-not-allowed"
          title={t("modlist.moveToBottomHint")}
          aria-label={t("modlist.moveToBottom")}
        >
          <ArrowDownToLine className="w-3.5 h-3.5 text-morandi-text-muted" />
        </button>
      </div>
      <button onClick={(e) => { e.stopPropagation(); onToggle(mod); }}
        disabled={(isCheckingPrerequisites && !mod.isEnabled) || (awaitingDownloadOnly && !mod.isEnabled)}
        title={
          awaitingDownloadOnly ? t("modlist.downloadingTooltip")
            : isCheckingPrerequisites ? t("dependency.checking")
            : undefined
        }
        className={clsx("w-5 h-5 rounded border-2 flex items-center justify-center transition-all shrink-0",
          awaitingDownloadOnly && "border-morandi-accent-light bg-morandi-accent-light/20 cursor-not-allowed",
          isCheckingPrerequisites && "border-morandi-accent-light bg-morandi-accent-light/30",
          !isCheckingPrerequisites && !awaitingDownloadOnly && mod.isEnabled && "bg-morandi-success border-morandi-success",
          !isCheckingPrerequisites && !awaitingDownloadOnly && !mod.isEnabled && "border-morandi-border hover:border-morandi-accent-light",
          isCheckingPrerequisites && "cursor-wait")}>
        {isCheckingPrerequisites ? (
          <Loader2 className="w-3 h-3 text-morandi-accent animate-spin" />
        ) : awaitingDownloadOnly ? (
          <Loader2 className="w-3 h-3 text-morandi-accent animate-spin" />
        ) : mod.isEnabled ? (
          <Check className="w-3 h-3 text-white" strokeWidth={3} />
        ) : null}
      </button>
      {/* 工坊封面图片 — lazy 加载 */}
      <div className="w-10 h-10 rounded-md bg-morandi-sidebar flex items-center justify-center shrink-0 overflow-hidden">
        {mod.imgPath ? (
          <img
            src={`file:///${mod.imgPath.replace(/\\/g, '/')}`}
            className="w-full h-full object-cover"
            alt={displayName}
            loading="lazy"
            draggable={false}
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
              (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
            }}
          />
        ) : null}
        <Package className={clsx("w-5 h-5 text-morandi-text-muted", mod.imgPath && "hidden")} />
      </div>
      <div className="flex-1 min-w-0">
        <div className={clsx(
          "text-sm truncate",
          mod.isEnabled ? "text-morandi-text font-medium" : "text-morandi-text-secondary"
        )}>
          {displayName}
        </div>
        <div className="text-xs text-morandi-text-muted truncate">
          {awaitingDownloadOnly ? (
            <span className="text-morandi-accent">
              {isValidating
                ? t("modlist.downloadValidating")
                : downloadPct != null && downloadPct > 0
                  ? t("modlist.downloadProgress", { pct: downloadPct })
                  : t("modlist.downloadQueued")}
            </span>
          ) : (
            <>
              {mod.author && <span className="text-morandi-accent">{mod.author}</span>}
              {mod.author && hasWorkshopName && <span> · </span>}
              {hasWorkshopName && <span className="font-mono text-morandi-text-muted/70">{mod.name.replace(".pack", "")}</span>}
            </>
          )}
        </div>
      </div>
      {/* 冲突 / 更新 / 依赖：位于种类选择器左侧 */}
      <div className="flex items-center gap-0.5 shrink-0">
        {mod.pendingDownload && (
          <button
            onClick={(e) => { e.stopPropagation(); onRequestDownload(mod); }}
            className="p-1 rounded-md text-morandi-accent hover:bg-morandi-accent-light/40 transition-colors"
            title={t("modlist.requestDownload")}
          >
            <DownloadCloud className="w-4 h-4" />
          </button>
        )}
        {isCheckingPrerequisites && !mod.pendingDownload && (
          <span className="p-1 text-morandi-accent" title={t("dependency.checking")}>
            <Loader2 className="w-4 h-4 animate-spin" />
          </span>
        )}
        {hasUpdate && (
          <button
            onClick={(e) => { e.stopPropagation(); onShowUpdate(mod.name); }}
            className="p-1 rounded-md text-morandi-accent hover:bg-morandi-accent-light/40 transition-colors"
            title={t("modlist.updateTooltip")}
          >
            <DownloadCloud className="w-4 h-4" />
          </button>
        )}
        {mod.isEnabled && dependencyIssueCount > 0 && (
          <button
            onClick={(e) => { e.stopPropagation(); onShowDependency(mod.name); }}
            className="p-1 rounded-md text-morandi-warning hover:bg-morandi-warning-light/40 transition-colors"
            title={t("modlist.dependencyTooltip", { n: dependencyIssueCount })}
          >
            <AlertTriangle className="w-4 h-4" />
          </button>
        )}
        {mod.isEnabled && stats && (stats.wins > 0 || stats.losses > 0) && (
          <button
            onClick={(e) => { e.stopPropagation(); onShowCompat(mod.name); }}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-morandi-sidebar/60 hover:bg-morandi-hover transition-colors"
            title={buildOverwriteTooltip(t, stats, allMods)}
          >
            {stats.wins > 0 && (
              <span className="text-[10px] font-medium text-morandi-success leading-none px-1 py-0.5 rounded bg-morandi-success/10">
                {t("modlist.overwriteActiveShort", { n: stats.wins })}
              </span>
            )}
            {stats.losses > 0 && (
              <span className="text-[10px] font-medium text-morandi-danger leading-none px-1 py-0.5 rounded bg-morandi-danger/10">
                {t("modlist.overwriteOverriddenShort", { n: stats.losses })}
              </span>
            )}
          </button>
        )}
      </div>
      <ModCategorySelect
        compact
        value={category}
        categories={categories}
        workshopTags={normalizeWorkshopTags(mod.tags)}
        onChange={(cat) => onCategoryChange(mod.name, cat)}
        onAddCategory={onAddCategory}
      />
      <button
        onClick={(e) => { e.stopPropagation(); onShowDetail(mod); }}
        className="p-1.5 rounded hover:bg-morandi-hover transition-colors opacity-0 group-hover:opacity-100 shrink-0"
        title={t("modlist.viewDetails")}
      >
        <Info className="w-4 h-4 text-morandi-text-muted" />
      </button>
    </div>
  );
});

// ─── 拖拽预览 ──────────────────────────────────────────────────────────────

function DragOverlayContent({ mod }: { mod: Mod }) {
  const displayName = getModDisplayName(mod);
  return (
    <div className="drag-overlay flex items-center gap-3 px-4 py-2.5">
      <GripVertical className="w-4 h-4 text-morandi-accent" />
      <div className={clsx("w-5 h-5 rounded border-2 flex items-center justify-center shrink-0",
        mod.isEnabled ? "bg-morandi-success border-morandi-success" : "border-morandi-border")}>
        {mod.isEnabled && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
      </div>
      <div className="w-10 h-10 rounded-md bg-morandi-sidebar flex items-center justify-center shrink-0 overflow-hidden">
        {mod.imgPath ? <img src={`file:///${mod.imgPath.replace(/\\/g, '/')}`} className="w-full h-full object-cover" alt="" draggable={false} />
        : <Package className="w-5 h-5 text-morandi-text-muted" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-morandi-text truncate">{displayName}</div>
        {mod.author && <div className="text-xs text-morandi-accent truncate">{mod.author}</div>}
      </div>
    </div>
  );
}

// ─── 主列表 ────────────────────────────────────────────────────────────────

export default function ModList() {
  const t = useT();
  const filter = useStore(s => s.filter);
  const setFilter = useStore(s => s.setFilter);
  const setMods = useStore(s => s.setMods);
  const mods = useStore(s => s.mods);
  const isScanning = useStore(s => s.isScanning);
  const setIsScanning = useStore(s => s.setIsScanning);
  const markDirty = useStore(s => s.markDirty);
  const openCompatPanel = useStore(s => s.openCompatPanel);
  const openDependencyModal = useStore(s => s.openDependencyModal);
  const openDependencyAlert = useStore(s => s.openDependencyAlert);
  const subscribedWorkshopIds = useStore(s => s.subscribedWorkshopIds);
  const categories = useStore(s => s.categories);
  const setCategories = useStore(s => s.setCategories);
  const categoryFilter = useStore(s => s.categoryFilter);
  const openUpdateModal = useStore(s => s.openUpdateModal);
  const isCheckingUpdates = useStore(s => s.isCheckingUpdates);
  const setIsCheckingUpdates = useStore(s => s.setIsCheckingUpdates);
  const refreshOverwriteStats = useStore(s => s.refreshOverwriteStats);
  const currentGame = useStore(s => s.currentGame);
  const activePresetName = useStore(s => s.activePresetName);
  // 显示模式（来自独立的持久化 store）
  const viewMode = useViewModeStore(s => s.current);
  const loadMode = useViewModeStore(s => s.loadMode);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedMod, setSelectedMod] = useState<Mod | null>(null);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const pendingDependencyAlertRef = useRef<string | null>(null);
  const dragReorderEnabled = viewMode === "all" && !filter && !categoryFilter;

  useEffect(() => {
    const onDone = (modName: string) => {
      if (pendingDependencyAlertRef.current !== modName) return;
      pendingDependencyAlertRef.current = null;
      const { mods: currentMods, subscribedWorkshopIds: subs } = useStore.getState();
      const updated = currentMods.find(m => m.name === modName);
      if (updated?.isEnabled) {
        const report = getModDependencyReport(updated, currentMods, subs);
        if (report) openDependencyAlert([report]);
      }
    };
    const off = window.api.onPrerequisitesCheckDone?.(onDone);
    return () => off?.();
  }, [openDependencyAlert]);

  // 切换 game / profile 时自动加载已记忆的显示模式
  useEffect(() => {
    if (activePresetName) loadMode(currentGame, activePresetName);
  }, [currentGame, activePresetName, loadMode]);

  useEffect(() => {
    if (!importMessage) return;
    const id = window.setTimeout(() => setImportMessage(null), 5000);
    return () => window.clearTimeout(id);
  }, [importMessage]);

  const filteredMods = useMemo(() => {
    // 第一步：按显示模式过滤（启用/禁用/全部）
    let result = mods;
    if (viewMode === "enabled") result = mods.filter(m => m.isEnabled);
    else if (viewMode === "disabled") result = mods.filter(m => !m.isEnabled);
    // 按分类筛选
    if (categoryFilter) {
      result = result.filter(m => getModCategory(m) === categoryFilter);
    }
    // 按搜索文本过滤
    if (!filter) return result;
    const l = filter.toLowerCase();
    return result.filter(m => {
      const name = m.name?.toLowerCase() || "";
      const humanName = m.humanName?.toLowerCase() || "";
      const workshopId = m.workshopId || "";
      return name.includes(l) || humanName.includes(l) || workshopId.includes(l);
    });
  }, [mods, filter, viewMode, categoryFilter]);

  const outdatedCount = useMemo(
    () => mods.filter(isModOutdated).length,
    [mods],
  );

  const outdatedByName = useMemo(() => {
    const map: Record<string, boolean> = {};
    for (const mod of mods) {
      if (isModOutdated(mod)) map[mod.name] = true;
    }
    return map;
  }, [mods]);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const activeMod = useMemo(() => activeId ? mods.find(m => m.name === activeId) ?? null : null, [activeId, mods]);

  // 稳定的回调，避免 memo 化的 ModRow 因 props 变化而重渲染
  const handleToggle = useCallback(async (mod: Mod) => {
    const wasEnabled = mod.isEnabled;
    if (!wasEnabled && !useStore.getState().dependencyAlertsSuppressed) {
      pendingDependencyAlertRef.current = mod.name;
    } else if (pendingDependencyAlertRef.current === mod.name) {
      pendingDependencyAlertRef.current = null;
    }
    try {
      const result = await window.api.toggleMod(mod.name);
      if (Array.isArray(result)) {
        setMods(result);
        markDirty();
      }
    } catch (e) {
      if (pendingDependencyAlertRef.current === mod.name) {
        pendingDependencyAlertRef.current = null;
      }
      console.error("Failed to toggle mod:", e);
    }
  }, [setMods, markDirty]);

  const handleShowDetail = useCallback((mod: Mod) => {
    setSelectedMod(mod);
  }, []);

  // 点击某 mod 的覆盖徽标 → 打开面板并聚焦该 mod
  const handleShowCompat = useCallback((modName: string) => {
    openCompatPanel(modName);
  }, [openCompatPanel]);

  const handleShowDependency = useCallback((modName: string) => {
    openDependencyModal(modName);
  }, [openDependencyModal]);

  const handleShowUpdate = useCallback((modName: string) => {
    openUpdateModal(modName);
  }, [openUpdateModal]);

  const handleRequestDownload = useCallback(async (mod: Mod) => {
    if (!mod.workshopId || !window.api.triggerWorkshopDownload) return;
    try {
      const result = await window.api.triggerWorkshopDownload(mod.workshopId);
      if (Array.isArray(result.mods)) setMods(result.mods);
      if (result.subscribedWorkshopIds) {
        useStore.setState({ subscribedWorkshopIds: result.subscribedWorkshopIds });
      }
      if (!result.ok) {
        const code = result.errorCode ?? result.error ?? "unknown";
        const errKey = `update.error.${code}`;
        const errText = code in { STEAM_UNAVAILABLE: 1, STEAM_DOWNLOAD_FAILED: 1, INVALID: 1, unknown: 1 }
          ? t(errKey)
          : (result.error ?? code);
        setImportMessage(t("modlist.workshopActionFailed", { error: errText }));
      }
    } catch (e) {
      console.error("Failed to trigger workshop download:", e);
      setImportMessage(t("modlist.workshopActionFailed", { error: String(e) }));
    }
  }, [setMods, t]);

  const handleCheckUpdates = useCallback(async () => {
    setIsCheckingUpdates(true);
    try {
      const result = await window.api.checkModUpdates(true);
      setMods(result.mods);
    } catch (e) {
      console.error("Failed to check updates:", e);
    } finally {
      setIsCheckingUpdates(false);
    }
  }, [setMods, setIsCheckingUpdates]);

  const handleUpdateAll = useCallback(async () => {
    if (outdatedCount === 0) return;
    if (!window.confirm(t("update.updateAllConfirm", { n: outdatedCount }))) return;
    setIsCheckingUpdates(true);
    try {
      const result = await window.api.forceUpdateAllOutdated();
      setMods(result.mods);
      if (result.failed?.length) {
        setImportMessage(t("modlist.updateAllResult", {
          updated: String(result.updated),
          failed: result.failed.join(", "),
        }));
      } else {
        setImportMessage(t("modlist.updateAllSuccess", { n: result.updated }));
      }
    } catch (e) {
      console.error("Failed to update all:", e);
    } finally {
      setIsCheckingUpdates(false);
    }
  }, [outdatedCount, setMods, setIsCheckingUpdates, t]);

  const handleCategoryChange = useCallback(async (modName: string, category: string | null) => {
    try {
      const result = await window.api.setModCategory(modName, category);
      setMods(result.mods);
      setCategories(result.categories);
      setSelectedMod(prev => prev?.name === modName
        ? result.mods.find(m => m.name === modName) ?? prev
        : prev);
      markDirty();
    } catch (e) {
      console.error("Failed to set mod category:", e);
    }
  }, [setMods, setCategories, markDirty]);

  const handleAddCategory = useCallback(async (name: string) => {
    try {
      const list = await window.api.addCustomCategory(name);
      setCategories(list);
    } catch (e) {
      console.error("Failed to add category:", e);
    }
  }, [setCategories]);

  const dependencyIssueCounts = useMemo(() => {
    const ctx = { mods, subscribedWorkshopIds: new Set(subscribedWorkshopIds) };
    const counts: Record<string, number> = {};
    for (const mod of mods) {
      if (!mod.isEnabled) continue;
      const n = getModDependencyIssues(mod, ctx).length;
      if (n > 0) counts[mod.name] = n;
    }
    return counts;
  }, [mods, subscribedWorkshopIds]);

  const handleEnableAll = useCallback(async () => {
    try {
      const result = await window.api.enableAll();
      const mods = Array.isArray(result) ? result : result.mods;
      const skipped = Array.isArray(result) ? [] : (result.skipped ?? []);
      setMods(mods);
      markDirty();
      if (skipped.length > 0) {
        setImportMessage(t("modlist.enableAllSkipped", { n: skipped.length }));
      }
    } catch (e) { console.error("Failed to enable all:", e); }
  }, [setMods, markDirty, t]);

  const handleDisableAll = useCallback(async () => {
    try {
      const result = await window.api.disableAll();
      if (Array.isArray(result)) { setMods(result); markDirty(); }
    } catch (e) { console.error("Failed to disable all:", e); }
  }, [setMods, markDirty]);

  const handleImportLocal = useCallback(async () => {
    setIsScanning(true);
    try {
      const result = await window.api.importLocalPacks();
      if (result.cancelled) return;
      if (!result.ok) {
        setImportMessage(
          result.error === "NO_GAME_PATH"
            ? t("modlist.importNoGamePath")
            : result.error ?? t("modlist.importNothing"),
        );
        return;
      }
      if (result.mods) setMods(result.mods);
      const parts: string[] = [];
      if (result.imported?.length) parts.push(t("modlist.importResult", { n: result.imported.length }));
      if (result.overwritten?.length) parts.push(t("modlist.importOverwritten", { n: result.overwritten.length }));
      if (result.skipped?.length) parts.push(t("modlist.importSkipped", { n: result.skipped.length }));
      if (result.failed?.length) parts.push(t("modlist.importFailed", { n: result.failed.length }));
      setImportMessage(parts.length ? parts.join(" · ") : t("modlist.importNothing"));
    } catch (e) {
      console.error("Failed to import local packs:", e);
    } finally {
      setIsScanning(false);
    }
  }, [setMods, setIsScanning, t]);

  const handleDeleteLocal = useCallback(async (mod: Mod) => {
    try {
      const result = await window.api.deleteLocalMod(mod.name);
      if (!result.ok) {
        const errorText = result.message ?? result.error ?? "unknown";
        setImportMessage(t("modlist.deleteLocalFailed", { error: errorText }));
        return;
      }
      if (result.mods) setMods(result.mods);
      markDirty();
      setSelectedMod(null);
      setImportMessage(t("modlist.deleteLocalSuccess", { name: getModDisplayName(mod) }));
    } catch (e) {
      console.error("Failed to delete local mod:", e);
      setImportMessage(t("modlist.deleteLocalFailed", { error: String(e) }));
    }
  }, [setMods, markDirty, t]);

  const handleDragStart = useCallback((e: DragStartEvent) => {
    setActiveId(e.active.id as string);
  }, []);

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    setActiveId(null);
    if (!dragReorderEnabled) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const fullOldIndex = mods.findIndex(m => m.name === active.id);
    const fullNewIndex = mods.findIndex(m => m.name === over.id);
    if (fullOldIndex === -1 || fullNewIndex === -1) return;
    const ordered = [...mods];
    const [moved] = ordered.splice(fullOldIndex, 1);
    ordered.splice(fullNewIndex, 0, moved);
    try {
      const result = await window.api.applyDragOrder(ordered.map(m => m.name));
      if (Array.isArray(result)) {
        setMods(result);
        markDirty();
      }
    } catch (e) {
      console.error("Failed to apply drag order:", e);
    }
  }, [mods, setMods, markDirty, dragReorderEnabled]);

  const scrollModIntoView = useCallback((modName: string, edge: "top" | "bottom") => {
    requestAnimationFrame(() => {
      document.querySelector(`[data-mod-name="${globalThis.CSS.escape(modName)}"]`)
        ?.scrollIntoView({ block: edge === "top" ? "start" : "end", behavior: "smooth" });
    });
  }, []);

  const applyOrder = useCallback(async (orderedNames: string[], scrollTarget?: { name: string; edge: "top" | "bottom" }) => {
    try {
      const result = await window.api.applyDragOrder(orderedNames);
      if (Array.isArray(result)) {
        setMods(result);
        markDirty();
        if (scrollTarget) scrollModIntoView(scrollTarget.name, scrollTarget.edge);
      }
    } catch (e) {
      console.error("Failed to apply load order:", e);
    }
  }, [setMods, markDirty, scrollModIntoView]);

  const handleMoveToTop = useCallback((mod: Mod) => {
    void applyOrder(reorderModToEdge(mods, mod.name, "top"), { name: mod.name, edge: "top" });
  }, [mods, applyOrder]);

  const handleMoveToBottom = useCallback((mod: Mod) => {
    void applyOrder(reorderModToEdge(mods, mod.name, "bottom"), { name: mod.name, edge: "bottom" });
  }, [mods, applyOrder]);

  const listEdgeByName = useMemo(() => {
    const top = mods[0]?.name;
    const bottom = mods[mods.length - 1]?.name;
    return { top, bottom };
  }, [mods]);

  // ── 实时刷新覆盖统计 ──
  // 当启用的 mod 集合或其加载顺序变化时，防抖刷新后端覆盖统计。
  // 签名包含所有启用 mod 的 name+loadOrder，勾选/取消/拖动都会改变它。
  const enabledSignature = useMemo(
    () => mods.filter(m => m.isEnabled).map(m => `${m.name}:${m.loadOrder ?? 0}`).join("|"),
    [mods],
  );
  useEffect(() => {
    if (!enabledSignature) return;
    const handle = setTimeout(() => { refreshOverwriteStats(); }, 250);
    return () => clearTimeout(handle);
  }, [enabledSignature, refreshOverwriteStats]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-4 py-3 border-b border-morandi-border-light bg-morandi-card flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-morandi-text-muted" />
          <input type="text" value={filter} onChange={e => setFilter(e.target.value)}
            placeholder={t("modlist.filterPlaceholder")} className="input-morandi !pl-9 !py-1.5" />
        </div>
        {/* 显示模式切换器（per-profile 自动记忆） */}
        <ViewModeToggle />
        <CategoryFilter />
        <button
          onClick={handleImportLocal}
          disabled={isScanning}
          className="btn-morandi-ghost text-xs flex items-center gap-1"
          title={t("modlist.importLocalTooltip")}
        >
          <FolderInput className="w-3.5 h-3.5" />
          {t("modlist.importLocal")}
        </button>
        <button
          onClick={handleCheckUpdates}
          disabled={isCheckingUpdates || isScanning}
          className="btn-morandi-ghost text-xs flex items-center gap-1 relative"
          title={t("update.checkUpdates")}
        >
          <RefreshCw className={clsx("w-3.5 h-3.5", isCheckingUpdates && "animate-spin")} />
          {t("update.checkUpdates")}
          {outdatedCount > 0 && (
            <span className="ml-1 min-w-[1.1rem] h-[1.1rem] px-1 rounded-full bg-morandi-accent text-white text-[10px] font-semibold inline-flex items-center justify-center">
              {outdatedCount}
            </span>
          )}
        </button>
        {outdatedCount > 0 && (
          <button
            onClick={handleUpdateAll}
            disabled={isCheckingUpdates || isScanning}
            className="btn-morandi-ghost text-xs flex items-center gap-1 text-morandi-accent"
            title={t("update.updateAll")}
          >
            <DownloadCloud className="w-3.5 h-3.5" />
            {t("update.updateAll")}
          </button>
        )}
        <div className="flex items-center gap-1">
          <button onClick={handleEnableAll} className="btn-morandi-ghost text-xs">
            <ToggleRight className="w-3.5 h-3.5 inline mr-1" />{t("modlist.allOn")}</button>
          <button onClick={handleDisableAll} className="btn-morandi-ghost text-xs">
            <ToggleLeft className="w-3.5 h-3.5 inline mr-1" />{t("modlist.allOff")}</button>
        </div>
        <div className="text-xs text-morandi-text-muted ml-auto shrink-0">
          {isScanning ? (
            <span className="text-morandi-accent">{t("common.loading")}</span>
          ) : (
            <button
              type="button"
              className="p-1 rounded-md text-morandi-accent/80 hover:bg-morandi-hover transition-colors"
              title={t("modlist.loadOrderHint")}
              aria-label={t("modlist.loadOrderHint")}
            >
              <ArrowDown className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
      {importMessage && (
        <div className="px-4 py-1.5 text-xs text-morandi-accent bg-morandi-accent/5 border-b border-morandi-border-light">
          {importMessage}
        </div>
      )}
      {!dragReorderEnabled && !isScanning && filteredMods.length > 0 && (
        <div className="px-4 py-1 text-[11px] text-morandi-text-muted border-b border-morandi-border-light">
          {t("modlist.dragDisabledHint")}
        </div>
      )}
      <div className="flex-1 overflow-y-auto">
        {isScanning ? (
          <div className="flex items-center justify-center h-full text-morandi-text-muted">
            <div className="text-center">
              <div className="w-8 h-8 border-2 border-morandi-accent-light border-t-morandi-accent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm">{t("modlist.scanning")}</p>
            </div>
          </div>
        ) : filteredMods.length === 0 ? (
          <div className="flex items-center justify-center h-full text-morandi-text-muted">
            <p className="text-sm">{filter || categoryFilter ? t("modlist.noMatch") : t("modlist.noMods")}</p>
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}>
            <SortableContext items={filteredMods.map(m => m.name)} strategy={verticalListSortingStrategy}>
              {filteredMods.map(mod => (
                <ModRow
                  key={mod.name}
                  mod={mod}
                  onToggle={handleToggle}
                  onShowDetail={handleShowDetail}
                  onShowCompat={handleShowCompat}
                  onShowDependency={handleShowDependency}
                  onShowUpdate={handleShowUpdate}
                  onRequestDownload={handleRequestDownload}
                  dependencyIssueCount={dependencyIssueCounts[mod.name] ?? 0}
                  hasUpdate={!!outdatedByName[mod.name]}
                  category={getModCategory(mod)}
                  categories={categories}
                  onCategoryChange={handleCategoryChange}
                  onAddCategory={handleAddCategory}
                  onMoveToTop={handleMoveToTop}
                  onMoveToBottom={handleMoveToBottom}
                  isAtListTop={mod.name === listEdgeByName.top}
                  isAtListBottom={mod.name === listEdgeByName.bottom}
                />
              ))}
            </SortableContext>
            <DragOverlay>{activeMod ? <DragOverlayContent mod={activeMod} /> : null}</DragOverlay>
          </DndContext>
        )}
      </div>

      {/* Mod 详情弹窗 */}
      {selectedMod && (
        <ModDetailModal
          mod={selectedMod}
          onClose={() => setSelectedMod(null)}
          categories={categories}
          onCategoryChange={handleCategoryChange}
          onAddCategory={handleAddCategory}
          onShowUpdate={handleShowUpdate}
          onDeleteLocal={handleDeleteLocal}
        />
      )}
    </div>
  );
}
