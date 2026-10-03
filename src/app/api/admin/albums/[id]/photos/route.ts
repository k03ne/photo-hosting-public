import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { processImage } from "@/lib/images";
import { prisma } from "@/lib/prisma";
import { getStorage } from "@/lib/storage";
import { getStorageUsage } from "@/lib/storage-usage";
import { requireAdmin } from "@/server/current-admin";

// sharp ist nativ -> Node-Runtime erzwingen.
export const runtime = "nodejs";

const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif", "image/tiff"];
const MAX_BYTES = 64 * 1024 * 1024; // 64 MB pro Datei (RAW-freundlich)

function extFromName(name: string): string | null {
  const m = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : null;
}

function extFromMime(mime: string): string | null {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/avif": "avif",
    "image/tiff": "tiff",
  };
  return map[mime] ?? null;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let admin;
  try {
    admin = await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Nicht authentifiziert." }, { status: 401 });
  }

  const album = await prisma.album.findFirst({
    where: { id, ownerId: admin.id },
  });
  if (!album) {
    return NextResponse.json({ error: "Album nicht gefunden." }, { status: 404 });
  }

  const form = await req.formData();
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "Keine Dateien." }, { status: 400 });
  }

  // Speicher-Kontingent prüfen: Ist ein Limit gesetzt und würde dieser Upload es
  // überschreiten, wird die ganze Charge abgewiesen. Als Schätzung dient die
  // Summe der Quell-Dateigrößen (die tatsächliche Belegung inkl. WebP-Variante
  // liegt etwas darüber, wird aber nach dem Upload exakt ausgewiesen).
  const usage = await getStorageUsage(admin.id);
  if (usage.limitBytes != null) {
    const incoming = files.reduce((sum, f) => sum + f.size, 0);
    if (usage.usedBytes + incoming > usage.limitBytes) {
      return NextResponse.json(
        { error: "Speicher-Limit erreicht. Bitte Platz freigeben oder das Limit erhöhen." },
        { status: 413 },
      );
    }
  }

  // Modus bei Namens-Kollision (vom Uploader gesetzt); Default: neues Duplikat.
  const mode = String(form.get("mode") ?? "duplicate");
  const replacePhotoId = form.get("replacePhotoId");
  const replaceId = typeof replacePhotoId === "string" ? replacePhotoId : null;

  const storage = getStorage();

  // sortOrder ans Ende anhängen.
  const last = await prisma.photo.findFirst({
    where: { albumId: id },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  let order = (last?.sortOrder ?? -1) + 1;

  const created = [];
  for (const file of files) {
    if (!ACCEPTED.includes(file.type)) {
      return NextResponse.json(
        { error: `Nicht unterstützter Typ: ${file.type || "unbekannt"}` },
        { status: 415 },
      );
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: `Datei zu groß: ${file.name}` },
        { status: 413 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const processed = await processImage(buffer);

    // Immer einen neuen Base-Key erzeugen -> beim Ersetzen bricht das den Cache
    // (die alte mediaUrl wird nicht länger referenziert).
    const base = `albums/${id}/${randomUUID()}`;
    await storage.save(`${base}.webp`, processed.full, "image/webp");
    await storage.save(`${base}_thumb.webp`, processed.thumb, "image/webp");

    // Unveränderte Quelldatei zum Download erhalten (volle Qualität).
    const ext = extFromName(file.name) || extFromMime(file.type) || "bin";
    const originalKey = `${base}_original.${ext}`;
    await storage.save(originalKey, buffer, file.type || "application/octet-stream");

    // Bild-abgeleitete Felder (identisch für create und update).
    const imageData = {
      storageKey: base,
      originalName: file.name,
      mimeType: "image/webp",
      sizeBytes: processed.full.length,
      originalKey,
      originalMime: file.type || "application/octet-stream",
      originalSizeBytes: file.size,
      width: processed.width,
      height: processed.height,
      blurDataUrl: processed.blurDataUrl,
      takenAt: processed.takenAt,
      exif: processed.exif ?? undefined,
    };

    // Ziel-Foto beim Ersetzen laden (mit Ownership-Prüfung). Nicht gefunden
    // (z.B. zwischenzeitlich gelöscht) -> Fallback auf normales Anlegen.
    const target =
      mode !== "duplicate" && replaceId
        ? await prisma.photo.findFirst({
            where: {
              id: replaceId,
              albumId: id,
              album: { ownerId: admin.id },
              deletedAt: null,
            },
            select: { id: true, storageKey: true, originalKey: true, rawKey: true },
          })
        : null;

    let photo;
    if (target) {
      // Alte Bilddateien entfernen (RAW bleibt bei "replace-keep" erhalten).
      await storage.delete(`${target.storageKey}.webp`);
      await storage.delete(`${target.storageKey}_thumb.webp`);
      if (target.originalKey) await storage.delete(target.originalKey);

      const overwrite = mode === "overwrite-keep" || mode === "overwrite-end";
      if (overwrite) {
        // Komplett ersetzen: bisherige Daten verwerfen.
        await prisma.reaction.deleteMany({ where: { photoId: target.id } });
        await prisma.comment.deleteMany({ where: { photoId: target.id } });
        if (target.rawKey) await storage.delete(target.rawKey);
      }

      photo = await prisma.photo.update({
        where: { id: target.id },
        data: {
          ...imageData,
          ...(overwrite && {
            caption: null,
            category: null,
            isKeyVisual: false,
            rawKey: null,
            rawName: null,
            rawSizeBytes: null,
          }),
          ...(mode === "overwrite-end" && { sortOrder: order++ }),
        },
        select: {
          id: true,
          storageKey: true,
          width: true,
          height: true,
          blurDataUrl: true,
        },
      });
    } else {
      photo = await prisma.photo.create({
        data: {
          albumId: id,
          ...imageData,
          sortOrder: order++,
        },
        select: {
          id: true,
          storageKey: true,
          width: true,
          height: true,
          blurDataUrl: true,
        },
      });
    }
    created.push(photo);
  }

  return NextResponse.json({ photos: created }, { status: 201 });
}
