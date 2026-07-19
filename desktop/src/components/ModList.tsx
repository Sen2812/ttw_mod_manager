import { useState, useMemo, useCallback, useEffect, useRef, memo, type ReactNode, type RefObject } from "react";
import {
  DndContext, closestCenter, KeyboardSensor, MouseSensor, useSensor, useSensors,
  DragEndEvent, DragOverlay, DragStartEvent, useDroppable,
} from "@dnd-kit/core";
import {
  SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useStore } from "../store";
import { useT } from "../i18n";
import {
  GripVertical, Package, Info, ArrowDown, ArrowUp,
  AlertTriangle, DownloadCloud, RefreshCw, Loader2, FolderInput, X, Plus,
} from "lucide-react";
import clsx from "clsx";
import type { Mod, ModConflictStats } from "../types";
import ModDetailModal from "./ModDetailModal";
import ModListFiltersBar from "./ModListFiltersBar";
import ModRowTags from "./ModRowTags";
import { useModListVirtualizer, VirtualModRows } from "./VirtualModRows";
import { useWorkshopTitlePrefetch } from "../hooks/useWorkshopTitlePrefetch";
import { getModDependencyIssues } from "@core/mod-manager/dependency-checker";
import { getModWorkshopTags } from "@core/mod-manager/category-utils";
import { getModDisplayName, getModSourceType } from "@core/mod-manager/mod-display";
import { isModOutdated } from "@core/mod-manager/workshop-update-status";
import { sortByName, getEnabledModsInLoadOrder } from "@core/mod-manager/mod-sorting";
import {
  getEnabledModNames,
  insertEnabledModInOrder,
  reorderEnabledModByStep,
} from "../utils/load-order";
import {
  DEFAULT_MOD_LIST_FILTERS,
  collectModFilterTags,
  filterMods,
  hasActiveModFilters,
  type ModListFilterState,
} from "../utils/mod-list-filters";
import { useWorkshopTagLabel } from "../utils/workshop-tag-label";

const PROFILE_PREFIX = "profile:";

function profileId(modName: string): string {
  return `${PROFILE_PREFIX}${modName}`;
}

function parseProfileDragId(id: string): string | null {
  if (!id.startsWith(PROFILE_PREFIX)) return null;
  return id.slice(PROFILE_PREFIX.length);
}

function modLabel(mods: Mod[], packName: string): string {
  const m = mods.find(x => x.name === packName);
  return m ? getModDisplayName(m) : packName.replace(/\.pack$/i, "");
}

function buildOverwriteTooltip(
  t: (key: string, params?: Record<string, string | number>) => string,
  stats: ModConflictStats,
  mods: Mod[],
): string {
  const lines: string[] = [];
  const beatNames = stats.overwrites?.slice(0, 3).map(r => modLabel(mods, r.modName));
  const loseNames = stats.overwrittenBy?.slice(0, 3).map(r => modLabel(mods, r.modName));

  if (stats.wins > 0 && beatNames?.length) {
    lines.push(t("modlist.rowOverwriteBeats", { mods: beatNames.join(" · ") }));
  }
  if (stats.losses > 0 && loseNames?.length) {
    lines.push(t("modlist.rowOverwriteLosesTo", { mods: loseNames.join(" · ") }));
  }
  if (lines.length === 0) {
    lines.push(t("compat.noConflictsForMod"));
  }
  lines.push(t("modlist.rowOverwriteTooltip"));
  return lines.join("\n");
}

function isAwaitingDownloadOnly(mod: Mod): boolean {
  return !!mod.pendingDownload && !(mod.size && mod.size > 0);
}

interface ModRowActionsProps {
  mod: Mod;
  allMods: Mod[];
  inProfile: boolean;
  dependencyIssueCount: number;
  hasUpdate: boolean;
  overwriteStats?: ModConflictStats;
  onShowCompat: (modName: string) => void;
  onShowDependency: (modName: string) => void;
  onShowUpdate: (modName: string) => void;
  onRequestDownload: (mod: Mod) => void;
}

