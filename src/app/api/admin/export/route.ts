import archiver from "archiver";
import { Readable } from "node:stream";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/server/current-admin";
import { getStorage } from "@/lib/storage";
import type { StorageDriver } from "@/lib/storage";

export const runtime = "nodejs";

/** Liest ein Storage-Objekt als Buffer (folgt S3-Redirects per fetch). */
async function readToBuffer(storage: StorageDriver, key: string): Promise<Buffer | null> {
  const obj = await storage.get(key);
  if (!obj) return null;
  if (obj.kind === "buffer") return obj.body;
  const res = await fetch(obj.url);
  if (!res.ok) return null;
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Backup-Export der eigenen Website. `?images=1` legt zusätzlich alle Bilddateien
 * (Anzeige-, Thumbnail-, Original- und RAW-Varianten + Logo) ins Archiv.
 * Enthält `data.json` mit Einstellungen, Alben, Fotos-Metadaten und Seiten.
 * Admin-only, gestreamt (kein Zwischenspeichern im RAM).
 */
export async function GET(req: Request) {
  const admin = await requireAdmin();
  const withImages = new URL(req.url).searchParams.get("images") === "1";

  const [settings, albums, pages] = await Promise.all([
    prisma.siteSettings.findUnique({ where: { ownerId: admin.id } }),
    prisma.album.findMany({
      where: { ownerId: admin.id },
      include: {
        photos: { include: { reactions: true, comments: true } },
        comments: true,
      },
    }),
    prisma.page.findMany({ where: { ownerId: admin.id } }),
  ]);

  const data = {
    exportedAt: new Date().toISOString(),
    version: 1,
    admin: { email: admin.email, name: admin.name, createdAt: admin.createdAt },
    settings,
    albums,
    pages,
  };
  // BigInt-sicher (falls je vorhanden) und lesbar formatiert.
  const json = JSON.stringify(data, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2);

  const stamp = new Date().toISOString().slice(0, 10);

  const archive = archiver("zip", { zlib: { level: 6 } });
  archive.append(Buffer.from(json, "utf8"), { name: "data.json" });

  if (withImages) {
    const storage = getStorage();
    const keys = new Set<string>();
    for (const album of albums) {
      for (const p of album.photos) {
        keys.add(`${p.storageKey}.webp`);
        keys.add(`${p.storageKey}_thumb.webp`);
        if (p.originalKey) keys.add(p.originalKey);
        if (p.rawKey) keys.add(p.rawKey);
      }
    }
    if (settings?.logoImageKey) keys.add(settings.logoImageKey);

    void (async () => {
      try {
        for (const key of keys) {
          const buf = await readToBuffer(storage, key);
          if (buf) archive.append(buf, { name: `files/${key}` });
        }
        await archive.finalize();
      } catch (err) {
        archive.destroy(err as Error);
      }
    })();
  } else {
    await archive.finalize();
  }

  const webStream = Readable.toWeb(archive) as unknown as ReadableStream;
  return new Response(webStream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="backup-${stamp}${withImages ? "-mit-bildern" : ""}.zip"`,
      "Cache-Control": "no-store",
    },
  });
}
