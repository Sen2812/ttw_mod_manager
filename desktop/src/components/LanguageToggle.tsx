import { useI18nStore, useT } from "../i18n";
import { Languages } from "lucide-react";
import clsx from "clsx";

/**
 * 紧凑的语言切换按钮。点击在 中/英 之间切换。
 * 用于 TopBar。带有 segmented control 风格。
 */
export function LanguageToggle({ compact = false }: { compact?: boolean }) {
  const t = useT();
  const locale = useI18nStore((s) => s.locale);
  const toggle = useI18nStore((s) => s.toggle);

  if (compact) {
    return (
      <button
        onClick={toggle}
        className="btn-morandi-subtle !flex-none px-2"
        title={locale === "zh" ? t("topbar.switchToEnglish") : t("topbar.switchToChinese")}
      >
        <Languages className="w-3.5 h-3.5" />
        <span>{locale === "zh" ? "中" : "EN"}</span>
      </button>
    );
  }

  return (
    <div className="segment-control">
      <button
        onClick={() => useI18nStore.getState().setLocale("zh")}
        className={clsx("segment-item", locale === "zh" && "segment-item-active")}
        title={t("topbar.switchToChinese")}
      >
        中文
      </button>
      <button
        onClick={() => useI18nStore.getState().setLocale("en")}
        className={clsx("segment-item", locale === "en" && "segment-item-active")}
        title={t("topbar.switchToEnglish")}
      >
        English
      </button>
    </div>
  );
}