function ModRowActions({
  mod, allMods, inProfile, dependencyIssueCount, hasUpdate, overwriteStats,
  onShowCompat, onShowDependency, onShowUpdate, onRequestDownload,
}: ModRowActionsProps) {
  const t = useT();
  const isCheckingPrerequisites = useStore(s => !!s.prerequisiteChecking[mod.name]);

  return (
    <div className="flex items-center gap-1 shrink-0">
      {mod.pendingDownload && (
        <button
          onClick={(e) => { e.stopPropagation(); onRequestDownload(mod); }}
          className="icon-btn-accent"
          title={t("modlist.requestDownloadTooltip")}
        >
          <DownloadCloud className="w-4 h-4" />
        </button>
      )}
      {isCheckingPrerequisites && !mod.pendingDownload && (
        <span className="icon-btn-accent pointer-events-none" title={t("dependency.checking")}>
          <Loader2 className="w-4 h-4 animate-spin" />
        </span>
      )}
      {hasUpdate && (
        <button
          onClick={(e) => { e.stopPropagation(); onShowUpdate(mod.name); }}
          className="icon-btn-accent"
          title={t("modlist.updateTooltip")}
        >
          <DownloadCloud className="w-4 h-4" />
        </button>
      )}
      {inProfile && dependencyIssueCount > 0 && (
        <button
          onClick={(e) => { e.stopPropagation(); onShowDependency(mod.name); }}
          className="icon-btn-warning"
          title={t("modlist.dependencyTooltip", { n: dependencyIssueCount })}
        >
          <AlertTriangle className="w-4 h-4" />
        </button>
      )}
      {inProfile && overwriteStats && (overwriteStats.wins > 0 || overwriteStats.losses > 0) && (
        <button
          onClick={(e) => { e.stopPropagation(); onShowCompat(mod.name); }}
          className="chip-neutral gap-1"
          title={buildOverwriteTooltip(t, overwriteStats, allMods)}
        >
          {overwriteStats.wins > 0 && (
            <span className="chip-success">{t("modlist.overwriteActiveShort", { n: overwriteStats.wins })}</span>
          )}
          {overwriteStats.losses > 0 && (
            <span className="chip-danger">{t("modlist.overwriteOverriddenShort", { n: overwriteStats.losses })}</span>
          )}
        </button>
      )}
    </div>
  );
}

interface ModRowMetaProps {
  mod: Mod;
  emphasized?: boolean;
}

function ModRowMeta({ mod, emphasized }: ModRowMetaProps) {
  const displayName = getModDisplayName(mod);
  const workshopTags = getModWorkshopTags(mod);

  return (
    <>
      <div className="thumb-morandi">
        {mod.imgPath ? (
          <img
            src={`file:///${mod.imgPath.replace(/\\/g, "/")}`}
            className="w-full h-full object-cover"
            alt={displayName}
            loading="lazy"
            draggable={false}
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
              (e.target as HTMLImageElement).nextElementSibling?.classList.remove("hidden");
            }}
          />
        ) : null}
        <Package className={clsx("w-5 h-5 text-morandi-text-muted", mod.imgPath && "hidden")} />
      </div>
      <div className="flex-1 min-w-0">
        <div className={clsx(
          "text-sm truncate",
          emphasized ? "text-morandi-text font-medium" : "text-morandi-text-secondary",
        )}>
          {displayName}
        </div>
        <ModRowTags
          source={getModSourceType(mod)}
          workshopTags={workshopTags}
        />
      </div>
    </>
  );
}

interface CatalogModRowProps {
  mod: Mod;
  allMods: Mod[];
  onAddToProfile: (mod: Mod) => void;
  onShowDetail: (mod: Mod) => void;
  onShowCompat: (modName: string) => void;
  onShowDependency: (modName: string) => void;
  onShowUpdate: (modName: string) => void;
  onRequestDownload: (mod: Mod) => void;
  dependencyIssueCount: number;
  hasUpdate: boolean;
}

