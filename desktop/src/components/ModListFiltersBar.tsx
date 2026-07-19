import { Search } from "lucide-react";
import clsx from "clsx";
import { useT } from "../i18n";
import { useWorkshopTagLabel } from "../utils/workshop-tag-label";
import type { ModListFilterState } from "../utils/mod-list-filters";

interface ModListFiltersBarProps {
  filters: ModListFilterState;
  onChange: (next: ModListFilterState) => void;
  availableTags: string[];
}

const selectClass = "input-morandi !py-1.5 !text-xs min-w-0 max-w-full";

export default function ModListFiltersBar({
  filters,
  onChange,
  availableTags,
}: ModListFiltersBarProps) {
  const t = useT();
  const tagLabel = useWorkshopTagLabel();

  const patch = (partial: Partial<ModListFilterState>) => {
    onChange({ ...filters, ...partial });
  };

  return (
    <div className="flex flex-wrap items-center gap-2 mt-2">
      <div className="relative flex-1 min-w-[140px]">
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

      <label className="flex items-center gap-1.5 shrink-0">
        <span className="text-[11px] text-morandi-text-muted whitespace-nowrap">{t("modlist.filterBySource")}</span>
        <select
          value={filters.source}
          onChange={(e) => patch({ source: e.target.value as ModListFilterState["source"] })}
          className={clsx(selectClass, "w-[7.5rem]")}
          aria-label={t("modlist.filterBySource")}
        >
          <option value="all">{t("modlist.filterSourceAll")}</option>
          <option value="workshop">{t("modlist.sourceWorkshop")}</option>
          <option value="local">{t("modlist.sourceLocal")}</option>
        </select>
      </label>

      <label className="flex items-center gap-1.5 shrink-0 min-w-0">
        <span className="text-[11px] text-morandi-text-muted whitespace-nowrap">{t("modlist.filterByTag")}</span>
        <select
          value={filters.tag}
          onChange={(e) => patch({ tag: e.target.value })}
          className={clsx(selectClass, "w-[9rem] max-w-[12rem]")}
          aria-label={t("modlist.filterByTag")}
        >
          <option value="">{t("modlist.filterTagAll")}</option>
          {availableTags.map(tag => (
            <option key={tag} value={tag}>{tagLabel(tag)}</option>
          ))}
        </select>
      </label>
    </div>
  );
}
