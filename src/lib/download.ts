import "server-only";

import { hasAccess } from "@/lib/album-access";
import { prisma } from "@/lib/prisma";
import { albumByIdentifier } from "@/lib/share-lookup";
import type { StorageDriver } from "@/lib/storage";

// JPG mittelgroß (Web-Weitergabe), JPG in Originalauflösung, oder RAW-Quelldatei.
export type Quality = "m" | "original" | "raw";

export function parseQuality(value: string | null): Quality {
  return value === "original" ? "original" : value === "raw" ? "raw" : "m";
}

export type PhotoForDownload = {
  storageKey: string;
  originalName: string;
  originalKey: string | null;
  rawKey: string | null;
  rawName: string | null;
};

export type ResolvedFile = {
  body: Buffer;
  contentType: string;
  filename: string;
};

/** Basisname ohne Endung, als Grundlage für JPG-/RAW-Dateinamen. */
function baseName(originalName: string): string {
  return originalName.replace(/\.[^.]+$/, "") || "bild";
}

/**
 * Erzeugt die herunterzuladende Datei für die gewünschte Qualität.
 * - "m"/"original": JPG via sharp (entfernt dabei EXIF/GPS); Quelle ist das
 *   Original, ersatzweise die Web-WebP-Variante.
 * - "raw": unveränderte RAW-Begleitdatei, sofern vorhanden (sonst null).
 */
export async function resolveDownload(
  photo: PhotoForDownload,
  quality: Quality,
  storage: StorageDriver,
): Promise<ResolvedFile | null> {
  const base = baseName(photo.originalName);

  if (quality === "raw") {
    if (!photo.rawKey) return null;
    const obj = await storage.get(photo.rawKey);
    if (!obj || obj.kind !== "buffer") return null;
    return {
      body: obj.body,
      contentType: "application/octet-stream",
      filename: photo.rawName ?? `${base}.raw`,
    };
  }

  // Quelle für die JPG-Erzeugung: bevorzugt Original, sonst Web-Variante.
  const sourceKey = photo.originalKey ?? `${photo.storageKey}.webp`;
  const src = await storage.get(sourceKey);
  if (!src || src.kind !== "buffer") return null;

  const sharp = (await import("sharp")).default;
  let pipeline = sharp(src.body).rotate(); // .rotate() ohne withMetadata => GPS/EXIF weg
  if (quality === "m") {
    pipeline = pipeline.resize(2048, 2048, {
      fit: "inside",
      withoutEnlargement: true,
    });
  }
  const body = await pipeline
    .jpeg({ quality: quality === "m" ? 85 : 92 })
    .toBuffer();

  return {
    body,
    contentType: "image/jpeg",
    filename: quality === "m" ? `${base}-M.jpg` : `${base}.jpg`,
  };
}

/**
 * Lädt ein veröffentlichtes Album, sofern der Gast darauf zugreifen darf
 * (kein Passwort ODER gültiges Zugriffs-Cookie). Sonst null.
 */
export async function getAccessibleAlbum(shareToken: string) {
  const album = await prisma.album.findFirst({
    where: albumByIdentifier(shareToken),
    select: { id: true, title: true, passwordHash: true },
  });
  if (!album) return null;
  if (album.passwordHash && !(await hasAccess(album.id))) return null;
  return album;
}
