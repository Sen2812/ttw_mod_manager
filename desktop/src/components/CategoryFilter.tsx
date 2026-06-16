import { useMemo } from "react";
import { useStore } from "../store";
import { useT } from "../i18n";
import { Filter } from "lucide-react";
import { getModCategory } from "@core/mod-manager/category-utils";
import clsx from "clsx";

/** Toolbar dropdown to filter mods by category. */
export default function CategoryFilter() {
  const t = useT();
  const mods = useStore(s => s.mods);
  const categories = useStore(s => s.categories);
  const categoryFilter = useStore(s => s.categoryFilter);
  const setCategoryFilter = useStore(s => s.setCategoryFilter);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const mod of mods) {
      const cat = getModCategory(mod);
      if (!cat) continue;
      map.set(cat, (map.get(cat) ?? 0) + 1);
    }
    return map;
  }, [mods]);

  const sorted = useMemo(() => {
    const inUse = [...counts.keys()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
    const extras = categories.filter(c => !counts.has(c));
    return [...inUse, ...extras.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))];
  }, [categories, counts]);

  return (
    <div className="relative shrink-0">
      <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-morandi-text-muted pointer-events-none" />
      <select
        value={categoryFilter ?? ""}
        onChange={e => setCategoryFilter(e.target.value || null)}
        className={clsx(
          "input-morandi !pl-8 !py-1.5 !pr-8 text-xs appearance-none cursor-pointer",
          categoryFilter && "text-morandi-accent font-medium",
        )}
        title={t("category.filterTitle")}
      >
        <option value="">{t("category.filterAll")}</option>
        {sorted.map(cat => (
          <option key={cat} value={cat}>
            {cat}{counts.has(cat) ? ` (${counts.get(cat)})` : ""}
          </option>
        ))}
      </select>
    </div>
  );
}
