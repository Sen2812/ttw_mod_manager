/**
 * Writes a minimal start-game pack that replaces intro cinematics with empty stubs.
 * Compatible with WH3-Mod-Manager's !!!!out.pack approach.
 */

import * as fs from "fs";
import * as path from "path";
import { EMPTY_MOVIE_STUB } from "./empty-movie";

export const START_GAME_PACK_NAME = "!!!!out.pack";
export const START_GAME_PACK_DIR = "temp-packs";

export interface StartGamePackOptions {
  packHeader: string;
  introMoviePaths: string[];
  supportsCompression: boolean;
}

function appendInt32(chunks: Buffer[], value: number): void {
  const buf = Buffer.allocUnsafe(4);
  buf.writeInt32LE(value, 0);
  chunks.push(buf);
}

function appendInt8(chunks: Buffer[], value: number): void {
  chunks.push(Buffer.from([value]));
}

function appendString(chunks: Buffer[], value: string): void {
  chunks.push(Buffer.from(value, "utf8"));
}

/** Build binary content for a skip-intro start-game pack. */
export function buildSkipIntroPackContent(options: StartGamePackOptions): Buffer {
  const { packHeader, introMoviePaths, supportsCompression } = options;
  if (introMoviePaths.length === 0) {
    throw new Error("No intro movie paths provided");
  }

  const fileSize = EMPTY_MOVIE_STUB.length;
  const indexEntrySize = (name: string) => Buffer.byteLength(name, "utf8") + 1 + (supportsCompression ? 5 : 4);
  const indexSize = introMoviePaths.reduce((sum, name) => sum + indexEntrySize(name), 0);

  const header: Buffer[] = [];
  appendString(header, packHeader);
  appendInt32(header, 3); // byte mask
  appendInt32(header, 0); // ref file count
  appendInt32(header, 0); // pack file index size (legacy)
  appendInt32(header, introMoviePaths.length);
  appendInt32(header, indexSize);
  appendInt32(header, 0x7fffffff); // header buffer marker

  const index: Buffer[] = [];
  for (const name of introMoviePaths) {
    appendInt32(index, fileSize);
    if (supportsCompression) appendInt8(index, 0);
    appendString(index, name);
    appendInt8(index, 0);
  }

  const data: Buffer[] = [];
  for (let i = 0; i < introMoviePaths.length; i++) {
    data.push(EMPTY_MOVIE_STUB);
  }

  return Buffer.concat([...header, ...index, ...data]);
}

/** Write skip-intro pack to disk, creating parent directories as needed. */
export function writeSkipIntroPack(outputPath: string, options: StartGamePackOptions): void {
  const dir = path.dirname(outputPath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(outputPath, buildSkipIntroPackContent(options));
}
