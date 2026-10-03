"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { getStorage } from "@/lib/storage";
import { requireAdmin } from "@/server/current-admin";

/** Lädt ein Foto und stellt sicher, dass es zu einem Album des Admins gehört. */
async function ownedPhoto(photoId: string, adminId: string) {
  return prisma.photo.findFirst({
    where: { id: photoId, album: { ownerId: adminId } },
    select: {
      id: true,
      albumId: true,
      storageKey: true,
      originalKey: true,
      rawKey: true,
    },
  });
}

/** Stellt sicher, dass das Album dem Admin gehört; liefert die Album-ID. */
async function ownedAlbum(albumId: string, adminId: string): Promise<string> {
  const album = await prisma.album.findFirst({
    where: { id: albumId, ownerId: adminId },
    select: { id: true },
  });
  if (!album) throw new Error("Album nicht gefunden.");
  return album.id;
}

/**
 * Entfernt Fotos, die länger als eine Stunde im Papierkorb liegen, endgültig
 * (Dateien + Datensatz). Wird bei jeder Löschaktion nebenbei ausgeführt, damit
 * der Papierkorb nicht unbegrenzt wächst, „Rückgängig" aber innerhalb der
 * Sitzung zuverlässig funktioniert.
 */
async function purgeTrashed(albumId: string): Promise<void> {
  const cutoff = new Date(Date.now() - 60 * 60 * 1000);
  const old = await prisma.photo.findMany({
    where: { albumId, deletedAt: { lt: cutoff } },
    select: { id: true, storageKey: true, originalKey: true, rawKey: true },
  });
  if (old.length === 0) return;

  const storage = getStorage();
  for (const p of old) {
    await storage.delete(`${p.storageKey}.webp`);
    await storage.delete(`${p.storageKey}_thumb.webp`);
    if (p.originalKey) await storage.delete(p.originalKey);
    if (p.rawKey) await storage.delete(p.rawKey);
  }
  await prisma.photo.deleteMany({ where: { id: { in: old.map((p) => p.id) } } });
}

export async function deletePhoto(photoId: string): Promise<void> {
  const admin = await requireAdmin();
  const photo = await ownedPhoto(photoId, admin.id);
  if (!photo) throw new Error("Foto nicht gefunden.");

  // Soft-Delete: in den Papierkorb legen (Dateien bleiben für „Rückgängig").
  // Falls dieses Foto das Cover ist -> Referenz lösen.
  await prisma.album.updateMany({
    where: { id: photo.albumId, coverPhotoId: photoId },
    data: { coverPhotoId: null },
  });
  await prisma.photo.update({
    where: { id: photoId },
    data: { deletedAt: new Date() },
  });

  await purgeTrashed(photo.albumId);
  revalidatePath(`/admin/albums/${photo.albumId}`);
}

export async function removeRaw(photoId: string): Promise<void> {
  const admin = await requireAdmin();
  const photo = await ownedPhoto(photoId, admin.id);
  if (!photo) throw new Error("Foto nicht gefunden.");

  if (photo.rawKey) await getStorage().delete(photo.rawKey);
  await prisma.photo.update({
    where: { id: photoId },
    data: { rawKey: null, rawName: null, rawSizeBytes: null },
  });
  revalidatePath(`/admin/albums/${photo.albumId}`);
}

const metaSchema = z.object({
  caption: z.string().trim().max(500).optional(),
  category: z.string().trim().max(60).optional(),
  portfolioCategory: z.string().trim().max(60).optional(),
});

export async function updatePhoto(input: {
  photoId: string;
  caption: string;
  category: string;
  portfolioCategory: string;
}): Promise<void> {
  const admin = await requireAdmin();
  const photo = await ownedPhoto(input.photoId, admin.id);
  if (!photo) throw new Error("Foto nicht gefunden.");

  const parsed = metaSchema.parse({
    caption: input.caption || undefined,
    category: input.category || undefined,
    portfolioCategory: input.portfolioCategory || undefined,
  });

  await prisma.photo.update({
    where: { id: input.photoId },
    data: {
      caption: parsed.caption || null,
      category: parsed.category || null,
      portfolioCategory: parsed.portfolioCategory || null,
    },
  });
  revalidatePath(`/admin/albums/${photo.albumId}`);
  revalidatePath("/admin/bilder");
}

