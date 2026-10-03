import { promises as fs } from "node:fs";
import path from "node:path";

import type { StorageDriver, StorageObject } from "./types";

/** Speichert Bilder im lokalen Filesystem (per Docker-Volume persistiert). */
export class LocalStorageDriver implements StorageDriver {
  private readonly root: string;

  constructor(rootDir: string) {
    this.root = path.resolve(process.cwd(), rootDir);
  }

  /** Verhindert Path-Traversal und baut den absoluten Pfad. */
  private resolve(key: string): string {
    const target = path.resolve(this.root, key);
    if (target !== this.root && !target.startsWith(this.root + path.sep)) {
      throw new Error("Ungültiger Storage-Key.");
    }
    return target;
  }

  async save(key: string, data: Buffer): Promise<void> {
    const target = this.resolve(key);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, data);
  }

  async delete(key: string): Promise<void> {
    try {
      await fs.unlink(this.resolve(key));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
  }

  async get(key: string): Promise<StorageObject | null> {
    try {
      const body = await fs.readFile(this.resolve(key));
      return { kind: "buffer", body, contentType: contentTypeFor(key) };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  }
}

function contentTypeFor(key: string): string {
  if (key.endsWith(".webp")) return "image/webp";
  if (key.endsWith(".jpg") || key.endsWith(".jpeg")) return "image/jpeg";
  if (key.endsWith(".png")) return "image/png";
  // Video (minimaler Support): Original wird direkt ausgeliefert.
  if (key.endsWith(".mp4") || key.endsWith(".m4v")) return "video/mp4";
  if (key.endsWith(".webm")) return "video/webm";
  if (key.endsWith(".mov")) return "video/quicktime";
  if (key.endsWith(".ogg") || key.endsWith(".ogv")) return "video/ogg";
  return "application/octet-stream";
}
