/**
 * Launch crash diagnostics — capture CA game evidence around a launch.
 *
 * Does not invent crash files. It snapshots AppData logs/dumps before launch,
 * then compares after exit and writes a readable report under the manager data dir.
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const FOLDER_NAME = "crash-diagnostics";
const STATE_FILE = "state.json";
const REPORTS_DIR = "reports";
const READ_LIMIT = 4 * 1024 * 1024;
const DUMP_TIME = /^D(\d{4}-\d{2}-\d{2})_T(\d{2}-\d{2}-\d{2})$/;
const LOADED_LINE = /^\s*Mod:\s*(.+?)\s*$/gim;

export interface FileSignature {
  mtimeNs: number;
  size: number;
}

export interface CrashDumpInfo {
  name: string;
  path: string;
  at: number;
  exception?: { code: string; address: string; access?: string; target?: string };
  process?: { pid?: number; createdAt?: number };
  stack: string[];
}

export interface LaunchEvidence {
  logSignature: FileSignature | null;
  uncleanSignature: FileSignature | null;
  dumpsBefore: Record<string, FileSignature>;
}

export interface LaunchModSnapshot {
  name: string;
  humanName?: string;
  workshopId?: string;
  isInData?: boolean;
}

export interface LaunchRecord {
  gameId: string;
  gamePath: string;
  userDir: string;
  processName: string;
  startedAt: number;
  endedAt?: number;
  processIds: number[];
  mods: LaunchModSnapshot[];
  evidence: LaunchEvidence;
  acknowledged?: boolean;
  evidenceSealed?: boolean;
  finalDiagnosis?: CrashDiagnosis;
}

export interface CrashDiagnosis {
  status: "running" | "no_run" | "not_started" | "loaded_all" | "interrupted" | "no_mods_loaded" | "unreadable";
  crashed: boolean;
  noCleanExit: boolean;
  expectedCount: number;
  loadedCount: number;
  loaded: string[];
  pending: string[];
  dumps: CrashDumpInfo[];
  shouldNotify: boolean;
  logPath: string;
  report: string;
  detail?: string;
}

export interface CrashDiagnosticsState {
  version: 1;
  games: Record<string, LaunchRecord>;
}

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

export function crashDiagnosticsRoot(dataDir: string): string {
  return path.join(dataDir, FOLDER_NAME);
}

export function crashDiagnosticsReportsDir(dataDir: string): string {
  return path.join(crashDiagnosticsRoot(dataDir), REPORTS_DIR);
}

export function gameUserDirectory(appDataFolderName: string): string {
  const root = process.env.APPDATA
    || path.join(os.homedir(), "AppData", "Roaming");
  return path.join(root, "The Creative Assembly", appDataFolderName);
}

export function fileSignature(filePath: string): FileSignature | null {
  try {
    const stat = fs.statSync(filePath) as fs.Stats & { mtimeNs?: bigint };
    const mtimeNs = typeof stat.mtimeNs === "bigint"
      ? Number(stat.mtimeNs)
      : Math.round(stat.mtimeMs * 1e6);
    return { mtimeNs, size: stat.size };
  } catch {
    return null;
  }
}

function signaturesEqual(a: FileSignature | null | undefined, b: FileSignature | null | undefined): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.mtimeNs === b.mtimeNs && a.size === b.size;
}

function readTextLimited(filePath: string): string {
  const fd = fs.openSync(filePath, "r");
  try {
    const buf = Buffer.alloc(READ_LIMIT + 1);
    const bytes = fs.readSync(fd, buf, 0, buf.length, 0);
    const raw = buf.subarray(0, bytes);
    if (raw.length > READ_LIMIT) {
      throw new Error(`Diagnostic input exceeds ${READ_LIMIT} bytes: ${path.basename(filePath)}`);
    }
    if (raw.length >= 2 && ((raw[0] === 0xff && raw[1] === 0xfe) || (raw[0] === 0xfe && raw[1] === 0xff))) {
      return raw.toString("utf16le");
    }
    if (raw.length > 4 && raw[1] === 0 && raw[3] === 0) {
      return raw.toString("utf16le");
    }
    return raw.toString("utf8");
  } finally {
    fs.closeSync(fd);
  }
}

function dumpStream(filePath: string, kind: number, length: number): Buffer | null {
  try {
    const size = fs.statSync(filePath).size;
    const fd = fs.openSync(filePath, "r");
    try {
      const header = Buffer.alloc(32);
      if (fs.readSync(fd, header, 0, 32, 0) !== 32 || header.subarray(0, 4).toString("ascii") !== "MDMP") {
        return null;
      }
      const count = header.readUInt32LE(8);
      const directory = header.readUInt32LE(12);
      if (count > 4096 || directory + count * 12 > size) return null;
      const entries = Buffer.alloc(count * 12);
      fs.readSync(fd, entries, 0, entries.length, directory);
      for (let i = 0; i < count; i++) {
        const streamKind = entries.readUInt32LE(i * 12);
        const streamLength = entries.readUInt32LE(i * 12 + 4);
        const offset = entries.readUInt32LE(i * 12 + 8);
        if (streamKind !== kind || streamLength < length || offset + length > size) continue;
        const payload = Buffer.alloc(length);
        fs.readSync(fd, payload, 0, length, offset);
        return payload;
      }
      return null;
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return null;
  }
}

function readDumpException(filePath: string): CrashDumpInfo["exception"] | undefined {
  const payload = dumpStream(filePath, 6, 168);
  if (!payload || payload.length !== 168) return undefined;
  const code = payload.readUInt32LE(8);
  const address = payload.readBigUInt64LE(24);
  const parameterCount = Math.min(payload.readUInt32LE(32), 15);
  const params: bigint[] = [];
  for (let i = 0; i < parameterCount; i++) {
    params.push(payload.readBigUInt64LE(40 + i * 8));
  }
  const result: NonNullable<CrashDumpInfo["exception"]> = {
    code: `0x${code.toString(16).toUpperCase().padStart(8, "0")}`,
    address: `0x${address.toString(16)}`,
  };
  if (code === 0xC0000005 && params.length >= 2) {
    const kind = params[0] === 0n ? "read" : params[0] === 1n ? "write" : String(params[0]);
    result.access = kind;
    result.target = `0x${params[1].toString(16)}`;
  }
  return result;
}

function readDumpProcess(filePath: string): CrashDumpInfo["process"] | undefined {
  const payload = dumpStream(filePath, 15, 24);
  if (!payload || payload.length !== 24) return undefined;
  const size = payload.readUInt32LE(0);
  const flags = payload.readUInt32LE(4);
  const pid = payload.readUInt32LE(8);
  const createdAt = payload.readUInt32LE(12);
  if (size < 24 || !(flags & 1) || !pid) return undefined;
  const result: NonNullable<CrashDumpInfo["process"]> = { pid };
  if (flags & 2) result.createdAt = createdAt;
  return result;
}

function dumpSnapshot(directory: string): Record<string, FileSignature> {
  const result: Record<string, FileSignature> = {};
  try {
    if (!fs.existsSync(directory)) return result;
    for (const name of fs.readdirSync(directory)) {
      if (!name.toLowerCase().endsWith(".mdmp")) continue;
      const full = path.join(directory, name);
      const sig = fileSignature(full);
      if (sig) result[full] = sig;
    }
  } catch {
    // ignore
  }
  return result;
}

function dumpBelongsToLaunch(
  dump: CrashDumpInfo,
  processIds: number[],
  startedAt: number,
): boolean {
  const identity = dump.process;
  if (!identity?.pid) return processIds.length === 0;
  if (!processIds.includes(identity.pid)) return false;
  if (identity.createdAt != null && identity.createdAt < Math.floor(startedAt)) return false;
  return true;
}

export function collectCrashDumps(
  directory: string,
  since: number,
  before: Record<string, FileSignature> = {},
): CrashDumpInfo[] {
  const result: CrashDumpInfo[] = [];
  const now = Date.now() / 1000;
  for (const [full, signature] of Object.entries(dumpSnapshot(directory))) {
    const prior = before[full];
    if (prior && prior.mtimeNs === signature.mtimeNs && prior.size === signature.size) continue;
    let stamp = signature.mtimeNs / 1e9;
    const stem = path.basename(full, path.extname(full));
    const match = DUMP_TIME.exec(stem);
    if (match) {
      const iso = `${match[1]}T${match[2].replace(/-/g, ":")}`;
      const parsed = Date.parse(iso);
      if (!Number.isNaN(parsed)) stamp = parsed / 1000;
    }
    if (stamp < since - 2 || stamp > now + 5) continue;
    let stack: string[] = [];
    try {
      stack = readTextLimited(full.replace(/\.mdmp$/i, ".stack.txt")).split(/\r?\n/).slice(0, 32);
    } catch {
      stack = [];
    }
    result.push({
      name: path.basename(full),
      path: full,
      at: stamp,
      exception: readDumpException(full),
      process: readDumpProcess(full),
      stack,
    });
  }
  return result.sort((a, b) => b.at - a.at).slice(0, 5);
}

export function captureEvidence(userDir: string): LaunchEvidence {
  const logs = path.join(userDir, "logs");
  return {
    logSignature: fileSignature(path.join(logs, "modified.log")),
    uncleanSignature: fileSignature(path.join(logs, "no_clean_exit")),
    dumpsBefore: dumpSnapshot(path.join(userDir, "crash_report")),
  };
}

export function createLaunchRecord(input: {
  gameId: string;
  gamePath: string;
  userDir: string;
  processName: string;
  startedAt: number;
  processIds?: number[];
  mods: LaunchModSnapshot[];
  evidence: LaunchEvidence;
}): LaunchRecord {
  return {
    gameId: input.gameId,
    gamePath: input.gamePath,
    userDir: input.userDir,
    processName: input.processName,
    startedAt: input.startedAt,
    processIds: [...(input.processIds ?? [])],
    mods: input.mods.map((m) => ({ ...m })),
    evidence: input.evidence,
    acknowledged: false,
    evidenceSealed: false,
  };
}

function emptyDiagnosis(running = false): CrashDiagnosis {
  return {
    status: running ? "running" : "no_run",
    crashed: false,
    noCleanExit: false,
    expectedCount: 0,
    loadedCount: 0,
    loaded: [],
    pending: [],
    dumps: [],
    shouldNotify: false,
    logPath: "",
    report: "",
  };
}

export function diagnoseLaunch(record: LaunchRecord | null | undefined, running = false): CrashDiagnosis {
  if (!record || running) return emptyDiagnosis(running);

  if (record.finalDiagnosis && record.evidenceSealed) {
    const sealed = { ...record.finalDiagnosis };
    sealed.shouldNotify = sealed.crashed && !record.acknowledged;
    return sealed;
  }

  if (record.finalDiagnosis && !record.evidenceSealed) {
    const result = { ...record.finalDiagnosis, dumps: [...record.finalDiagnosis.dumps] };
    if (record.processIds.length > 0) {
      const dumps = collectCrashDumps(
        path.join(record.userDir, "crash_report"),
        record.startedAt,
        record.evidence.dumpsBefore,
      ).filter((dump) => dumpBelongsToLaunch(dump, record.processIds, record.startedAt));
      const known = new Set(result.dumps.map((d) => d.path));
      const delayed = dumps.filter((d) => !known.has(d.path));
      if (delayed.length > 0) {
        result.dumps.push(...delayed);
        result.crashed = true;
        result.report = buildReport(record, result);
        record.finalDiagnosis = { ...result };
      }
    }
    result.shouldNotify = result.crashed && !record.acknowledged;
    return result;
  }

  const logPath = path.join(record.userDir, "logs", "modified.log");
  const result = emptyDiagnosis(false);
  result.logPath = logPath;
  result.expectedCount = record.mods.length;
  const startedAt = record.startedAt;
  result.dumps = collectCrashDumps(
    path.join(record.userDir, "crash_report"),
    startedAt,
    record.evidence.dumpsBefore,
  );
  if (record.processIds.length > 0) {
    result.dumps = result.dumps.filter((dump) => dumpBelongsToLaunch(dump, record.processIds, startedAt));
  }
  result.crashed = result.dumps.length > 0;

  const unclean = fileSignature(path.join(record.userDir, "logs", "no_clean_exit"));
  result.noCleanExit = !!unclean && !signaturesEqual(unclean, record.evidence.uncleanSignature);

  const signature = fileSignature(logPath);
  if (!signature
    || signaturesEqual(signature, record.evidence.logSignature)
    || signature.mtimeNs / 1e9 < startedAt - 2) {
    result.status = "not_started";
  } else {
    try {
      const text = readTextLimited(logPath);
      const loaded = [...text.matchAll(LOADED_LINE)].map((m) => path.basename(m[1].trim()));
      const unique = [...new Set(loaded)];
      const loadedKeys = new Set(unique.map((n) => n.toLowerCase()));
      result.loaded = unique;
      result.pending = record.mods
        .map((m) => m.name)
        .filter((name) => !loadedKeys.has(name.toLowerCase()));
      result.loadedCount = result.expectedCount - result.pending.length;
      result.status = result.expectedCount > 0 && unique.length === 0
        ? "no_mods_loaded"
        : result.pending.length > 0
          ? "interrupted"
          : "loaded_all";
    } catch (e) {
      result.status = "unreadable";
      result.detail = e instanceof Error ? e.message : String(e);
    }
  }

  result.report = buildReport(record, result);
  result.shouldNotify = result.crashed && !record.acknowledged;
  if (result.status !== "not_started" || result.crashed) {
    record.endedAt = Date.now() / 1000;
    record.finalDiagnosis = { ...result };
  }
  return result;
}

export function freezeLaunch(record: LaunchRecord | null | undefined): CrashDiagnosis | null {
  if (!record || record.evidenceSealed) return record?.finalDiagnosis ?? null;
  const result = diagnoseLaunch(record, false);
  record.endedAt = record.endedAt ?? Date.now() / 1000;
  record.finalDiagnosis = { ...result };
  record.evidenceSealed = true;
  return result;
}

function buildReport(record: LaunchRecord, diagnosis: CrashDiagnosis): string {
  const lines = [
    "TTW Mod Manager — crash diagnostics / 崩溃诊断",
    `Game / 游戏: ${record.gameId}`,
    `Started / 启动: ${new Date(record.startedAt * 1000).toISOString()}`,
    `Ended / 结束: ${record.endedAt ? new Date(record.endedAt * 1000).toISOString() : "(open)"}`,
    `Status / 状态: ${diagnosis.status}`,
    `Crashed / 是否崩溃: ${diagnosis.crashed ? "yes" : "no"}`,
    `No clean exit / 非正常退出标记: ${diagnosis.noCleanExit ? "yes" : "no"}`,
    `Process IDs / 进程: ${record.processIds.join(", ") || "(unknown)"}`,
    `Mods planned / 计划启用: ${diagnosis.expectedCount}`,
    `Mods loaded (modified.log) / 日志中已加载: ${diagnosis.loadedCount}`,
    `User dir / 游戏用户目录: ${record.userDir}`,
    `Log / 加载日志: ${diagnosis.logPath}`,
    "",
    "Note: packs missing from modified.log are suspects, not proven causes.",
    "说明：modified.log 里未出现的 pack 只是嫌疑，不是已确认原因。",
    "",
  ];
  if (diagnosis.pending.length > 0) {
    lines.push("Pending / 未出现在加载日志:");
    for (const name of diagnosis.pending) lines.push(`  - ${name}`);
    lines.push("");
  }
  if (diagnosis.dumps.length > 0) {
    lines.push("Crash dumps / 崩溃转储:");
    for (const dump of diagnosis.dumps) {
      const exc = dump.exception
        ? `${dump.exception.code} @ ${dump.exception.address}`
          + (dump.exception.access ? ` (${dump.exception.access} ${dump.exception.target})` : "")
        : "(no exception stream)";
      lines.push(`  - ${dump.name} ${exc}`);
      if (dump.stack.length) {
        lines.push(`    stack: ${dump.stack.slice(0, 8).join(" > ")}`);
      }
    }
    lines.push("");
  }
  lines.push("Enabled mods at launch / 启动时启用的 Mod:");
  for (const mod of record.mods) {
    const label = mod.humanName ? `${mod.name} (${mod.humanName})` : mod.name;
    lines.push(`  - ${label}`);
  }
  lines.push("");
  return lines.join("\n");
}

export function loadCrashDiagnosticsState(dataDir: string): CrashDiagnosticsState {
  const filePath = path.join(crashDiagnosticsRoot(dataDir), STATE_FILE);
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as CrashDiagnosticsState;
    if (raw?.version === 1 && raw.games && typeof raw.games === "object") return raw;
  } catch {
    // ignore
  }
  return { version: 1, games: {} };
}

export function saveCrashDiagnosticsState(dataDir: string, state: CrashDiagnosticsState): void {
  const root = crashDiagnosticsRoot(dataDir);
  ensureDir(root);
  fs.writeFileSync(path.join(root, STATE_FILE), JSON.stringify(state, null, 2), "utf8");
}

export function writeCrashReport(dataDir: string, record: LaunchRecord, diagnosis: CrashDiagnosis): string | null {
  if (!diagnosis.crashed && !diagnosis.noCleanExit) return null;
  const reports = crashDiagnosticsReportsDir(dataDir);
  ensureDir(reports);
  const stamp = new Date((record.endedAt ?? Date.now() / 1000) * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  const name = [
    stamp.getFullYear(),
    pad(stamp.getMonth() + 1),
    pad(stamp.getDate()),
  ].join("-")
    + `_${pad(stamp.getHours())}-${pad(stamp.getMinutes())}-${pad(stamp.getSeconds())}`
    + `_${record.gameId}.txt`;
  const filePath = path.join(reports, name);
  const body = diagnosis.report || buildReport(record, diagnosis);
  fs.writeFileSync(filePath, body, "utf8");
  return filePath;
}

export function getLaunchRecord(state: CrashDiagnosticsState, gameId: string): LaunchRecord | undefined {
  return state.games[gameId];
}

export function setLaunchRecord(state: CrashDiagnosticsState, record: LaunchRecord): void {
  state.games[record.gameId] = record;
}
