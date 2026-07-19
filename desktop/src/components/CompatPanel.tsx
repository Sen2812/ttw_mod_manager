import { useState, useEffect, useMemo, useCallback } from "react";
import { useStore } from "../store";
import { useT } from "../i18n";
import { X, Loader2, Package } from "lucide-react";
import clsx from "clsx";
import type { FileConflict, Mod, ModRelation } from "../types";
import { getModDisplayName } from "@core/mod-manager/mod-display";

const CATEGORY_COLORS: Record<FileConflict["category"], string> = {
  db: "text-morandi-accent",
  script: "text-morandi-success",
  ui: "text-morandi-danger",
  loc: "text-morandi-text-secondary",
  other: "text-morandi-text-muted",
};

function short(name: string): string {
  return name.replace(/\.pack$/i, "");
}

function modDisplayName(mods: Mod[], packName: string): string {
  const mod = mods.find(m => m.name === packName);
  return mod ? getModDisplayName(mod) : short(packName);
}

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

  const mod = useMemo(() => mods.find(m => m.name === focusMod), [mods, focusMod]);

  const handleClose = useCallback(() => closeCompatPanel(), [closeCompatPanel]);

  useEffect(() => {
    if (showCompatPanel && !focusMod) closeCompatPanel();
  }, [showCompatPanel, focusMod, closeCompatPanel]);

  useEffect(() => {
    if (showCompatPanel && focusMod) {
      setIsLoading(true);
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

  if (!showCompatPanel || !focusMod) return null;

  const displayName = mod ? getModDisplayName(mod) : short(focusMod);
  const overwrites = stats?.overwrites ?? [];
  const overwrittenBy = stats?.overwrittenBy ?? [];
  const hasOverwrites = overwrites.length > 0 || winFiles.length > 0;
  const hasOverwrittenBy = overwrittenBy.length > 0 || lossFiles.length > 0;

  const summaryText = hasOverwrites && hasOverwrittenBy
    ? t("compat.simpleSummary", { wins: stats?.wins ?? winFiles.length, losses: stats?.losses ?? lossFiles.length })
    : hasOverwrites
      ? t("compat.simpleSummaryWins", { n: stats?.wins ?? winFiles.length })
      : hasOverwrittenBy
        ? t("compat.simpleSummaryLosses", { n: stats?.losses ?? lossFiles.length })
        : t("compat.noConflictsForMod");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-morandi-text/30 backdrop-blur-sm" onClick={handleClose} />
      <div className="relative card-morandi w-[640px] max-w-[95vw] max-h-[78vh] flex flex-col overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-morandi-border-light shrink-0">
          <div className="w-9 h-9 rounded-md bg-morandi-sidebar flex items-center justify-center shrink-0 overflow-hidden">
            {mod?.imgPath ? (
              <img src={`file:///${mod.imgPath.replace(/\\/g, "/")}`} className="w-full h-full object-cover" alt="" draggable={false} />
            ) : (
              <Package className="w-5 h-5 text-morandi-text-muted" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-morandi-text truncate">{displayName}</h2>
            <p className="text-xs text-morandi-text-muted mt-0.5">{summaryText}</p>
          </div>
          <button type="button" onClick={handleClose} className="p-1.5 rounded-lg hover:bg-morandi-hover transition-colors shrink-0" title={t("common.close")}>
            <X className="w-5 h-5 text-morandi-text-secondary" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading && !analysis ? (
            <div className="flex flex-col items-center justify-center py-16 text-morandi-text-muted gap-2">
              <Loader2 className="w-5 h-5 animate-spin text-morandi-accent" />
              <p className="text-sm">{t("compat.loading")}</p>
            </div>
          ) : !hasOverwrites && !hasOverwrittenBy ? (
            <p className="px-4 py-10 text-sm text-morandi-text-muted text-center">
              {t("compat.noConflictsForMod")}
            </p>
          ) : (
            <>
              {hasOverwrites && (
                <ConflictSection
                  title={t("compat.overwritesSection")}
                  subtitle={t("compat.overwritesSectionFiles", { n: winFiles.length })}
                  accent="win"
                  relations={overwrites}
                  files={winFiles}
                  focusMod={focusMod}
                  mods={mods}
                />
              )}
              {hasOverwrittenBy && (
                <ConflictSection
                  title={t("compat.overwrittenBySection")}
                  subtitle={t("compat.overwritesSectionFiles", { n: lossFiles.length })}
                  accent="lose"
                  relations={overwrittenBy}
                  files={lossFiles}
                  focusMod={focusMod}
                  mods={mods}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ConflictSection({
  title,
  subtitle,
  accent,
  relations,
  files,
  focusMod,
  mods,
}: {
  title: string;
  subtitle: string;
  accent: "win" | "lose";
  relations: ModRelation[];
  files: FileConflict[];
  focusMod: string;
  mods: Mod[];
}) {
  const t = useT();
  return (
    <section>
      <div className={clsx(
        "px-4 py-2 border-b",
        accent === "win"
          ? "bg-morandi-success/8 text-morandi-success border-morandi-success/20"
          : "bg-morandi-danger/8 text-morandi-danger border-morandi-danger/20",
      )}>
        <div className="text-xs font-medium">{title}</div>
        <div className="text-[10px] opacity-80 mt-0.5">{subtitle}</div>
      </div>

      {relations.length > 0 && (
        <ul className="divide-y divide-morandi-border-light border-b border-morandi-border-light bg-morandi-page/30">
          {relations.map(relation => (
            <li key={relation.modName} className="flex items-center gap-2 px-4 py-2">
              <span className="flex-1 min-w-0 text-sm text-morandi-text truncate" title={relation.modName}>
                {modDisplayName(mods, relation.modName)}
              </span>
              <span className="text-xs text-morandi-text-muted shrink-0">
                {t("compat.modRelationFiles", { count: relation.fileCount })}
              </span>
            </li>
          ))}
        </ul>
      )}

      <ul className="divide-y divide-morandi-border-light">
        {files.map((conflict, idx) => (
          <FileRow
            key={`${conflict.fileName}-${idx}`}
            conflict={conflict}
            accent={accent}
            focusMod={focusMod}
            mods={mods}
          />
        ))}
      </ul>
    </section>
  );
}

function FileRow({
  conflict,
  accent,
  focusMod,
  mods,
}: {
  conflict: FileConflict;
  accent: "win" | "lose";
  focusMod: string;
  mods: Mod[];
}) {
  const t = useT();
  const relatedNames = accent === "win"
    ? conflict.losers.filter(name => name !== focusMod)
    : [conflict.winner];

  return (
    <li className="px-4 py-2.5">
      <span className={clsx("text-[10px] font-medium uppercase", CATEGORY_COLORS[conflict.category])}>
        {t(`compat.category.${conflict.category}`)}
      </span>
      <code className="block text-xs text-morandi-text font-mono break-all mt-0.5">{conflict.fileName}</code>
      <p className="text-[11px] mt-1 text-morandi-text-secondary">
        {accent === "win"
          ? t("compat.overridesMods", { mods: relatedNames.map(n => modDisplayName(mods, n)).join("、") })
          : t("compat.overriddenByMod", { mod: modDisplayName(mods, conflict.winner) })}
      </p>
    </li>
  );
}
