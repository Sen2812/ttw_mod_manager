import { useEffect, useRef, useState } from "react";
import { ArrowDownWideNarrow, ArrowUpNarrowWide, ListFilter, Loader2, Search, X } from "lucide-react";
import clsx from "clsx";
import { useT } from "../i18n";
import { useWorkshopTagLabel } from "../utils/workshop-tag-label";
import type { ModListFilterState } from "../utils/mod-list-filters";

export type CatalogSortMode = "name" | "added";
export type CatalogSortDirection = "asc" | "desc";

interface ModListFiltersBarProps {
  filters: ModListFilterState;
  onChange: (next: ModListFilterState) => void;
  availableTags: string[];
  sortMode: CatalogSortMode;
  onSortModeChange: (mode: CatalogSortMode) => void;
  sortDirection: CatalogSortDirection;
  onSortDirectionChange: (direction: CatalogSortDirection) => void;
  sortBusy?: boolean;
}

type OpenMenu = "sort" | "filter" | null;

export default function ModListFiltersBar({
  filters,
  onChange,
  availableTags,
  sortMode,
  onSortModeChange,
  sortDirection,
  onSortDirectionChange,
  sortBusy = false,
}: ModListFiltersBarProps) {
  const t = useT();
  const tagLabel = useWorkshopTagLabel();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState<OpenMenu>(null);

  const patch = (partial: Partial<ModListFilterState>) => {
    onChange({ ...filters, ...partial });
  };

  const sourceActive = filters.source !== "all";
  const tagActive = !!filters.tag;
  const filterCount = (sourceActive ? 1 : 0) + (tagActive ? 1 : 0);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(null);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const chooseSort = (mode: CatalogSortMode) => {
    setOpen(null);
    if (mode !== sortMode) onSortModeChange(mode);
  };

  const directionHint = sortMode === "added"
    ? (sortDirection === "asc" ? t("modlist.sortAddedAsc") : t("modlist.sortAddedDesc"))
    : (sortDirection === "asc" ? t("modlist.sortNameAsc") : t("modlist.sortNameDesc"));

  const sourceLabel = filters.source === "workshop"
    ? t("modlist.sourceWorkshop")
    : t("modlist.sourceLocal");

  return (
    <div ref={rootRef} className="mt-2">
      <div className="flex items-center gap-1.5">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-morandi-text-muted pointer-events-none" />
          <input
            type="text"
            value={filters.query}
            onChange={(e) => patch({ query: e.target.value })}
            placeholder={t("modlist.filterNamePlaceholder")}
            className="input-morandi !pl-8 !py-1.5 !text-xs w-full"
            aria-label={t("modlist.filterByName")}
          />
        </div>

        <div className="relative shrink-0 flex items-stretch rounded-lg border border-morandi-border bg-morandi-page">
          <button
            type="button"
            className="px-2 py-1 text-xs text-morandi-text-secondary hover:text-morandi-text hover:bg-morandi-hover rounded-l-lg"
            title={sortMode === "added" ? t("modlist.sortByAddedTimeHint") : t("modlist.sortByNameHint")}
            aria-expanded={open === "sort"}
            aria-haspopup="menu"
            disabled={sortBusy}
            onClick={() => setOpen(open === "sort" ? null : "sort")}
          >
            {sortBusy
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : (sortMode === "name" ? t("modlist.sortByName") : t("modlist.sortByAddedTime"))}
          </button>
          <button
            type="button"
            className="px-1.5 border-l border-morandi-border text-morandi-text-secondary hover:text-morandi-text hover:bg-morandi-hover rounded-r-lg"
            title={directionHint}
            aria-label={directionHint}
            disabled={sortBusy}
            onClick={() => onSortDirectionChange(sortDirection === "asc" ? "desc" : "asc")}
          >
            {sortDirection === "asc"
              ? <ArrowUpNarrowWide className="w-3.5 h-3.5" />
              : <ArrowDownWideNarrow className="w-3.5 h-3.5" />}
          </button>
          {open === "sort" && (
            <div className="absolute right-0 top-full mt-1 z-30 menu-popover min-w-[9.5rem]" role="menu">
              <button type="button" className={clsx("menu-item", sortMode === "name" && "menu-item-active")} onClick={() => chooseSort("name")}>
                {t("modlist.sortByName")}
              </button>
              <button type="button" className={clsx("menu-item", sortMode === "added" && "menu-item-active")} onClick={() => chooseSort("added")}>
                {t("modlist.sortByAddedTime")}
              </button>
            </div>
          )}
        </div>

        <div className="relative shrink-0">
          <button
            type="button"
            className={clsx(
              "icon-btn-bordered relative",
              filterCount > 0 && "border-morandi-accent/40 text-morandi-accent",
            )}
            title={filterCount > 0 ? t("modlist.filtersActiveHint") : t("modlist.filtersHint")}
            aria-label={t("modlist.filters")}
            aria-expanded={open === "filter"}
            aria-haspopup="menu"
            onClick={() => setOpen(open === "filter" ? null : "filter")}
          >
            <ListFilter className="w-3.5 h-3.5" />
            {filterCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[0.9rem] h-[0.9rem] px-0.5 rounded-full bg-morandi-accent text-white text-[9px] font-semibold inline-flex items-center justify-center">
                {filterCount}
              </span>
            )}
          </button>
          {open === "filter" && (
            <div className="absolute right-0 top-full mt-1 z-30 menu-popover w-52 p-2" role="menu">
              <p className="section-label px-1 mb-1">{t("modlist.filterBySource")}</p>
              <div className="grid grid-cols-3 gap-1">
                {([
                  ["all", t("modlist.filterSourceAll")],
                  ["workshop", t("modlist.sourceWorkshop")],
                  ["local", t("modlist.sourceLocal")],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={clsx(
                      "px-1 py-1 rounded-md text-[11px] leading-tight text-center",
                      filters.source === value
                        ? "bg-morandi-sidebar-active text-morandi-text font-medium"
                        : "text-morandi-text-secondary hover:bg-morandi-hover",
                    )}
                    onClick={() => patch({ source: value })}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="section-label px-1 mt-2.5 mb-1">{t("modlist.filterByTag")}</p>
              <div className="max-h-40 overflow-y-auto">
                <button
                  type="button"
                  className={clsx("menu-item !text-xs rounded-md", !filters.tag && "menu-item-active")}
                  onClick={() => patch({ tag: "" })}
                >
                  {t("modlist.filterTagAll")}
                </button>
                {availableTags.map(tag => (
                  <button
                    key={tag}
                    type="button"
                    className={clsx("menu-item !text-xs rounded-md", filters.tag === tag && "menu-item-active")}
                    onClick={() => patch({ tag })}
                  >
                    {tagLabel(tag)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {filterCount > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
          {sourceActive && (
            <button type="button" className="filter-chip" onClick={() => patch({ source: "all" })}>
              {sourceLabel}
              <X className="w-3 h-3" />
            </button>
          )}
          {tagActive && (
            <button type="button" className="filter-chip" onClick={() => patch({ tag: "" })}>
              {tagLabel(filters.tag)}
              <X className="w-3 h-3" />
            </button>
          )}
          <button
            type="button"
            className="text-[11px] text-morandi-text-muted hover:text-morandi-text px-1"
            onClick={() => patch({ source: "all", tag: "" })}
          >
            {t("modlist.clearFilters")}
          </button>
        </div>
      )}
    </div>
  );
}
