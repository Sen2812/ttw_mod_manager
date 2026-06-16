/**
 * Node.js Binary Reader
 *
 * Implements the BinaryReader interface using Node.js fs.
 * Used for reading pack file headers without external dependencies.
 */

import * as fs from "fs";
import { BinaryReader } from "./pack-header-reader";

export class NodeBinaryReader implements BinaryReader {
  private fd: number | null = null;
  private path: string;

  constructor(path: string) {
    this.path = path;
  }

  async open(): Promise<void> {
    this.fd = fs.openSync(this.path, "r");
  }

  close(): void {
    if (this.fd !== null) {
      fs.closeSync(this.fd);
      this.fd = null;
    }
  }

  async seek(position: number): Promise<void> {
    if (this.fd === null) throw new Error("File not open");
    fs.readSync(this.fd, Buffer.alloc(0), 0, 0, position);
  }

  async readInt32(): Promise<number> {
    if (this.fd === null) throw new Error("File not open");
    const buf = Buffer.alloc(4);
    fs.readSync(this.fd, buf, 0, 4, null);
    return buf.readInt32LE(0);
  }

  async readBytes(length: number): Promise<Buffer> {
    if (this.fd === null) throw new Error("File not open");
    const buf = Buffer.alloc(length);
    fs.readSync(this.fd, buf, 0, length, null);
    return buf;
  }
}
