/**
 * 轻量国际化基础设施
 *
 * 设计：
 * - Zustand store 管理当前语言 + 翻译字典
 * - localStorage 持久化语言选择
 * - `useT()` hook 返回翻译函数 `t(key, params?)`，支持 `{name}` 插值
 * - 翻译键用点分命名空间组织（如 "sidebar.profiles"）
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { zh } from "./locales/zh";
import { en } from "./locales/en";

export type Locale = "zh" | "en";

/** 翻译字典：扁平点分键 -> 文本 */
type Dict = Record<string, string>;

const DICTS: Record<Locale, Dict> = { zh, en };

/** 翻译函数：支持 {name} 风格的插值 */
export type TFunc = (key: string, params?: Record<string, string | number>) => string;

interface I18nState {
  locale: Locale;
  setLocale: (l: Locale) => void;
  toggle: () => void;
}

export const useI18nStore = create<I18nState>()(
  persist(
    (set, get) => ({
      locale: "zh",
      setLocale: (locale) => set({ locale }),
      toggle: () => set({ locale: get().locale === "zh" ? "en" : "zh" }),
    }),
    {
      name: "i18n-storage",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ locale: s.locale }),
    },
  ),
);

/**
 * 翻译 hook。订阅当前语言，返回稳定的翻译函数。
 *
 * 用法：
 *   const t = useT();
 *   t("sidebar.profiles")           // "配置档案" / "Profiles"
 *   t("modlist.count", { n: 5 })    // "5 个 mod" / "5 mods"
 */
export function useT(): TFunc {
  const locale = useI18nStore((s) => s.locale);
  return (key, params) => {
    const dict = DICTS[locale];
    let text = dict[key] ?? DICTS.zh[key] ?? key;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        text = text.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
      }
    }
    return text;
  };
}
