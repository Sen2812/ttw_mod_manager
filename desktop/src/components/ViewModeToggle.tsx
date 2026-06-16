import { useT } from "../i18n";
import { useStore } from "../store";
import { useViewModeStore, type ViewMode } from "../viewModeStore";
import { List, CheckCircle2, CircleSlash } from "lucide-react";
import clsx from "clsx";

const MODES: { value: ViewMode; icon: typeof List; labelKey: string }[] = [
  { value: "all", icon: List, labelKey: "modlist.viewAll" },
  { value: "enabled", icon: CheckCircle2, labelKey: "modlist.viewEnabled" },
  { value: "disabled", icon: CircleSlash, labelKey: "modlist.viewDisabled" },
];

/**
 * mod 列表显示模式切换器（segmented control）。
 * 选择会立即记忆到当前 game+profile，无需手动保存。
 */
export function ViewModeToggle() {
  const t = useT();
  const current = useViewModeStore((s) => s.current);

  const handleClick = (value: ViewMode) => {
    // 读取当前最新的 game + profile（不在渲染期订阅，避免多余重渲染）
    const { currentGame, activePresetName } = useStore.getState();
    useViewModeStore.getState().setMode(currentGame, activePresetName ?? "Default", value);
  };

  return (
    <div className="inline-flex items-center rounded-lg bg-morandi-sidebar p-0.5">
      {MODES.map(({ value, icon: Icon, labelKey }) => (
        <button
          key={value}
          onClick={() => handleClick(value)}
          className={clsx(
            "p-1 rounded-md transition-all",
            current === value
              ? "bg-morandi-card text-morandi-accent shadow-sm"
              : "text-morandi-text-muted hover:text-morandi-text",
          )}
          title={t(labelKey)}
        >
          <Icon className="w-3.5 h-3.5" />
        </button>
      ))}
    </div>
  );
}
