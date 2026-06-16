import { useState, useRef, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { useT } from "../i18n";
import { ChevronDown, Plus, Tag } from "lucide-react";
import clsx from "clsx";

const MENU_WIDTH = { compact: 208, normal: 240 };
const MENU_MAX_HEIGHT = 220;

interface ModCategorySelectProps {
  value: string | null;
  categories: string[];
  /** Original workshop tags (shown as hints, not selectable unless in list). */
  workshopTags?: string[];
  onChange: (category: string | null) => void;
  onAddCategory: (name: string) => Promise<void> | void;
  /** Compact badge style for mod list rows. */
  compact?: boolean;
}

/**
 * Category picker: choose from known categories or type a new custom one.
 * Menu uses fixed positioning so it does not stretch the mod list scroll area.
 */
export default function ModCategorySelect({
  value,
  categories,
  workshopTags = [],
  onChange,
  onAddCategory,
  compact = false,
}: ModCategorySelectProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState("");
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (ref.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !ref.current) return;

    const updatePosition = () => {
      const trigger = ref.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const width = compact ? MENU_WIDTH.compact : MENU_WIDTH.normal;
      const spaceBelow = window.innerHeight - rect.bottom;
      const openUp = spaceBelow < MENU_MAX_HEIGHT && rect.top > MENU_MAX_HEIGHT;
      const left = compact
        ? Math.min(Math.max(8, rect.right - width), window.innerWidth - width - 8)
        : Math.min(Math.max(8, rect.left), window.innerWidth - width - 8);
      const top = openUp
        ? Math.max(8, rect.top - MENU_MAX_HEIGHT - 4)
        : rect.bottom + 4;

      setMenuStyle({
        position: "fixed",
        left,
        top,
        width,
        maxHeight: MENU_MAX_HEIGHT,
        zIndex: 9999,
      });
    };

    updatePosition();
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [open, compact]);

  const options = [...new Set([...categories, ...workshopTags.filter(t => t.toLowerCase() !== "mod")])]
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));

  const handleAddCustom = async () => {
    const name = custom.trim();
    if (!name) return;
    await onAddCategory(name);
    onChange(name);
    setCustom("");
    setOpen(false);
  };

  const menu = open ? (
    <div
      ref={menuRef}
      style={menuStyle}
      className="card-morandi border border-morandi-border-light shadow-lg overflow-hidden flex flex-col"
      onClick={e => e.stopPropagation()}
    >
      <div className="flex-1 overflow-y-auto py-1 min-h-0">
        <button
          type="button"
          onClick={() => { onChange(null); setOpen(false); }}
          className="w-full text-left px-3 py-1.5 text-xs text-morandi-text-muted hover:bg-morandi-hover"
        >
          {t("category.clear")}
        </button>
        {options.map(cat => (
          <button
            key={cat}
            type="button"
            onClick={() => { onChange(cat); setOpen(false); }}
            className={clsx(
              "w-full text-left px-3 py-1.5 text-xs hover:bg-morandi-hover truncate",
              cat === value ? "text-morandi-accent font-medium bg-morandi-accent/5" : "text-morandi-text",
            )}
          >
            {cat}
          </button>
        ))}
      </div>
      <div className="border-t border-morandi-border-light p-2 flex gap-1 shrink-0">
        <input
          type="text"
          value={custom}
          onChange={e => setCustom(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") handleAddCustom(); }}
          placeholder={t("category.newPlaceholder")}
          className="input-morandi !py-1 !text-xs flex-1 min-w-0"
        />
        <button type="button" onClick={handleAddCustom} className="btn-morandi-ghost !px-2" title={t("category.addCustom")}>
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  ) : null;

  return (
    <div ref={ref} className="relative shrink-0 ml-1" onClick={e => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={clsx(
          "inline-flex items-center gap-1 rounded-md transition-colors",
          compact
            ? "px-2 py-0.5 text-[10px] font-medium min-w-[3.5rem] max-w-[min(11rem,32vw)]"
            : "px-2.5 py-1 text-xs max-w-[14rem]",
          value
            ? "bg-morandi-accent/10 text-morandi-accent hover:bg-morandi-accent/20"
            : "bg-morandi-sidebar text-morandi-text-muted hover:bg-morandi-hover",
        )}
        title={value ? value : t("category.setCategory")}
      >
        <Tag className={compact ? "w-3 h-3 shrink-0" : "w-3.5 h-3.5 shrink-0"} />
        <span className="truncate min-w-0">{value ?? t("category.uncategorized")}</span>
        <ChevronDown className={clsx("shrink-0 opacity-60", compact ? "w-2.5 h-2.5" : "w-3 h-3")} />
      </button>

      {menu && createPortal(menu, document.body)}
    </div>
  );
}
