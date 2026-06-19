import { useState, useEffect, useMemo, useCallback } from "react";
import { useStore } from "../store";
import { useT } from "../i18n";
import {
  X, RefreshCw, Loader2, Trophy, AlertTriangle, Package,
  ChevronDown, ChevronRight, Search, Info,
} from "lucide-react";
import clsx from "clsx";
import type { FileConflict, Mod, ModRelation } from "../types";
import { getModDisplayName } from "@core/mod-manager/mod-display";
import { reorderModRelative } from "../utils/load-order";
import {
  countSharedConflictCategories,
  DISPLAY_CATEGORIES,
  type CompatCategory,
} from "../utils/compat-categories";

const CATEGORY_COLORS: Record<FileConflict["category"], string> = {
  db: "text-morandi-accent",
  script: "text-morandi-success",
  ui: "text-morandi-danger",
  loc: "text-morandi-text-secondary",
  other: "text-morandi-text-muted",
};

/** 去掉 .pack 后缀，缩短显示 */
function short(name: string): string {
  return name.replace(/\.pack$/i, "");
}

function modDisplayName(mods: Mod[], packName: string): string {
  const mod = mods.find(m => m.name === packName);
  return mod ? getModDisplayName(mod) : short(packName);
}

/**
 * 单个 mod 的覆盖情况弹窗。
 * 由 mod 列表行的 ↑N ↓M 徽标点击触发（compatFocusMod 指定该 mod）。
 */
