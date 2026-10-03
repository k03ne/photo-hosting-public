"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { processImage } from "@/lib/images";
import { prisma } from "@/lib/prisma";
import { newShareToken } from "@/lib/share-token";
import { slugify } from "@/lib/slug";
import { getStorage } from "@/lib/storage";
import { getStorageUsage } from "@/lib/storage-usage";
import {
  DEMO_SOURCE,
  downloadPhoto,
  fetchRandomPhotos,
  trackDownload,
  UnsplashError,
  UnsplashRateLimitError,
  unsplashConfigured,
  type UnsplashPhoto,
} from "@/lib/unsplash";
import { requireAdmin } from "@/server/current-admin";

/**
 * Platzhalter-Bilder („Demo-Bilder") von Unsplash importieren, um leere oder
 * noch unsortierte Alben und die Startseite realistisch zu befüllen.
 *
 * Die Bilder laufen durch dieselbe Pipeline wie echte Uploads (`processImage`:
 * WebP, Thumbnail, Blur-Platzhalter) — sonst fehlten ihnen Varianten und sie
 * würden sich in Galerie und Startseite anders verhalten als das, was sie
 * imitieren sollen.
 *
 * Jedes importierte Foto trägt `demoSource = "unsplash"`. Nur darüber sind sie
 * später wieder sammelweise auffindbar: ausblenden (`hideDemoPhotos`) oder in
 * den Papierkorb legen (`deleteDemoPhotos`).
 *
 * Der Import läuft ZWEISTUFIG: `prepareDemoImport` holt nur die Bildliste,
 * `importDemoPhoto` lädt genau ein Bild. Die Schleife liegt damit im Client,
 * der so echten Fortschritt anzeigen kann („Bild 7 von 12") statt minutenlang
 * auf eine einzige Antwort zu warten. Die Bild-Metadaten laufen dabei über den
 * Client zurück — jede daraus gebaute URL wird serverseitig gegen die
 * Unsplash-Hosts geprüft (`assertUnsplashUrl` in `lib/unsplash.ts`).
 */

/** Name des Albums, das bei Import ohne Ziel automatisch entsteht. */
const DEMO_ALBUM_TITLE = "Demo-Bilder";

const prepareSchema = z.object({
  albumId: z.string().trim().min(1).optional(),
  count: z.number().int().min(1).max(30),
  topic: z.string().trim().max(60).optional(),
});

/** Rückläufer aus dem Client — bewusst eng, alles Weitere wird ignoriert. */
const photoSchema = z.object({
  id: z.string().trim().min(1).max(80),
  url: z.string().url().max(2000),
  credit: z.string().trim().max(200),
  description: z.string().trim().max(500).nullable(),
  downloadLocation: z.string().url().max(2000).nullable(),
});

const importSchema = z.object({
  albumId: z.string().trim().min(1),
  photo: photoSchema,
});

export type DemoPreparation =
  | {
      ok: true;
      albumId: string;
      photos: UnsplashPhoto[];
      /** Verbleibende Unsplash-Anfragen dieser Stunde, falls bekannt. */
      remaining: number | null;
      limit: number | null;
    }
  | {
      ok: false;
      error: string;
      /** Gesetzt, wenn das Kontingent aufgebraucht ist (geschätzte Freigabe). */
      retryAt?: string;
    };

/**
 * Schritt 1: Zielalbum klären und die Bildliste holen. Kostet genau eine
 * Unsplash-Anfrage (bei mehr als 30 Bildern entsprechend mehr).
 */