const CatalogModRow = memo(function CatalogModRow({
  mod, allMods, onAddToProfile, onShowDetail, onShowCompat, onShowDependency, onShowUpdate, onRequestDownload,
  dependencyIssueCount, hasUpdate,
}: CatalogModRowProps) {
  const t = useT();
  const awaitingDownloadOnly = isAwaitingDownloadOnly(mod);
  const canAdd = !awaitingDownloadOnly;

  return (
    <div
      data-catalog-mod-name={mod.name}
      className={clsx(
        "group list-row-catalog",
        mod.isEnabled && "opacity-80",
        awaitingDownloadOnly && "opacity-70",
      )}
      onDoubleClick={() => onShowDetail(mod)}
    >
      <ModRowMeta mod={mod} />
      <div className="shrink-0 self-start mt-1">
        <ModRowActions
          mod={mod}
          allMods={allMods}
          inProfile={false}
          dependencyIssueCount={dependencyIssueCount}
          hasUpdate={hasUpdate}
          onShowCompat={onShowCompat}
          onShowDependency={onShowDependency}
          onShowUpdate={onShowUpdate}
          onRequestDownload={onRequestDownload}
        />
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onShowDetail(mod); }}
        className="icon-btn shrink-0 self-start mt-0.5"
        title={t("modlist.viewDetails")}
      >
        <Info className="w-4 h-4" />
      </button>
      {canAdd ? (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onAddToProfile(mod); }}
          className="icon-btn-accent-solid shrink-0 self-start"
          title={t("modlist.addToProfileHint")}
          aria-label={t("modlist.addToProfile")}
        >
          <Plus className="w-4 h-4" strokeWidth={2.5} />
        </button>
      ) : (
        <div className="w-7 shrink-0 self-start" title={t("modlist.downloadingTooltip")} aria-label={t("modlist.downloadingTooltip")} />
      )}
    </div>
  );
});

interface ProfileModRowProps {
  mod: Mod;
  allMods: Mod[];
  overwriteStats?: ModConflictStats;
  onShowDetail: (mod: Mod) => void;
  onShowCompat: (modName: string) => void;
  onShowDependency: (modName: string) => void;
  onShowUpdate: (modName: string) => void;
  onRequestDownload: (mod: Mod) => void;
  onRemove: (mod: Mod) => void;
  onMoveUp: (mod: Mod) => void;
  onMoveDown: (mod: Mod) => void;
  dependencyIssueCount: number;
  hasUpdate: boolean;
  isAtListTop: boolean;
  isAtListBottom: boolean;
}

const ProfileModRow = memo(function ProfileModRow({
  mod, allMods, overwriteStats, onShowDetail, onShowCompat, onShowDependency, onShowUpdate, onRequestDownload, onRemove,
  onMoveUp, onMoveDown,
  dependencyIssueCount, hasUpdate,
  isAtListTop, isAtListBottom,
}: ProfileModRowProps) {
  const t = useT();
  const isCheckingPrerequisites = useStore(s => !!s.prerequisiteChecking[mod.name]);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: profileId(mod.name),
    data: { kind: "profile", modName: mod.name },
  });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-profile-mod-name={mod.name}
      className={clsx(
        "group list-row-profile",
        isDragging && "opacity-50",
        isCheckingPrerequisites && "list-row-highlight",
      )}
      onDoubleClick={() => onShowDetail(mod)}
    >
      <div className="flex items-center gap-0.5 shrink-0 self-start mt-0.5">
        <div
          {...attributes}
          {...listeners}
          className="drag-handle"
          title={t("modlist.dragReorderHint")}
          aria-label={t("modlist.dragReorderHint")}
        >
          <GripVertical className="w-4 h-4 text-morandi-text-secondary" />
        </div>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onMoveUp(mod); }}
          disabled={isAtListTop}
          className="icon-btn-bordered"
          title={t("modlist.moveUpHint")}
          aria-label={t("modlist.moveUp")}
        >
          <ArrowUp className="w-3.5 h-3.5" strokeWidth={2.25} />
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onMoveDown(mod); }}
          disabled={isAtListBottom}
          className="icon-btn-bordered"
          title={t("modlist.moveDownHint")}
          aria-label={t("modlist.moveDown")}
        >
          <ArrowDown className="w-3.5 h-3.5" strokeWidth={2.25} />
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRemove(mod); }}
          className="icon-btn-danger"
          title={t("modlist.removeFromProfileHint")}
          aria-label={t("modlist.removeFromProfile")}
        >
          <X className="w-3.5 h-3.5" strokeWidth={2.25} />
        </button>
      </div>
      <ModRowMeta mod={mod} emphasized />
      <div className="shrink-0 self-start mt-1">
        <ModRowActions
          mod={mod}
          allMods={allMods}
          inProfile
          dependencyIssueCount={dependencyIssueCount}
          hasUpdate={hasUpdate}
          overwriteStats={overwriteStats}
          onShowCompat={onShowCompat}
          onShowDependency={onShowDependency}
          onShowUpdate={onShowUpdate}
          onRequestDownload={onRequestDownload}
        />
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onShowDetail(mod); }}
        className="icon-btn shrink-0 self-start mt-0.5"
        title={t("modlist.viewDetails")}
      >
        <Info className="w-4 h-4" />
      </button>
    </div>
  );
});