export default function CompatPanel() {
  const t = useT();
  const showCompatPanel = useStore(s => s.showCompatPanel);
  const closeCompatPanel = useStore(s => s.closeCompatPanel);
  const focusMod = useStore(s => s.compatFocusMod);
  const analysis = useStore(s => s.overwriteAnalysis);
  const stats = useStore(s => focusMod ? s.overwriteStats?.[focusMod] : undefined);
  const mods = useStore(s => s.mods);
  const setMods = useStore(s => s.setMods);
  const markDirty = useStore(s => s.markDirty);
  const refreshOverwriteStats = useStore(s => s.refreshOverwriteStats);

  const [isLoading, setIsLoading] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const mod = useMemo(() => mods.find(m => m.name === focusMod), [mods, focusMod]);

  const handleClose = useCallback(() => closeCompatPanel(), [closeCompatPanel]);

  // 无聚焦 mod 时不应打开面板
  useEffect(() => {
    if (showCompatPanel && !focusMod) closeCompatPanel();
  }, [showCompatPanel, focusMod, closeCompatPanel]);

  // 打开时拉取完整冲突列表，关闭时重置状态
  useEffect(() => {
    if (showCompatPanel && focusMod) {
      setIsLoading(true);
      setSearchText("");
      setExpanded(new Set());
      refreshOverwriteStats({ full: true }).finally(() => setIsLoading(false));
    }
  }, [showCompatPanel, focusMod, refreshOverwriteStats]);

  const { winFiles, lossFiles } = useMemo(() => {
    if (!analysis || !focusMod) return { winFiles: [], lossFiles: [] };
    const win: FileConflict[] = [];
    const loss: FileConflict[] = [];
    for (const c of analysis.conflicts) {
      const involved = c.participants.some(p => p.modName === focusMod);
      if (!involved) continue;
      if (c.winner === focusMod) win.push(c);
      else if (c.losers.includes(focusMod)) loss.push(c);
    }
    return { winFiles: win, lossFiles: loss };
  }, [analysis, focusMod]);

  const filterFn = useCallback((c: FileConflict): boolean => {
    if (!searchText.trim()) return true;
    const l = searchText.toLowerCase();
    return c.fileName.toLowerCase().includes(l)
      || c.participants.some(p => p.modName.toLowerCase().includes(l));
  }, [searchText]);

  const filterRelation = useCallback((r: ModRelation): boolean => {
    if (!searchText.trim()) return true;
    const l = searchText.toLowerCase();
    return r.modName.toLowerCase().includes(l)
      || modDisplayName(mods, r.modName).toLowerCase().includes(l);
  }, [searchText, mods]);

  const toggleExpand = (key: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleReorder = useCallback(async (otherMod: string, position: "above" | "below") => {
    if (!focusMod) return;
    const names = reorderModRelative(mods, focusMod, otherMod, position);
    try {
      const result = await window.api.applyDragOrder(names);
      if (Array.isArray(result)) {
        setMods(result);
        markDirty();
        setIsLoading(true);
        await refreshOverwriteStats({ full: true });
      }
    } catch (e) {
      console.error("Failed to reorder mods:", e);
    } finally {
      setIsLoading(false);
    }
  }, [focusMod, mods, setMods, markDirty, refreshOverwriteStats]);

  if (!showCompatPanel || !focusMod) return null;

  const displayName = mod?.humanName ? getModDisplayName(mod) : short(focusMod);
  const winCount = stats?.wins ?? winFiles.length;
  const lossCount = stats?.losses ?? lossFiles.length;
  const overwrites = stats?.overwrites ?? [];
  const overwrittenBy = stats?.overwrittenBy ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-morandi-text/30 backdrop-blur-sm" onClick={handleClose} />
      <div className="relative card-morandi w-[680px] max-w-[95vw] h-[78vh] max-h-[78vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-3.5 border-b border-morandi-border-light shrink-0">
          <div className="w-9 h-9 rounded-md bg-morandi-sidebar flex items-center justify-center shrink-0 overflow-hidden">
            {mod?.imgPath ? (
              <img src={`file:///${mod.imgPath.replace(/\\/g, '/')}`} className="w-full h-full object-cover" alt="" draggable={false} />
            ) : (
              <Package className="w-5 h-5 text-morandi-text-muted" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-morandi-text truncate">{t("compat.panelTitle")}</h2>
            <p className="text-xs text-morandi-text-secondary truncate mt-0.5">
              {t("compat.panelSubtitle", { mod: displayName })}
            </p>
            <div className="flex items-center gap-3 mt-1.5">
              <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-morandi-success/10">
                <span className="text-morandi-success font-semibold">{winCount}</span>
                <span className="text-morandi-success">{t("compat.overwritesShort")}</span>
              </span>
              <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-morandi-danger/10">
                <span className="text-morandi-danger font-semibold">{lossCount}</span>
                <span className="text-morandi-danger">{t("compat.overwrittenByShort")}</span>
              </span>
            </div>
          </div>
          <button onClick={() => { setIsLoading(true); refreshOverwriteStats({ full: true }).finally(() => setIsLoading(false)); }}
            disabled={isLoading} className="btn-morandi-ghost text-xs shrink-0" title={t("compat.refresh")}>
            {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin inline" /> : <RefreshCw className="w-3.5 h-3.5 inline" />}
            <span className="ml-1">{t("compat.refresh")}</span>
          </button>
          <button onClick={handleClose} className="p-1.5 rounded-lg hover:bg-morandi-hover transition-colors shrink-0">
            <X className="w-5 h-5 text-morandi-text-secondary" />
          </button>
        </div>

        {/* 规则说明 */}
        <div className="px-4 py-2.5 border-b border-morandi-border-light bg-morandi-sidebar/40 shrink-0">
          <div className="flex items-start gap-2 text-xs text-morandi-text-secondary leading-relaxed">
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-morandi-accent" />
            <p>{t("compat.ruleHint")}</p>
          </div>
        </div>

        {/* 搜索栏 */}
        <div className="px-4 py-2 border-b border-morandi-border-light shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-morandi-text-muted" />
            <input type="text" value={searchText} onChange={e => setSearchText(e.target.value)}
              placeholder={t("compat.searchPlaceholder")} className="input-morandi !pl-8 !py-1 text-xs" />
          </div>
        </div>

        {/* 内容 */}
        <div className="flex-1 overflow-y-auto">
          {isLoading && analysis === null ? (
            <div className="flex items-center justify-center h-full text-morandi-text-muted">
              <div className="text-center">
                <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-morandi-accent" />
                <p className="text-sm">{t("compat.loading")}</p>
              </div>
            </div>
          ) : (
            <>
              <ConflictSection
                title={t("compat.overwritesSection")}
                fileCount={winFiles.length}
                accent="win"
                relations={overwrites.filter(filterRelation)}
                totalRelationCount={overwrites.length}
                files={winFiles.filter(filterFn)}
                allFiles={winFiles}
                totalFileCount={winFiles.length}
                focusMod={focusMod}
                mods={mods}
                expanded={expanded}
                onToggleExpand={toggleExpand}
                emptyText={t("compat.noOverwrites")}
                onReorder={handleReorder}
              />
              <ConflictSection
                title={t("compat.overwrittenBySection")}
                fileCount={lossFiles.length}
                accent="lose"
                relations={overwrittenBy.filter(filterRelation)}
                totalRelationCount={overwrittenBy.length}
                files={lossFiles.filter(filterFn)}
                allFiles={lossFiles}
                totalFileCount={lossFiles.length}
                focusMod={focusMod}
                mods={mods}
                expanded={expanded}
                onToggleExpand={toggleExpand}
                emptyText={t("compat.noOverwrittenBy")}
                onReorder={handleReorder}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** 一个分区：mod 关系摘要 + 文件详情列表 */
function ConflictSection({ title, fileCount, accent, relations, totalRelationCount, files, allFiles, totalFileCount, focusMod, mods, expanded, onToggleExpand, emptyText, onReorder }: {
  title: string;
  fileCount: number;
  accent: "win" | "lose";
  relations: ModRelation[];
  totalRelationCount: number;
  files: FileConflict[];
  allFiles: FileConflict[];
  totalFileCount: number;
  focusMod: string;
  mods: Mod[];
  expanded: Set<string>;
  onToggleExpand: (key: string) => void;
  emptyText: string;
  onReorder: (otherMod: string, position: "above" | "below") => void;
}) {
  const t = useT();
  const filteredOut = (totalRelationCount - relations.length) + (totalFileCount - files.length);
  const isEmpty = relations.length === 0 && files.length === 0;

  return (
    <div>
      <div className={clsx(
        "sticky top-0 z-10 px-4 py-2.5 border-b backdrop-blur-sm",
        accent === "win"
          ? "bg-morandi-success-light/40 border-morandi-success/30"
          : "bg-morandi-danger-light/40 border-morandi-danger/30",
      )}>
        <div className={clsx(
          "text-sm font-medium",
          accent === "win" ? "text-morandi-success" : "text-morandi-danger",
        )}>
          {title}
        </div>
        {fileCount > 0 && (
          <div className="text-[11px] mt-0.5 opacity-80 text-morandi-text-secondary">
            {t("compat.overwritesSectionFiles", { n: fileCount })}
          </div>
        )}
      </div>

      {isEmpty ? (
        <div className="px-4 py-6 text-center text-xs text-morandi-text-muted">
          {filteredOut > 0
            ? t("compat.noMatchInFilter", { n: filteredOut })
            : emptyText}
        </div>
      ) : (
        <>
          {/* Mod 关系摘要：在弹窗中展示覆盖/被覆盖的 mod 名 */}
          {relations.length > 0 && (
            <div className="px-4 py-2 border-b border-morandi-border-light bg-morandi-page/30">
              <div className="space-y-1">
                {relations.map(r => (
                  <RelationRow
                    key={r.modName}
                    relation={r}
                    accent={accent}
                    focusMod={focusMod}
                    mods={mods}
                    categoryCounts={countSharedConflictCategories(allFiles, focusMod, r.modName)}
                    onReorder={onReorder}
                  />
                ))}
              </div>
            </div>
          )}

          {/* 文件详情 */}
          {files.map((c, idx) => (
            <FileRow key={`${c.fileName}-${idx}`} conflict={c} focusMod={focusMod}
              isExpanded={expanded.has(c.fileName)}
              onToggle={() => onToggleExpand(c.fileName)}
              accent={accent} mods={mods} />
          ))}
        </>
      )}
    </div>
  );
}

function RelationRow({ relation, accent, focusMod, mods, categoryCounts, onReorder }: {
  relation: ModRelation;
  accent: "win" | "lose";
  focusMod: string;
  mods: Mod[];
  categoryCounts: Record<CompatCategory, number>;
  onReorder: (otherMod: string, position: "above" | "below") => void;
}) {
  const t = useT();
  const otherName = modDisplayName(mods, relation.modName);
  const reorderPosition = accent === "win" ? "above" as const : "below" as const;
  const reorderHint = accent === "win"
    ? t("compat.moveAboveHint", { mod: otherName })
    : t("compat.moveBelowHint", { mod: otherName });
  const relationDesc = accent === "win"
    ? t("compat.relationWinDesc", { other: otherName, count: relation.fileCount })
    : t("compat.relationLossDesc", { other: otherName, count: relation.fileCount });
  const actionLabel = accent === "win"
    ? t("compat.actionLetOtherWin", { other: otherName })
    : t("compat.actionLetSelfWin");

  return (
    <div className="rounded-md border border-morandi-border-light/80 px-2.5 py-2 bg-morandi-page/50">
      <div className="flex items-start gap-2">
        {accent === "win"
          ? <Trophy className="w-3.5 h-3.5 text-morandi-success shrink-0 mt-0.5" />
          : <AlertTriangle className="w-3.5 h-3.5 text-morandi-danger shrink-0 mt-0.5" />}
        <div className="flex-1 min-w-0">
          <p className="text-xs text-morandi-text leading-relaxed">{relationDesc}</p>
          <CategoryBadges counts={categoryCounts} />
        </div>
        <button
          type="button"
          title={reorderHint}
          onClick={() => onReorder(relation.modName, reorderPosition)}
          className={clsx(
            "btn-morandi-ghost text-[10px] shrink-0 px-2 py-1 max-w-[7.5rem] text-center leading-tight",
            accent === "win" ? "text-morandi-success" : "text-morandi-danger",
          )}>
          {actionLabel}
        </button>
      </div>
    </div>
  );
}

function CategoryBadges({ counts }: { counts: Record<CompatCategory, number> }) {
  const t = useT();
  const visible = DISPLAY_CATEGORIES.filter(cat => counts[cat] > 0);
  if (visible.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1.5">
      {visible.map(cat => (
        <span key={cat}
          className={clsx(
            "text-[9px] font-medium uppercase px-1.5 py-0.5 rounded",
            cat === "db" && "bg-morandi-accent/10 text-morandi-accent",
            cat === "script" && "bg-morandi-success/10 text-morandi-success",
            cat === "loc" && "bg-morandi-text-secondary/10 text-morandi-text-secondary",
          )}>
          {t("compat.categoryBadge", { cat: t(`compat.category.${cat}`), n: counts[cat] })}
        </span>
      ))}
    </div>
  );
}

/** 单个冲突文件行 */
function FileRow({ conflict, focusMod, isExpanded, onToggle, accent, mods }: {
  conflict: FileConflict;
  focusMod: string;
  isExpanded: boolean;
  onToggle: () => void;
  accent: "win" | "lose";
  mods: Mod[];
}) {
  const t = useT();
  const relatedNames = accent === "win"
    ? conflict.losers
    : [conflict.winner];

  return (
    <div className="border-b border-morandi-border-light">
      <button onClick={onToggle}
        className="w-full text-left px-4 py-2 hover:bg-morandi-hover/40 transition-colors flex items-start gap-2">
        {isExpanded
          ? <ChevronDown className="w-3.5 h-3.5 text-morandi-text-muted mt-0.5 shrink-0" />
          : <ChevronRight className="w-3.5 h-3.5 text-morandi-text-muted mt-0.5 shrink-0" />}
        <div className="flex-1 min-w-0">
          <span className={clsx("text-[10px] font-medium uppercase", CATEGORY_COLORS[conflict.category])}>
            {t(`compat.category.${conflict.category}`)}
          </span>
          <code className="block text-xs text-morandi-text font-mono break-all">{conflict.fileName}</code>
          {!isExpanded && (
            <div className="text-[11px] mt-0.5 text-morandi-text-secondary truncate">
              {accent === "win"
                ? t("compat.overridesMods", { mods: relatedNames.map(n => modDisplayName(mods, n)).join("、") })
                : t("compat.overriddenByMod", { mod: modDisplayName(mods, conflict.winner) })}
            </div>
          )}
        </div>
      </button>
      {isExpanded && (
        <div className="px-4 pb-3 pl-10">
          <div className="space-y-1">
            {conflict.participants.map((p, pi) => {
              const isWinner = p.modName === conflict.winner;
              const isFocus = p.modName === focusMod;
              return (
                <div key={pi}
                  className={clsx(
                    "flex items-center gap-2 px-2 py-1 rounded text-xs",
                    isFocus ? "ring-1 ring-morandi-accent/40 bg-morandi-accent/5" : "",
                    isWinner ? "bg-morandi-success/10" : !isFocus && "opacity-70",
                  )}>
                  {isWinner
                    ? <Trophy className="w-3 h-3 text-morandi-success shrink-0" />
                    : <AlertTriangle className="w-3 h-3 text-morandi-text-muted shrink-0" />}
                  <span className={clsx("flex-1 truncate", isFocus && "font-semibold text-morandi-text")} title={p.modName}>
                    {modDisplayName(mods, p.modName)}{isFocus && ` · ${t("compat.thisMod")}`}
                  </span>
                  <span className="text-[10px] text-morandi-text-muted shrink-0">
                    {t("compat.order", { n: p.loadOrder })} · {formatSize(p.size)}
                  </span>
                  <span className={clsx("text-[10px] font-medium shrink-0 text-right",
                    isWinner ? "text-morandi-success" : "text-morandi-danger")}>
                    {isWinner ? t("compat.statusActive") : t("compat.statusOverridden")}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}
