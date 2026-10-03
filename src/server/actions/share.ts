"use server";

import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";

import { grantAccess, revokeAccess } from "@/lib/album-access";
import { prisma } from "@/lib/prisma";
import { clientIpHash, isRateLimited, recordAttempt } from "@/lib/security";
import { albumByIdentifier } from "@/lib/share-lookup";

export type UnlockState = { error?: string };

/**
 * Prüft das Album-Passwort. shareToken wird per .bind() vorab gebunden,
 * daher passt die Signatur zu useActionState (prevState, formData).
 */
export async function unlockAlbum(
  shareToken: string,
  _prev: UnlockState,
  formData: FormData,
): Promise<UnlockState> {
  const album = await prisma.album.findFirst({
    where: albumByIdentifier(shareToken),
    select: { id: true, passwordHash: true },
  });
  if (!album?.passwordHash) {
    return { error: "Album nicht verfügbar." };
  }

  const ipHash = await clientIpHash();
  if (await isRateLimited(album.id, ipHash)) {
    return {
      error: "Zu viele Fehlversuche. Bitte in einigen Minuten erneut versuchen.",
    };
  }

  const password = String(formData.get("password") ?? "");
  const ok = await bcrypt.compare(password, album.passwordHash);
  await recordAttempt(album.id, ipHash, ok);

  if (!ok) return { error: "Falsches Passwort." };

  await grantAccess(album.id);
  redirect(`/a/${shareToken}`);
}

/** Gast-Logout: entfernt das Zugriffs-Cookie und zeigt wieder das Passwort-Gate. */
export async function lockAlbum(shareToken: string): Promise<void> {
  const album = await prisma.album.findFirst({
    where: albumByIdentifier(shareToken),
    select: { id: true },
  });
  if (album) await revokeAccess(album.id);
  redirect(`/a/${shareToken}`);
}
