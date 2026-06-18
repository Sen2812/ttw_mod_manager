import type { Mod } from "../types";
import type {
  DependencyCheckContext,
  ModDependencyReport,
} from "@core/mod-manager/dependency-checker";
import {
  collectAllEnableablePrerequisites,
  getEnabledModDependencyReports,
  getModDependencyIssues,
} from "@core/mod-manager/dependency-checker";

export function buildDependencyContext(
  mods: Mod[],
  subscribedWorkshopIds: string[],
): DependencyCheckContext {
  return { mods, subscribedWorkshopIds: new Set(subscribedWorkshopIds) };
}

export function scanEnabledDependencyReports(
  mods: Mod[],
  subscribedWorkshopIds: string[],
): ModDependencyReport[] {
  const reports = getEnabledModDependencyReports(buildDependencyContext(mods, subscribedWorkshopIds));
  return Object.values(reports);
}

export function getModDependencyReport(
  mod: Mod,
  mods: Mod[],
  subscribedWorkshopIds: string[],
): ModDependencyReport | null {
  const issues = getModDependencyIssues(mod, buildDependencyContext(mods, subscribedWorkshopIds));
  if (issues.length === 0) return null;
  return { modName: mod.name, issues, hasIssues: true };
}

export async function enableModNames(names: string[]): Promise<Mod[] | null> {
  if (names.length === 0) return null;
  let mods: Mod[] | null = null;
  for (const name of names) {
    const result = await window.api.enableMod(name);
    if (Array.isArray(result)) mods = result;
  }
  return mods;
}

export async function enableAvailablePrerequisites(
  reports: ModDependencyReport[],
): Promise<{ mods: Mod[] | null; enabled: string[] }> {
  const names = collectAllEnableablePrerequisites(reports);
  const mods = await enableModNames(names);
  return { mods, enabled: names };
}
