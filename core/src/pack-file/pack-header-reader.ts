/**
 * Pack File Header Reader
 *
 * Quick header-only read for .pack files.
 * Extracts metadata (movie flag, dependency packs) without full parsing.
 *
 * Pack file format (PFH3/4/5):
 *   [4 bytes]  Header magic ("PFH3", "PFH4", or "PFH5")
 *   [4 bytes]  Byte mask (bit 2 = is movie pack)
 *   [4 bytes]  (reserved / user data)
 *   [4 bytes]  Pack file index size
 *   [4 bytes]  (reserved)
 *   [4 bytes]  (reserved)
 *   [4 bytes]  (reserved)
 *   [4 bytes]  Header buffer size
 *   [variable] Header buffer (contains dependency pack names, null-separated)
 *   ...        Pack file entries follow
 */

import { PackHeaderData } from "../types";

/** Minimal binary reader interface — platform-agnostic */
export interface BinaryReader {
  open(): Promise<void>;
  close(): void;
  seek(position: number): Promise<void>;
  readInt32(): Promise<number>;
  readBytes(length: number): Promise<Buffer>;
}

/**
 * Read just the header of a pack file to get dependency info and movie flag.
 * Much faster than a full parse.
 */
export async function readPackHeader(
  filePath: string,
  readerFactory: (path: string) => BinaryReader,
): Promise<PackHeaderData> {
  let reader: BinaryReader | undefined;
  let isMovie = false;
  const dependencyPacks: string[] = [];

  try {
    reader = readerFactory(filePath);
    await reader.open();

    // Read header magic (4 bytes)
    const magicBytes = await reader.readBytes(4);
    const magic = magicBytes.toString("utf8", 0, 4);
    
    // Determine header size based on version
    const version = getPackVersion(magic);
    if (version === 0) {
      throw new Error(`Unknown pack magic: ${magic}`);
    }

    // Read byte mask (4 bytes)
    const byteMask = await reader.readInt32();
    isMovie = (byteMask & 4) !== 0; // bit 2 indicates movie pack

    // Skip reserved bytes (4 bytes)
    await reader.readInt32();

    // Read pack file index size (4 bytes)
    const packFileIndexSize = await reader.readInt32();

    // Skip remaining reserved bytes (12 bytes = 3 x int32)
    await reader.readInt32();
    await reader.readInt32();
    await reader.readInt32();

    // Read header buffer size (4 bytes)
    const headerBufferSize = await reader.readInt32();

    // Read header buffer for dependency packs
    if (headerBufferSize > 0 && headerBufferSize < 1024 * 1024) { // Sanity check: < 1MB
      const headerBuffer = await reader.readBytes(headerBufferSize);
      let start = 0;

      for (let i = 0; i < headerBufferSize; i++) {
        if (headerBuffer[i] === 0) {
          const name = headerBuffer.toString("utf8", start, i).trim();
          if (name && name.endsWith(".pack")) {
            dependencyPacks.push(name);
          }
          start = i + 1;
        }
      }
      
      // Handle last entry if not null-terminated
      if (start < headerBufferSize) {
        const name = headerBuffer.toString("utf8", start, headerBufferSize).trim();
        if (name && name.endsWith(".pack")) {
          dependencyPacks.push(name);
        }
      }
    }
  } catch (e) {
    // Don't log ENOENT errors as they're expected for some files
    if (e instanceof Error && !e.message.includes('ENOENT')) {
      console.error(`Failed to read pack header: ${filePath}`, e);
    }
  } finally {
    reader?.close();
  }

  return { path: filePath, isMovie, dependencyPacks };
}

/**
 * Determine the pack header version from the magic bytes.
 * Returns 3, 4, or 5, or 0 if unknown.
 */
export function getPackVersion(magic: string): number {
  const match = magic.match(/^PFH(\d)$/);
  return match ? parseInt(match[1], 10) : 0;
}
