/**
 * Pack File Index Reader
 *
 * Reads the list of internal files (packed files) from a .pack file without
 * parsing their contents. This is what we need for file-level conflict /
 * overwrite detection between mods.
 *
 * Pack file layout (PFH3/4/5):
 *   offset 0   [4]  magic ("PFH3" / "PFH4" / "PFH5")
 *   offset 4   [4]  byte mask (bit 2 = is movie pack)
 *   offset 8   [4]  refFileCount (unused for our purposes)
 *   offset 12  [4]  pack_file_index_size   ← size of the dependency-pack index
 *   offset 16  [4]  pack_file_count        ← number of internal files
 *   offset 20  [4]  packed_file_index_size ← size of the internal-file index
 *   offset 24  [4]  header_buffer
 *   offset 28  [pack_file_index_size]      dependency pack names (null-separated)
 *   next       [packed_file_index_size]    internal file index:
 *                                           repeat pack_file_count times:
 *                                             [4] file_size (int32 LE)
 *                                             [1] is_compressed (int8)
 *                                             [n] name (null-terminated utf8)
 *   next       [...]                       actual file data
 */

import * as fs from "fs";

export interface PackFileEntry {
  /** Internal path, e.g. "db\\units_stats_tables\\data\\..." (backslash-separated) */
  name: string;
  /** Uncompressed size of the entry in bytes. */
  size: number;
}

export interface PackIndex {
  /** Absolute path to the .pack file on disk. */
  path: string;
  /** Internal files. */
  entries: PackFileEntry[];
  /** Whether this is a movie pack. */
  isMovie: boolean;
  /** Dependency pack names declared in the header. */
  dependencyPacks: string[];
}

const HEADER_FIXED_SIZE = 28; // magic(4) + 5 int32 fields + header_buffer(4)

/**
 * Read the internal file index of a pack file.
 *
 * Only reads the index region (names + sizes), never the file payloads, so it
 * is fast even for packs with thousands of entries.
 */
export async function readPackIndex(filePath: string): Promise<PackIndex> {
  let fd: number | null = null;
  try {
    fd = fs.openSync(filePath, "r");

    // ── 1. Read the fixed 28-byte header ──
    const headBuf = Buffer.alloc(HEADER_FIXED_SIZE);
    const n = fs.readSync(fd, headBuf, 0, HEADER_FIXED_SIZE, 0);
    if (n < HEADER_FIXED_SIZE) {
      throw new Error("Truncated pack header");
    }

    const magic = headBuf.toString("utf8", 0, 4);
    if (!/^PFH[345]$/.test(magic)) {
      throw new Error(`Unknown pack magic: ${magic}`);
    }

    const byteMask = headBuf.readInt32LE(4);
    const isMovie = (byteMask & 4) !== 0;
    const packFileIndexSize = headBuf.readInt32LE(12);
    const packFileCount = headBuf.readInt32LE(16);
    const packedFileIndexSize = headBuf.readInt32LE(20);

    // ── 2. Read the dependency-pack index ──
    const dependencyPacks: string[] = [];
    if (packFileIndexSize > 0) {
      const depBuf = Buffer.alloc(packFileIndexSize);
      fs.readSync(fd, depBuf, 0, packFileIndexSize, HEADER_FIXED_SIZE);
      let start = 0;
      for (let i = 0; i < packFileIndexSize; i++) {
        if (depBuf[i] === 0) {
          const name = depBuf.toString("utf8", start, i);
          if (name) dependencyPacks.push(name);
          start = i + 1;
        }
      }
      // Trailing entry without null terminator
      if (start < packFileIndexSize) {
        const name = depBuf.toString("utf8", start, packFileIndexSize);
        if (name) dependencyPacks.push(name);
      }
    }

    // ── 3. Read the internal-file index ──
    const entries: PackFileEntry[] = [];
    if (packFileCount > 0 && packedFileIndexSize > 0) {
      const idxBuf = Buffer.alloc(packedFileIndexSize);
      const idxOffset = HEADER_FIXED_SIZE + packFileIndexSize;
      fs.readSync(fd, idxBuf, 0, packedFileIndexSize, idxOffset);

      let pos = 0;
      for (let i = 0; i < packFileCount && pos < packedFileIndexSize; i++) {
        if (pos + 5 > packedFileIndexSize) break;
        const size = idxBuf.readInt32LE(pos);
        pos += 4;
        pos += 1; // is_compressed (1 byte) — we don't need it
        // Read null-terminated name
        let end = pos;
        while (end < packedFileIndexSize && idxBuf[end] !== 0) end++;
        const name = idxBuf.toString("utf8", pos, end);
        entries.push({ name, size });
        pos = end + 1; // skip the null terminator
      }
    }

    return { path: filePath, entries, isMovie, dependencyPacks };
  } finally {
    if (fd !== null) {
      try {
        fs.closeSync(fd);
      } catch {
        /* ignore */
      }
    }
  }
}