export async function reorderPhotos(
  albumId: string,
  orderedIds: string[],
): Promise<void> {
  const admin = await requireAdmin();
  await ownedAlbum(albumId, admin.id);

  // updateMany mit albumId-Filter => nur Fotos dieses Albums werden berührt.
  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.photo.updateMany({
        where: { id, albumId },
        data: { sortOrder: index },
      }),
    ),
  );
  revalidatePath(`/admin/albums/${albumId}`);
}

/**
 * Weist mehreren Fotos in einem Rutsch eine Galerie-Gruppe zu (leer = entfernen).
 * Die Gruppe steuert die Tab-Filter der Kundengalerie — NICHT das Portfolio.
 */
export async function setPhotosCategory(
  albumId: string,
  photoIds: string[],
  category: string,
): Promise<void> {
  const admin = await requireAdmin();
  await ownedAlbum(albumId, admin.id);

  const cat = category.trim().slice(0, 60);
  await prisma.photo.updateMany({
    where: { id: { in: photoIds }, albumId },
    data: { category: cat || null },
  });
  revalidatePath(`/admin/albums/${albumId}`);
}

/**
 * Weist mehreren Fotos eines Albums eine Portfolio-Kategorie zu (Mischalben-
 * Override; leer = entfernen → fällt auf die Album-Kategorie zurück). Wirkt nur
 * aufs öffentliche Portfolio, nicht auf die Kundengalerie.
 */
export async function setPhotosPortfolioCategory(
  albumId: string,
  photoIds: string[],
  category: string,
): Promise<void> {
  const admin = await requireAdmin();
  await ownedAlbum(albumId, admin.id);

  const cat = category.trim().slice(0, 60);
  await prisma.photo.updateMany({
    where: { id: { in: photoIds }, albumId },
    data: { portfolioCategory: cat || null },
  });
  revalidatePath(`/admin/albums/${albumId}`);
  revalidatePath("/admin/bilder");
  revalidatePath("/", "layout"); // öffentliches Portfolio neu auflösen
}

/**
 * Setzt für mehrere Fotos individuelle Portfolio-Kategorien (für „Rückgängig"
 * einer Zuweisung). Gruppiert nach Zielwert; `null`/leer entfernt das Override.
 */
export async function setPhotoPortfolioCategories(
  albumId: string,
  items: { id: string; portfolioCategory: string | null }[],
): Promise<void> {
  const admin = await requireAdmin();
  await ownedAlbum(albumId, admin.id);

  const byCategory = new Map<string | null, string[]>();
  for (const it of items) {
    const cat = (it.portfolioCategory ?? "").trim().slice(0, 60) || null;
    const ids = byCategory.get(cat) ?? [];
    ids.push(it.id);
    byCategory.set(cat, ids);
  }

  await prisma.$transaction(
    Array.from(byCategory.entries()).map(([cat, ids]) =>
      prisma.photo.updateMany({
        where: { id: { in: ids }, albumId },
        data: { portfolioCategory: cat },
      }),
    ),
  );
  revalidatePath(`/admin/albums/${albumId}`);
  revalidatePath("/admin/bilder");
  revalidatePath("/", "layout");
}

/**
 * Setzt/entfernt die Admin-Favoriten-Markierung mehrerer Fotos (Portfolio-
 * Kuratierung). Rein redaktionell — beeinflusst NICHT die Kunden-Galerie.
 */
export async function setPhotosFavorite(
  albumId: string,
  photoIds: string[],
  value: boolean,
): Promise<void> {
  const admin = await requireAdmin();
  await ownedAlbum(albumId, admin.id);

  await prisma.photo.updateMany({
    where: { id: { in: photoIds }, albumId },
    data: { isFavorite: value },
  });
  revalidatePath(`/admin/albums/${albumId}`);
}

/**
 * Gibt Fotos für den Seitenbereich frei bzw. entzieht die Freigabe. Global über
 * alle Alben des Admins (Mediathek). Wirkt sich auf automatische Block-Quellen
 * (heroScatter/Portfolio) aus.
 */
export async function setPhotosPublic(photoIds: string[], value: boolean): Promise<void> {
  const admin = await requireAdmin();
  if (photoIds.length === 0) return;
  await prisma.photo.updateMany({
    // Owner-Scope über die Album-Relation (updateMany erlaubt Relations-Filter).
    where: { id: { in: photoIds }, album: { ownerId: admin.id } },
    data: { isPublic: value },
  });
  revalidatePath("/admin/bilder");
  revalidatePath("/", "layout"); // öffentliche Block-Quellen neu auflösen
}

