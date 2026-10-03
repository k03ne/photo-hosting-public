import archiver from "archiver";
import { PassThrough, Readable } from "node:stream";

import {
  getAccessibleAlbum,
  parseQuality,
  resolveDownload,
} from "@/lib/download";
import { prisma } from "@/lib/prisma";
import { getStorage } from "@/lib/storage";

export const runtime = "nodejs";

const photoSelect = {
  id: true,
  storageKey: true,
  originalName: true,
  originalKey: true,
  rawKey: true,
  rawName: true,
  category: true,
} as const;

/** RFC-5987-sichere Content-Disposition mit ASCII-Fallback + UTF-8. */
function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  const utf8 = encodeURIComponent(filename);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${utf8}`;
}

function slug(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "album"
  );
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ shareToken: string }> },
) {
  const { shareToken } = await params;
  const album = await getAccessibleAlbum(shareToken);
  if (!album) return new Response("Nicht verfügbar.", { status: 404 });

  const url = new URL(req.url);
  const quality = parseQuality(url.searchParams.get("quality"));
  const photoId = url.searchParams.get("photo");
  const category = url.searchParams.get("category");
  const storage = getStorage();

  // ── Einzelbild ────────────────────────────────────────────────────────────
  if (photoId) {
    const photo = await prisma.photo.findFirst({
      where: { id: photoId, albumId: album.id, deletedAt: null },
      select: photoSelect,
    });
    if (!photo) return new Response("Nicht gefunden.", { status: 404 });

    const file = await resolveDownload(photo, quality, storage);
    if (!file) return new Response("In dieser Qualität nicht verfügbar.", { status: 404 });

    return new Response(file.body as BodyInit, {
      headers: {
        "Content-Type": file.contentType,
        "Content-Disposition": contentDisposition(file.filename),
      },
    });
  }

  // ── ZIP: gesamte Galerie oder eine Kategorie ────────────────────────────────
  const photos = await prisma.photo.findMany({
    where: {
      albumId: album.id,
      deletedAt: null,
      ...(category ? { category } : {}),
    },
    orderBy: { sortOrder: "asc" },
    select: photoSelect,
  });
  if (photos.length === 0) {
    return new Response("Keine Bilder.", { status: 404 });
  }

  // Namenskollisionen innerhalb des ZIP vermeiden.
  const used = new Map<string, number>();
  const uniqueName = (name: string): string => {
    const n = used.get(name) ?? 0;
    used.set(name, n + 1);
    if (n === 0) return name;
    const dot = name.lastIndexOf(".");
    return dot > 0
      ? `${name.slice(0, dot)}-${n}${name.slice(dot)}`
      : `${name}-${n}`;
  };

  // RAW angefragt: nur Bilder mit RAW-Begleitdatei kommen infrage. Vorab filtern,
  // damit der "nichts verfügbar"-Fall noch als 404 beantwortet werden kann, bevor
  // die (streamende) Antwort einmal begonnen hat.
  const candidates = quality === "raw" ? photos.filter((p) => p.rawKey) : photos;
  if (candidates.length === 0) {
    return new Response("In dieser Qualität nicht verfügbar.", { status: 404 });
  }

  const suffix = category ? slug(category) : "alle";
  const zipName = `${slug(album.title)}-${suffix}-${quality}.zip`;

  // ZIP streamen statt vollständig im Speicher zu puffern: Header + erste Bytes
  // gehen sofort raus, sodass der Reverse-Proxy nicht in ein 504 läuft, während
  // sharp die Bilder nacheinander re-encodiert. Backpressure regelt archiver.
  const archive = archiver("zip", { zlib: { level: 6 } });
  const out = new PassThrough();
  archive.pipe(out);

  (async () => {
    for (const photo of candidates) {
      const file = await resolveDownload(photo, quality, storage);
      if (file) archive.append(file.body, { name: uniqueName(file.filename) });
    }
    await archive.finalize();
  })().catch((err) => archive.destroy(err as Error));

  return new Response(Readable.toWeb(out) as ReadableStream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": contentDisposition(zipName),
    },
  });
}
