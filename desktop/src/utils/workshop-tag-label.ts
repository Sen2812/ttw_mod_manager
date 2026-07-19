import { translateWorkshopTag, useI18nStore } from "../i18n";

/** Hook wrapper for translating Steam Workshop tags in React components. */
export function useWorkshopTagLabel(): (tag: string) => string {
  const locale = useI18nStore((s) => s.locale);
  return (tag: string) => translateWorkshopTag(tag, locale);
}
