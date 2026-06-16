import { useState, useEffect, useMemo, useCallback } from "react";
import { useStore } from "../store";
import { useT } from "../i18n";
import {
  X, RefreshCw, Loader2, Trophy, AlertTriangle, Package,
  ChevronDown, ChevronRight, Search, ArrowUp, ArrowDown,
} from "lucide-react";
import clsx from "clsx";
import type { FileConflict, Mod, ModRelation } from "../types";

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
  return mod?.humanName || short(packName);
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

  if (!showCompatPanel || !focusMod) return null;

  const displayName = mod?.humanName || short(focusMod);
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
            <h2 className="text-base font-semibold text-morandi-text truncate">{displayName}</h2>
            <div className="flex items-center gap-3 mt-0.5">
              <span className="inline-flex items-center gap-1 text-xs">
                <ArrowUp className="w-3 h-3 text-morandi-success" />
                <span className="text-morandi-success font-semibold">{winCount}</span>
                <span className="text-morandi-text-muted">{t("compat.overwritesShort")}</span>
              </span>
              <span className="inline-flex items-center gap-1 text-xs">
                <ArrowDown className="w-3 h-3 text-morandi-danger" />
                <span className="text-morandi-danger font-semibold">{lossCount}</span>
                <span className="text-morandi-text-muted">{t("compat.overwrittenByShort")}</span>
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
                title={t("compat.overwritesSection", { n: winFiles.length })}
                accent="win"
                relations={overwrites.filter(filterRelation)}
                totalRelationCount={overwrites.length}
                files={winFiles.filter(filterFn)}
                totalFileCount={winFiles.length}
                focusMod={focusMod}
                mods={mods}
                expanded={expanded}
                onToggleExpand={toggleExpand}
                emptyText={t("compat.noOverwrites")}
              />
              <ConflictSection
                title={t("compat.overwrittenBySection", { n: lossFiles.length })}
                accent="lose"
                relations={overwrittenBy.filter(filterRelation)}
                totalRelationCount={overwrittenBy.length}
                files={lossFiles.filter(filterFn)}
                totalFileCount={lossFiles.length}
                focusMod={focusMod}
                mods={mods}
                expanded={expanded}
                onToggleExpand={toggleExpand}
                emptyText={t("compat.noOverwrittenBy")}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** 一个分区：mod 关系摘要 + 文件详情列表 */
function ConflictSection({ title, accent, relations, totalRelationCount, files, totalFileCount, focusMod, mods, expanded, onToggleExpand, emptyText }: {
  title: string;
  accent: "win" | "lose";
  relations: ModRelation[];
  totalRelationCount: number;
  files: FileConflict[];
  totalFileCount: number;
  focusMod: string;
  mods: Mod[];
  expanded: Set<string>;
  onToggleExpand: (key: string) => void;
  emptyText: string;
}) {
  const t = useT();
  const filteredOut = (totalRelationCount - relations.length) + (totalFileCount - files.length);
  const isEmpty = relations.length === 0 && files.length === 0;

  return (
    <div>
      <div className={clsx(
        "sticky top-0 z-10 px-4 py-2 flex items-center gap-1.5 text-sm font-medium border-b backdrop-blur-sm",
        accent === "win"
          ? "bg-morandi-success-light/40 text-morandi-success border-morandi-success/30"
          : "bg-morandi-danger-light/40 text-morandi-danger border-morandi-danger/30",
      )}>
        {accent === "win" ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />}
        <span>{title}</span>
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
                  <div key={r.modName} className="flex items-center gap-2 text-xs">
                    {accent === "win"
                      ? <Trophy className="w-3 h-3 text-morandi-success shrink-0" />
                      : <AlertTriangle className="w-3 h-3 text-morandi-danger shrink-0" />}
                    <span className="flex-1 truncate text-morandi-text" title={r.modName}>
                      {modDisplayName(mods, r.modName)}
                    </span>
                    <span className="text-[10px] text-morandi-text-muted shrink-0 font-mono" title={r.modName}>
                      {short(r.modName)}
                    </span>
                    <span className="text-[10px] text-morandi-text-secondary shrink-0">
                      {t("compat.modRelationFiles", { count: r.fileCount })}
                    </span>
                  </div>
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
                  <span className={clsx("text-[10px] font-medium shrink-0 w-8 text-right",
                    isWinner ? "text-morandi-success" : "text-morandi-danger")}>
                    {isWinner ? t("compat.win") : t("compat.lose")}
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
