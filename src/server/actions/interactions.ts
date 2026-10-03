"use server";

import { z } from "zod";

import { hasAccess } from "@/lib/album-access";
import { randomGuestName } from "@/lib/guest-name";
import { prisma } from "@/lib/prisma";
import { ensureGuestId } from "@/server/guest";

/**
 * Lädt ein Foto samt Album-Schutzstatus und stellt sicher, dass der Gast
 * zugriffsberechtigt ist (Album veröffentlicht + ggf. Passwort-Cookie).
 */
async function assertPhotoAccess(photoId: string) {
  const photo = await prisma.photo.findFirst({
    where: { id: photoId, deletedAt: null, album: { isPublished: true } },
    select: {
      id: true,
      albumId: true,
      album: { select: { passwordHash: true } },
    },
  });
  if (!photo) throw new Error("Foto nicht verfügbar.");
  if (photo.album.passwordHash && !(await hasAccess(photo.albumId))) {
    throw new Error("Kein Zugriff.");
  }
  return photo;
}

export async function toggleLike(
  photoId: string,
): Promise<{ liked: boolean; count: number }> {
  await assertPhotoAccess(photoId);
  const guestId = await ensureGuestId();

  const existing = await prisma.reaction.findUnique({
    where: { photoId_guestId: { photoId, guestId } },
    select: { id: true },
  });

  let liked: boolean;
  if (existing) {
    await prisma.reaction.delete({ where: { id: existing.id } });
    liked = false;
  } else {
    await prisma.reaction.create({
      data: { photoId, guestId, type: "HEART", value: 1 },
    });
    liked = true;
  }

  const count = await prisma.reaction.count({ where: { photoId } });
  return { liked, count };
}

export type GuestComment = {
  id: string;
  body: string;
  guestName: string | null;
  createdAt: Date;
};

export async function getComments(photoId: string): Promise<GuestComment[]> {
  // Auch das LESEN muss geprüft werden: Server Actions sind öffentliche
  // Endpunkte. Ohne den Check ließen sich mit einer geratenen Foto-ID die
  // Kommentare zu passwortgeschützten, unveröffentlichten oder gelöschten
  // Fotos abrufen — `toggleLike`/`addComment` prüfen längst.
  await assertPhotoAccess(photoId);
  return prisma.comment.findMany({
    where: { photoId, isHidden: false },
    orderBy: { createdAt: "asc" },
    select: { id: true, body: true, guestName: true, createdAt: true },
  });
}

const commentSchema = z.object({
  body: z.string().trim().min(1, "Kommentar darf nicht leer sein.").max(1000),
  guestName: z.string().trim().max(60).optional(),
});

export async function addComment(input: {
  photoId: string;
  body: string;
  guestName?: string;
}): Promise<GuestComment> {
  await assertPhotoAccess(input.photoId);
  const parsed = commentSchema.parse({
    body: input.body,
    guestName: input.guestName || undefined,
  });

  const guestId = await ensureGuestId();
  const guestName = parsed.guestName || randomGuestName();

  return prisma.comment.create({
    data: {
      photoId: input.photoId,
      body: parsed.body,
      guestName,
      guestId,
    },
    select: { id: true, body: true, guestName: true, createdAt: true },
  });
}