export async function prepareDemoImport(input: {
  albumId?: string;
  count: number;
  topic?: string;
}): Promise<DemoPreparation> {
  const admin = await requireAdmin();

  const parsed = prepareSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Ungültige Eingabe." };
  const { count, topic } = parsed.data;

  if (!unsplashConfigured()) {
    return { ok: false, error: "UNSPLASH_ACCESS_KEY ist nicht gesetzt." };
  }

  // Zielalbum: entweder ein eigenes des Admins oder das Sammelalbum.
  let albumId: string;
  if (parsed.data.albumId) {
    const album = await prisma.album.findFirst({
      where: { id: parsed.data.albumId, ownerId: admin.id },
      select: { id: true },
    });
    if (!album) return { ok: false, error: "Album nicht gefunden." };
    albumId = album.id;
  } else {
    albumId = await ensureDemoAlbum(admin.id);
  }

  try {
    const { photos, rate } = await fetchRandomPhotos(count, topic);
    if (photos.length === 0) return { ok: false, error: "Keine Bilder gefunden." };
    return { ok: true, albumId, photos, remaining: rate.remaining, limit: rate.limit };
  } catch (err) {
    if (err instanceof UnsplashRateLimitError) {
      return { ok: false, error: err.message, retryAt: err.resetAt.toISOString() };
    }
    return {
      ok: false,
      error: err instanceof UnsplashError ? err.message : "Unsplash nicht erreichbar.",
    };
  }
}

export type DemoImportResult =
  | { ok: true; storageKey: string }
  /** `stop`: weitere Versuche sind zwecklos (z.B. Speicher voll). */
  | { ok: false; error: string; stop?: boolean };

/**
 * Schritt 2: genau ein Bild laden, durch die Upload-Pipeline schicken und
 * speichern. Besitz und Speicher-Limit werden hier erneut geprüft — der Client
 * ruft die Aktion frei auf, die Vorbereitung ist keine Berechtigung.
 */
