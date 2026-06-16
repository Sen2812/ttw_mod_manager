import { useI18nStore } from "../i18n";
import { Languages } from "lucide-react";
import clsx from "clsx";

/**
 * 紧凑的语言切换按钮。点击在 中/英 之间切换。
 * 用于 TopBar。带有 segmented control 风格。
 */
export function LanguageToggle({ compact = false }: { compact?: boolean }) {
  const locale = useI18nStore((s) => s.locale);
  const toggle = useI18nStore((s) => s.toggle);

  if (compact) {
    // 紧凑模式：单按钮，显示当前语言缩写
    return (
      <button
        onClick={toggle}
        className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium text-morandi-text-secondary hover:bg-morandi-hover transition-colors"
        title={locale === "zh" ? "切换到 English" : "Switch to 中文"}
      >
        <Languages className="w-3.5 h-3.5" />
        <span>{locale === "zh" ? "中" : "EN"}</span>
      </button>
    );
  }

  // 分段控件风格：两个选项并排
  return (
    <div className="inline-flex items-center rounded-lg bg-morandi-sidebar p-0.5">
      <button
        onClick={() => useI18nStore.getState().setLocale("zh")}
        className={clsx(
          "px-3 py-1 rounded-md text-xs font-medium transition-all",
          locale === "zh" ? "bg-morandi-card text-morandi-text shadow-sm" : "text-morandi-text-muted hover:text-morandi-text",
        )}
      >
        中文
      </button>
      <button
        onClick={() => useI18nStore.getState().setLocale("en")}
        className={clsx(
          "px-3 py-1 rounded-md text-xs font-medium transition-all",
          locale === "en" ? "bg-morandi-card text-morandi-text shadow-sm" : "text-morandi-text-muted hover:text-morandi-text",
        )}
      >
        English
      </button>
    </div>
  );
}