/**
 * Weist Fotos global (album-übergreifend, Mediathek „Bilder") eine Portfolio-
 * Kategorie zu bzw. entfernt das Override (leer). Owner-Scope über die Album-
 * Relation. Wirkt aufs öffentliche Portfolio.
 */
export async function setPhotosPortfolioCategoryGlobal(
  photoIds: string[],
  category: string,
): Promise<void> {
  const admin = await requireAdmin();
  if (photoIds.length === 0) return;
  const cat = category.trim().slice(0, 60);
  await prisma.photo.updateMany({
    where: { id: { in: photoIds }, album: { ownerId: admin.id } },
    data: { portfolioCategory: cat || null },
  });
  revalidatePath("/admin/bilder");
  revalidatePath("/", "layout");
}

/** Legt mehrere Fotos in den Papierkorb (Soft-Delete; Dateien bleiben). */
export async function deletePhotos(
  albumId: string,
  photoIds: string[],
): Promise<void> {
  const admin = await requireAdmin();
  await ownedAlbum(albumId, admin.id);

  // Cover-Referenz lösen, falls betroffen.
  await prisma.album.updateMany({
    where: { id: albumId, coverPhotoId: { in: photoIds } },
    data: { coverPhotoId: null },
  });
  await prisma.photo.updateMany({
    where: { id: { in: photoIds }, albumId, deletedAt: null },
    data: { deletedAt: new Date() },
  });

  await purgeTrashed(albumId);
  revalidatePath(`/admin/albums/${albumId}`);
}

/** Holt zuvor gelöschte Fotos aus dem Papierkorb zurück („Rückgängig"). */
export async function restorePhotos(
  albumId: string,
  photoIds: string[],
): Promise<void> {
  const admin = await requireAdmin();
  await ownedAlbum(albumId, admin.id);

  await prisma.photo.updateMany({
    where: { id: { in: photoIds }, albumId },
    data: { deletedAt: null },
  });
  revalidatePath(`/admin/albums/${albumId}`);
}

/**
 * Setzt für mehrere Fotos individuelle Kategorien (für „Rückgängig" einer
 * Kategorie-Zuweisung). Gruppiert nach Zielkategorie, um wenige Updates zu
 * fahren; `null`/leer entfernt die Kategorie.
 */
export async function setPhotoCategories(
  albumId: string,
  items: { id: string; category: string | null }[],
): Promise<void> {
  const admin = await requireAdmin();
  await ownedAlbum(albumId, admin.id);

  const byCategory = new Map<string | null, string[]>();
  for (const it of items) {
    const cat = (it.category ?? "").trim().slice(0, 60) || null;
    const ids = byCategory.get(cat) ?? [];
    ids.push(it.id);
    byCategory.set(cat, ids);
  }

  await prisma.$transaction(
    Array.from(byCategory.entries()).map(([cat, ids]) =>
      prisma.photo.updateMany({
        where: { id: { in: ids }, albumId },
        data: { category: cat },
      }),
    ),
  );
  revalidatePath(`/admin/albums/${albumId}`);
}

export async function setCoverPhoto(
  albumId: string,
  photoId: string,
): Promise<void> {
  const admin = await requireAdmin();
  const photo = await prisma.photo.findFirst({
    where: { id: photoId, albumId, album: { ownerId: admin.id } },
    select: { id: true },
  });
  if (!photo) throw new Error("Foto nicht gefunden.");

  await prisma.album.update({
    where: { id: albumId },
    data: { coverPhotoId: photoId },
  });
  revalidatePath(`/admin/albums/${albumId}`);
}

/**
 * Setzt den Fokuspunkt (object-position in %) des aktuellen Cover-Bildes eines
 * Albums. Der Wert liegt am Foto selbst — jedes potenzielle Cover behält so
 * seinen eigenen Bildausschnitt. Wirkt auf Galerie-Header & Kundenlogin.
 */
export async function setCoverFocus(
  albumId: string,
  x: number,
  y: number,
): Promise<void> {
  const admin = await requireAdmin();
  const album = await prisma.album.findFirst({
    where: { id: albumId, ownerId: admin.id },
    select: { coverPhotoId: true },
  });
  if (!album?.coverPhotoId) throw new Error("Kein Cover gesetzt.");

  const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v)));
  await prisma.photo.update({
    where: { id: album.coverPhotoId },
    data: { focusX: clamp(x), focusY: clamp(y) },
  });

  revalidatePath(`/admin/albums/${albumId}`);
  revalidatePath("/", "layout"); // öffentliche Galerie/Portfolio neu rendern
}