export async function importDemoPhoto(input: {
  albumId: string;
  photo: UnsplashPhoto;
}): Promise<DemoImportResult> {
  const admin = await requireAdmin();

  const parsed = importSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Ungültige Eingabe.", stop: true };
  const photo = parsed.data.photo;

  const album = await prisma.album.findFirst({
    where: { id: parsed.data.albumId, ownerId: admin.id },
    select: { id: true },
  });
  if (!album) return { ok: false, error: "Album nicht gefunden.", stop: true };

  // Das Speicher-Limit wird vor JEDEM Bild neu geprüft: anders als beim Upload
  // sind die Dateigrößen vorher nicht bekannt. Läuft der Speicher voll, bleiben
  // die bereits geladenen Bilder erhalten.
  const usage = await getStorageUsage(admin.id);
  if (usage.limitBytes != null && usage.usedBytes >= usage.limitBytes) {
    return { ok: false, error: "Speicherplatz aufgebraucht.", stop: true };
  }

  let buffer: Buffer;
  try {
    buffer = await downloadPhoto(photo);
  } catch (err) {
    // Einzelnes Bild überspringen — der Client zählt weiter.
    return { ok: false, error: err instanceof UnsplashError ? err.message : "Bild nicht ladbar." };
  }

  const processed = await processImage(buffer);
  const storage = getStorage();
  const base = `albums/${album.id}/${randomUUID()}`;
  await storage.save(`${base}.webp`, processed.full, "image/webp");
  await storage.save(`${base}_thumb.webp`, processed.thumb, "image/webp");

  const originalKey = `${base}_original.jpg`;
  await storage.save(originalKey, buffer, "image/jpeg");

  const last = await prisma.photo.findFirst({
    where: { albumId: album.id },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  await prisma.photo.create({
    data: {
      albumId: album.id,
      storageKey: base,
      originalName: `unsplash-${photo.id}.jpg`,
      mimeType: "image/webp",
      sizeBytes: processed.full.length,
      originalKey,
      originalMime: "image/jpeg",
      originalSizeBytes: buffer.length,
      width: processed.width,
      height: processed.height,
      blurDataUrl: processed.blurDataUrl,
      caption: photo.description,
      sortOrder: (last?.sortOrder ?? -1) + 1,
      // Für den Seitenbereich freigegeben — der Zweck ist ja, Startseite und
      // Blöcke sofort gefüllt zu sehen. `hideDemoPhotos` nimmt das zurück.
      isPublic: true,
      demoSource: DEMO_SOURCE,
      demoCredit: photo.credit,
    },
  });

  void trackDownload(photo);
  return { ok: true, storageKey: base };
}

/**
 * Nach dem letzten Bild EINMAL aufrufen. Die Neuberechnung pro Bild wäre teuer
 * und würde den Fortschritt sichtbar ausbremsen.
 */
export async function finishDemoImport(albumId: string): Promise<void> {
  await requireAdmin();
  revalidatePath(`/admin/albums/${albumId}`);
  revalidatePath("/admin/bilder");
  revalidatePath("/", "layout");
}

/** Legt das Sammelalbum an bzw. findet das vorhandene. Bleibt unveröffentlicht. */
async function ensureDemoAlbum(adminId: string): Promise<string> {
  const existing = await prisma.album.findFirst({
    where: { ownerId: adminId, title: DEMO_ALBUM_TITLE },
    select: { id: true },
  });
  if (existing) return existing.id;

  // Slug kann durch ein fremdes Album belegt sein (global eindeutig).
  let slug = slugify(DEMO_ALBUM_TITLE);
  for (let n = 2; await prisma.album.findUnique({ where: { slug } }); n++) {
    slug = `${slugify(DEMO_ALBUM_TITLE)}-${n}`;
  }

  const album = await prisma.album.create({
    data: {
      title: DEMO_ALBUM_TITLE,
      slug,
      description: "Platzhalter von Unsplash — zum Ausprobieren, nicht zum Veröffentlichen.",
      shareToken: newShareToken(),
      ownerId: adminId,
    },
    select: { id: true },
  });
  return album.id;
}

/** Anzahl der vorhandenen Demo-Bilder (für die Aufräum-Hinweise im Backend). */
export async function countDemoPhotos(): Promise<number> {
  const admin = await requireAdmin();
  return prisma.photo.count({
    where: { demoSource: DEMO_SOURCE, deletedAt: null, album: { ownerId: admin.id } },
  });
}

/**
 * Nimmt allen Demo-Bildern die Freigabe für den Seitenbereich — sie
 * verschwinden damit aus Startseite und automatischen Blöcken, bleiben in der
 * Mediathek aber erhalten.
 */
export async function hideDemoPhotos(): Promise<{ hidden: number }> {
  const admin = await requireAdmin();
  const res = await prisma.photo.updateMany({
    where: { demoSource: DEMO_SOURCE, album: { ownerId: admin.id }, isPublic: true },
    data: { isPublic: false },
  });
  revalidatePath("/admin/bilder");
  revalidatePath("/", "layout");
  return { hidden: res.count };
}

/**
 * Legt alle Demo-Bilder in den Papierkorb. Bewusst Soft-Delete wie überall
 * sonst: „Rückgängig" bleibt möglich, der Purge räumt die Dateien nach einer
 * Stunde endgültig weg.
 */
export async function deleteDemoPhotos(): Promise<{ deleted: number }> {
  const admin = await requireAdmin();

  const photos = await prisma.photo.findMany({
    where: { demoSource: DEMO_SOURCE, deletedAt: null, album: { ownerId: admin.id } },
    select: { id: true, albumId: true },
  });
  if (photos.length === 0) return { deleted: 0 };

  const ids = photos.map((p) => p.id);
  // Cover-Referenzen lösen, sonst zeigt ein Album auf ein Bild im Papierkorb.
  await prisma.album.updateMany({
    where: { ownerId: admin.id, coverPhotoId: { in: ids } },
    data: { coverPhotoId: null },
  });
  await prisma.photo.updateMany({ where: { id: { in: ids } }, data: { deletedAt: new Date() } });

  for (const albumId of new Set(photos.map((p) => p.albumId))) {
    revalidatePath(`/admin/albums/${albumId}`);
  }
  revalidatePath("/admin/bilder");
  revalidatePath("/", "layout");
  return { deleted: ids.length };
}