function DragOverlayContent({ mod }: { mod: Mod }) {
  return (
    <div className="drag-overlay flex items-center gap-3 px-4 py-2.5">
      <GripVertical className="w-4 h-4 text-morandi-accent" />
      <div className="text-sm font-medium text-morandi-text truncate">{getModDisplayName(mod)}</div>
    </div>
  );
}

function ModPanel({
  title,
  titleHint,
  subtitle,
  headerExtra,
  dropId,
  isOverClass,
  scrollRef,
  children,
  empty,
}: {
  title: string;
  titleHint?: string;
  subtitle?: string;
  headerExtra?: ReactNode;
  dropId: string;
  isOverClass?: string;
  scrollRef?: RefObject<HTMLDivElement | null>;
  children: ReactNode;
  empty?: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: dropId });
  const mergedScrollRef = useCallback((node: HTMLDivElement | null) => {
    setNodeRef(node);
    if (scrollRef) {
      (scrollRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
    }
  }, [setNodeRef, scrollRef]);

  return (
    <div className="flex-1 min-w-0 flex flex-col border-r border-morandi-border-light last:border-r-0">
      <div className="panel-header">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-morandi-text truncate" title={titleHint}>{title}</h3>
            {subtitle && <p className="text-xs text-morandi-text-muted mt-0.5">{subtitle}</p>}
          </div>
        </div>
        {headerExtra}
      </div>
      <div
        ref={mergedScrollRef}
        className={clsx(
          "flex-1 overflow-y-auto min-h-0 transition-colors",
          isOver && isOverClass,
        )}
      >
        {empty ?? children}
      </div>
    </div>
  );
}

