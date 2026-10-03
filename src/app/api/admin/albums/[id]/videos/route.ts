import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { processImage } from "@/lib/images";
import { prisma } from "@/lib/prisma";
import { getStorage } from "@/lib/storage";
import { requireAdmin } from "@/server/current-admin";

// sharp (Poster-Verarbeitung) ist nativ -> Node-Runtime erzwingen.
export const runtime = "nodejs";

// Minimaler Ansatz (kein ffmpeg): nur web-sichere, direkt abspielbare Formate.
const ACCEPTED_VIDEO = ["video/mp4", "video/webm"];
const MAX_BYTES = 100 * 1024 * 1024; // 100 MB pro Video

function videoExt(mime: string): string {
  return mime === "video/webm" ? "webm" : "mp4";
}

/**
 * Video-Upload (minimal, ohne Transcoding). Der Client liefert die Videodatei
 * plus ein clientseitig erzeugtes Poster-Standbild. Das Poster wird wie ein
 * normales Foto zu WebP-Varianten verarbeitet (so zeigt jede bestehende
 * Bild-Ansicht automatisch das Standbild); die Videodatei wird unverändert
 * gespeichert und als `originalKey` (abspielbar/downloadbar) hinterlegt.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let admin;
  try {
    admin = await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Nicht authentifiziert." }, { status: 401 });
  }

  const album = await prisma.album.findFirst({ where: { id, ownerId: admin.id } });
  if (!album) return NextResponse.json({ error: "Album nicht gefunden." }, { status: 404 });

  const form = await req.formData();
  const file = form.get("file");
  const poster = form.get("poster");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Keine Videodatei." }, { status: 400 });
  }
  if (!ACCEPTED_VIDEO.includes(file.type)) {
    return NextResponse.json(
      { error: `Nicht unterstützter Videotyp: ${file.type || "unbekannt"}. Nur MP4/WebM.` },
      { status: 415 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: `Video zu groß: ${file.name}` }, { status: 413 });
  }
  if (!(poster instanceof File)) {
    return NextResponse.json({ error: "Kein Poster-Standbild." }, { status: 400 });
  }

  const durationMs = Number(form.get("duration")) || null;
  const storage = getStorage();

  // Poster wie ein Foto verarbeiten (WebP full/thumb/blur; entfernt GPS).
  const processed = await processImage(Buffer.from(await poster.arrayBuffer()));

  const base = `albums/${id}/${randomUUID()}`;
  await storage.save(`${base}.webp`, processed.full, "image/webp");
  await storage.save(`${base}_thumb.webp`, processed.thumb, "image/webp");

  // Videodatei unverändert ablegen (abspielbar/downloadbar).
  const videoKey = `${base}_video.${videoExt(file.type)}`;
  await storage.save(videoKey, Buffer.from(await file.arrayBuffer()), file.type);

  // sortOrder ans Ende.
  const last = await prisma.photo.findFirst({
    where: { albumId: id },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  const photo = await prisma.photo.create({
    data: {
      albumId: id,
      mediaType: "VIDEO",
      storageKey: base,
      originalName: file.name,
      mimeType: "image/webp", // Anzeige = Poster
      sizeBytes: processed.full.length,
      originalKey: videoKey,
      originalMime: file.type,
      originalSizeBytes: file.size,
      width: processed.width,
      height: processed.height,
      blurDataUrl: processed.blurDataUrl,
      durationMs,
      sortOrder: (last?.sortOrder ?? -1) + 1,
    },
    select: { id: true, storageKey: true, width: true, height: true, blurDataUrl: true },
  });

  return NextResponse.json({ photos: [photo] }, { status: 201 });
}
