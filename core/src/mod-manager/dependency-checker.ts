/**
 * Mod dependency / prerequisite checker.
 *
 * Supports:
 *   - Steam Workshop prerequisites (reqModIds)
 *   - Pack-level dependencies (dependencyPacks from .pack header)
 */

import type { Mod } from "../types";
import { isUsableWorkshopTitle, getModDisplayName } from "./mod-display";

/** Why a prerequisite is unsatisfied. */
export type DependencyIssueStatus =
  | "ok"
  | "not_enabled"
  | "not_downloaded"
  | "not_subscribed";

export type DependencyKind = "workshop" | "pack";

export interface DependencyIssue {
  /** Workshop ID or pack file name. */
  id: string;
  /** Human-readable name for display. */
  displayName: string;
  kind: DependencyKind;
  status: DependencyIssueStatus;
  /** Matching installed mod pack name, if any. */
  matchedModName?: string;
}

export interface ModDependencyReport {
  modName: string;
  issues: DependencyIssue[];
  hasIssues: boolean;
}

export interface DependencyCheckContext {
  /** All installed mods (enabled + disabled). */
  mods: Mod[];
  /** Workshop IDs with a folder under the game's content directory. */
  subscribedWorkshopIds: Set<string>;
}

function modByWorkshopId(mods: Mod[], workshopId: string): Mod | undefined {
  return mods.find(m => m.workshopId === workshopId);
}

function modByPackName(mods: Mod[], packName: string): Mod | undefined {
  const key = packName.toLowerCase().replace(/\.pack$/i, "");
  return mods.find(m => m.name.toLowerCase().replace(/\.pack$/i, "") === key);
}

function workshopDisplayName(
  workshopId: string,
  reqModIdToName: [string, string][] | undefined,
  matched?: Mod,
): string {
  if (matched && isUsableWorkshopTitle(matched.humanName, workshopId)) return matched.humanName;
  const pair = reqModIdToName?.find(([id]) => id === workshopId);
  if (pair?.[1] && isUsableWorkshopTitle(pair[1], workshopId)) return pair[1];
  return workshopId;
}

function classifyWorkshopPrerequisite(
  workshopId: string,
  ctx: DependencyCheckContext,
  displayName: string,
): DependencyIssue {
  const matched = modByWorkshopId(ctx.mods, workshopId);
  if (matched) {
    if (!matched.isEnabled) {
      return {
        id: workshopId,
        displayName,
        kind: "workshop",
        status: "not_enabled",
        matchedModName: matched.name,
      };
    }
    return { id: workshopId, displayName, kind: "workshop", status: "ok", matchedModName: matched.name };
  }

  if (ctx.subscribedWorkshopIds.has(workshopId)) {
    return { id: workshopId, displayName, kind: "workshop", status: "not_downloaded" };
  }
  return { id: workshopId, displayName, kind: "workshop", status: "not_subscribed" };
}

function classifyPackPrerequisite(packName: string, ctx: DependencyCheckContext): DependencyIssue {
  const matched = modByPackName(ctx.mods, packName);
  const displayName = matched ? getModDisplayName(matched) : packName.replace(/\.pack$/i, "");
  if (matched) {
    if (!matched.isEnabled) {
      return {
        id: packName,
        displayName,
        kind: "pack",
        status: "not_enabled",
        matchedModName: matched.name,
      };
    }
    return { id: packName, displayName, kind: "pack", status: "ok", matchedModName: matched.name };
  }
  // Pack deps have no subscription concept — treat as not downloaded.
  return { id: packName, displayName, kind: "pack", status: "not_downloaded" };
}

/** Collect all prerequisite issues for a single mod (non-ok only). */
export function getModDependencyIssues(mod: Mod, ctx: DependencyCheckContext): DependencyIssue[] {
  const issues: DependencyIssue[] = [];
  const seen = new Set<string>();

  for (const workshopId of mod.reqModIds ?? []) {
    const key = `w:${workshopId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const displayName = workshopDisplayName(workshopId, mod.reqModIdToName, modByWorkshopId(ctx.mods, workshopId));
    const issue = classifyWorkshopPrerequisite(workshopId, ctx, displayName);
    if (issue.status !== "ok") issues.push(issue);
  }

  for (const packName of mod.dependencyPacks ?? []) {
    const key = `p:${packName.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const issue = classifyPackPrerequisite(packName, ctx);
    if (issue.status !== "ok") issues.push(issue);
  }

  return issues;
}

/** Reports for all currently enabled mods that have unsatisfied prerequisites. */
export function getEnabledModDependencyReports(ctx: DependencyCheckContext): Record<string, ModDependencyReport> {
  const reports: Record<string, ModDependencyReport> = {};
  for (const mod of ctx.mods) {
    if (!mod.isEnabled) continue;
    const issues = getModDependencyIssues(mod, ctx);
    if (issues.length === 0) continue;
    reports[mod.name] = { modName: mod.name, issues, hasIssues: true };
  }
  return reports;
}

/** Installed mod pack names that can be enabled to satisfy prerequisites. */
export function collectEnableablePrerequisiteModNames(issues: DependencyIssue[]): string[] {
  const names = new Set<string>();
  for (const issue of issues) {
    if (issue.status === "not_enabled" && issue.matchedModName) {
      names.add(issue.matchedModName);
    }
  }
  return [...names];
}

/** Union of enableable prerequisites across multiple mod reports. */
export function collectAllEnableablePrerequisites(
  reports: Record<string, ModDependencyReport> | ModDependencyReport[],
): string[] {
  const names = new Set<string>();
  const list = Array.isArray(reports) ? reports : Object.values(reports);
  for (const report of list) {
    for (const name of collectEnableablePrerequisiteModNames(report.issues)) {
      names.add(name);
    }
  }
  return [...names];
}