export default function ModList() {
  const t = useT();
  const setMods = useStore(s => s.setMods);
  const mods = useStore(s => s.mods);
  const isScanning = useStore(s => s.isScanning);
  const setIsScanning = useStore(s => s.setIsScanning);
  const markDirty = useStore(s => s.markDirty);
  const openCompatPanel = useStore(s => s.openCompatPanel);
  const openDependencyModal = useStore(s => s.openDependencyModal);
  const subscribedWorkshopIds = useStore(s => s.subscribedWorkshopIds);
  const openUpdateModal = useStore(s => s.openUpdateModal);
  const isCheckingUpdates = useStore(s => s.isCheckingUpdates);
  const setIsCheckingUpdates = useStore(s => s.setIsCheckingUpdates);
  const refreshOverwriteStats = useStore(s => s.refreshOverwriteStats);
  const overwriteStatsMap = useStore(s => s.overwriteStats);
  const activePresetName = useStore(s => s.activePresetName);
  const profileSwitching = useStore(s => s.profileSwitching);
  const tagLabel = useWorkshopTagLabel();

  const [modFilters, setModFilters] = useState<ModListFilterState>(DEFAULT_MOD_LIST_FILTERS);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [selectedMod, setSelectedMod] = useState<Mod | null>(null);
  const [importMessage, setImportMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!importMessage) return;
    const id = window.setTimeout(() => setImportMessage(null), 5000);
    return () => window.clearTimeout(id);
  }, [importMessage]);

  const filterOptions = useMemo(() => ({ tagLabel }), [tagLabel]);
  const filtersActive = hasActiveModFilters(modFilters);
  const availableTags = useMemo(
    () => collectModFilterTags(mods.filter(m => !m.isEnabled)),
    [mods],
  );

  const catalogMods = useMemo(() => {
    const sorted = sortByName(mods.filter(m => !m.isEnabled));
    return filterMods(sorted, modFilters, filterOptions);
  }, [mods, modFilters, filterOptions]);

  const profileMods = useMemo(() => getEnabledModsInLoadOrder(mods), [mods]);

  const outdatedCount = useMemo(() => mods.filter(isModOutdated).length, [mods]);

  const outdatedByName = useMemo(() => {
    const map: Record<string, boolean> = {};
    for (const mod of mods) {
      if (isModOutdated(mod)) map[mod.name] = true;
    }
    return map;
  }, [mods]);

  const dependencyIssueCounts = useMemo(() => {
    const ctx = { mods, subscribedWorkshopIds: new Set(subscribedWorkshopIds) };
    const counts: Record<string, number> = {};
    for (const mod of profileMods) {
      const n = getModDependencyIssues(mod, ctx).length;
      if (n > 0) counts[mod.name] = n;
    }
    return counts;
  }, [profileMods, mods, subscribedWorkshopIds]);

  const listEdgeByName = useMemo(() => ({
    top: profileMods[0]?.name,
    bottom: profileMods[profileMods.length - 1]?.name,
  }), [profileMods]);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const activeDragMod = useMemo(() => {
    if (!activeDragId) return null;
    const modName = parseProfileDragId(activeDragId);
    if (!modName) return null;
    return mods.find(m => m.name === modName) ?? null;
  }, [activeDragId, mods]);

  const scrollProfileModIntoView = useCallback((modName: string, block: ScrollLogicalPosition = "nearest") => {
    requestAnimationFrame(() => {
      document.querySelector(`[data-profile-mod-name="${globalThis.CSS.escape(modName)}"]`)
        ?.scrollIntoView({ block, behavior: "smooth" });
    });
  }, []);

  const applyProfileOrder = useCallback(async (
    orderedNames: string[],
    scroll?: { modName: string; block?: ScrollLogicalPosition },
  ) => {
    try {
      const result = await window.api.applyDragOrder(orderedNames);
      if (Array.isArray(result)) {
        setMods(result);
        markDirty();
        if (scroll) scrollProfileModIntoView(scroll.modName, scroll.block ?? "nearest");
      }
    } catch (e) {
      console.error("Failed to apply load order:", e);
    }
  }, [setMods, markDirty, scrollProfileModIntoView]);

  const addModToProfile = useCallback(async (modName: string, beforeModName: string | null) => {
    const mod = mods.find(m => m.name === modName);
    if (!mod || isAwaitingDownloadOnly(mod)) return;

    let nextMods = mods;
    if (!mod.isEnabled) {
      try {
        const enabled = await window.api.enableMod(modName);
        if (!Array.isArray(enabled)) return;
        nextMods = enabled;
        setMods(nextMods);
      } catch (e) {
        console.error("Failed to enable mod:", e);
        return;
      }
    }

    const ordered = insertEnabledModInOrder(nextMods, modName, beforeModName);
    await applyProfileOrder(ordered, { modName });
  }, [mods, setMods, applyProfileOrder]);

  const removeModFromProfile = useCallback(async (mod: Mod) => {
    try {
      const result = await window.api.disableMod(mod.name);
      if (Array.isArray(result)) {
        setMods(result);
        markDirty();
      }
    } catch (e) {
      console.error("Failed to remove mod from profile:", e);
    }
  }, [setMods, markDirty]);

  const handleShowDetail = useCallback((mod: Mod) => setSelectedMod(mod), []);
  const handleShowCompat = useCallback((modName: string) => openCompatPanel(modName), [openCompatPanel]);
  const handleShowDependency = useCallback((modName: string) => openDependencyModal(modName), [openDependencyModal]);
  const handleShowUpdate = useCallback((modName: string) => openUpdateModal(modName), [openUpdateModal]);

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

  const handleMoveUp = useCallback((mod: Mod) => {
    void applyProfileOrder(reorderEnabledModByStep(mods, mod.name, "up"), { modName: mod.name });
  }, [mods, applyProfileOrder]);

  const handleMoveDown = useCallback((mod: Mod) => {
    void applyProfileOrder(reorderEnabledModByStep(mods, mod.name, "down"), { modName: mod.name });
  }, [mods, applyProfileOrder]);

  const handleDragStart = useCallback((e: DragStartEvent) => {
    setActiveDragId(String(e.active.id));
  }, []);

  const handleAddFromCatalog = useCallback((mod: Mod) => {
    void addModToProfile(mod.name, null);
  }, [addModToProfile]);

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    setActiveDragId(null);
    const { active, over } = event;
    if (!over) return;

    const modName = parseProfileDragId(String(active.id));
    if (!modName) return;

    const overId = String(over.id);

    if (overId === "catalog-panel") {
      const mod = mods.find(m => m.name === modName);
      if (mod) await removeModFromProfile(mod);
      return;
    }
    if (overId.startsWith(PROFILE_PREFIX)) {
      const names = getEnabledModNames(mods);
      const oldIndex = names.indexOf(modName);
      const newIndex = names.indexOf(overId.slice(PROFILE_PREFIX.length));
      if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
        await applyProfileOrder(arrayMove(names, oldIndex, newIndex), { modName });
      }
      return;
    }
    if (overId === "profile-panel") {
      await applyProfileOrder(
        insertEnabledModInOrder(mods, modName, null),
        { modName, block: "end" },
      );
    }
  }, [mods, removeModFromProfile, applyProfileOrder]);

  const enabledSignature = useMemo(
    () => profileMods.map(m => `${m.name}:${m.loadOrder ?? 0}`).join("|"),
    [profileMods],
  );
  useEffect(() => {
    if (!enabledSignature) return;
    const handle = setTimeout(() => { refreshOverwriteStats(); }, 500);
    return () => clearTimeout(handle);
  }, [enabledSignature, refreshOverwriteStats]);

  const sharedRowProps = {
    onShowDetail: handleShowDetail,
    onShowCompat: handleShowCompat,
    onShowDependency: handleShowDependency,
    onShowUpdate: handleShowUpdate,
    onRequestDownload: handleRequestDownload,
  };

  const catalogScrollRef = useRef<HTMLDivElement>(null);
  const profileScrollRef = useRef<HTMLDivElement>(null);
  const catalogVirtualizer = useModListVirtualizer(catalogMods.length, catalogScrollRef);
  const profileVirtualizer = useModListVirtualizer(profileMods.length, profileScrollRef);
  const { queueVisibleRange } = useWorkshopTitlePrefetch(mods);

  const handleCatalogVisibleRange = useCallback((start: number, end: number) => {
    queueVisibleRange(catalogMods, start, end);
  }, [catalogMods, queueVisibleRange]);

  const handleProfileVisibleRange = useCallback((start: number, end: number) => {
    queueVisibleRange(profileMods, start, end);
  }, [profileMods, queueVisibleRange]);

  useEffect(() => {
    catalogScrollRef.current?.scrollTo({ top: 0 });
    profileScrollRef.current?.scrollTo({ top: 0 });
  }, [activePresetName]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden relative">
      <div className="panel-toolbar">
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
          title={t("update.checkUpdatesTooltip")}
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
            title={t("update.updateAllTooltip")}
          >
            <DownloadCloud className="w-3.5 h-3.5" />
            {t("update.updateAll")}
          </button>
        )}
        <div className="ml-auto shrink-0">
          <button
            type="button"
            className="icon-btn-accent"
            title={t("modlist.loadOrderHint")}
            aria-label={t("modlist.loadOrderHint")}
          >
            <ArrowDown className="w-4 h-4" />
          </button>
        </div>
      </div>

      {importMessage && (
        <div className="banner-info">
          {importMessage}
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex-1 min-h-0 flex">
          <ModPanel
            title={t("modlist.panelDisabledMods")}
            titleHint={t("modlist.catalogPanelHint")}
            dropId="catalog-panel"
            isOverClass="drop-zone-danger"
            scrollRef={catalogScrollRef}
            headerExtra={(
              <ModListFiltersBar
                filters={modFilters}
                onChange={setModFilters}
                availableTags={availableTags}
              />
            )}
            empty={isScanning ? (
              <div className="flex items-center justify-center h-full text-morandi-text-muted">
                <div className="text-center">
                  <div className="w-8 h-8 border-2 border-morandi-accent-light border-t-morandi-accent rounded-full animate-spin mx-auto mb-3" />
                  <p className="text-sm">{t("modlist.scanning")}</p>
                </div>
              </div>
            ) : catalogMods.length === 0 ? (
              <div className="flex items-center justify-center h-full text-morandi-text-muted">
                <p className="text-sm">{filtersActive ? t("modlist.noMatch") : t("modlist.noDisabledMods")}</p>
              </div>
            ) : undefined}
          >
            {!isScanning && catalogMods.length > 0 && (
              <VirtualModRows
                virtualizer={catalogVirtualizer}
                items={catalogMods}
                getItemKey={(mod) => mod.name}
                onVisibleRangeChange={handleCatalogVisibleRange}
                renderItem={(mod) => (
                  <CatalogModRow
                    mod={mod}
                    allMods={mods}
                    onAddToProfile={handleAddFromCatalog}
                    {...sharedRowProps}
                    dependencyIssueCount={0}
                    hasUpdate={!!outdatedByName[mod.name]}
                  />
                )}
              />
            )}
          </ModPanel>

          <ModPanel
            title={t("modlist.panelEnabledMods")}
            titleHint={t("modlist.profilePanelHint")}
            dropId="profile-panel"
            isOverClass="drop-zone-accent"
            scrollRef={profileScrollRef}
            empty={isScanning ? null : profileMods.length === 0 ? (
              <div className="h-full" />
            ) : undefined}
          >
            <SortableContext items={profileMods.map(m => profileId(m.name))} strategy={verticalListSortingStrategy}>
              {profileMods.length > 0 && (
                <VirtualModRows
                  virtualizer={profileVirtualizer}
                  items={profileMods}
                  getItemKey={(mod) => mod.name}
                  onVisibleRangeChange={handleProfileVisibleRange}
                  renderItem={(mod) => (
                    <ProfileModRow
                      mod={mod}
                      allMods={mods}
                      overwriteStats={overwriteStatsMap?.[mod.name]}
                      {...sharedRowProps}
                      onRemove={removeModFromProfile}
                      onMoveUp={handleMoveUp}
                      onMoveDown={handleMoveDown}
                      dependencyIssueCount={dependencyIssueCounts[mod.name] ?? 0}
                      hasUpdate={!!outdatedByName[mod.name]}
                      isAtListTop={mod.name === listEdgeByName.top}
                      isAtListBottom={mod.name === listEdgeByName.bottom}
                    />
                  )}
                />
              )}
            </SortableContext>
          </ModPanel>
        </div>

        <DragOverlay>
          {activeDragMod ? <DragOverlayContent mod={activeDragMod} /> : null}
        </DragOverlay>
      </DndContext>

      {profileSwitching && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-morandi-page/60 backdrop-blur-[1px] pointer-events-none">
          <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-morandi-card shadow-sm border border-morandi-border-light text-sm text-morandi-text-secondary">
            <div className="w-4 h-4 border-2 border-morandi-accent-light border-t-morandi-accent rounded-full animate-spin" />
            {t("modlist.switchingProfile")}
          </div>
        </div>
      )}

      {selectedMod && (
        <ModDetailModal
          mod={selectedMod}
          onClose={() => setSelectedMod(null)}
          onShowUpdate={handleShowUpdate}
          onDeleteLocal={handleDeleteLocal}
        />
      )}
    </div>
  );
}
