import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { hasAccess } from "@/lib/album-access";
import { prisma } from "@/lib/prisma";
import { getStorage } from "@/lib/storage";

export const runtime = "nodejs";

/**
 * Auslieferung aller Medien. Passwortgeschützte Alben werden hier MITgeprüft:
 * Vorher schützte das Album-Passwort nur die Auflistung — wer eine Bild-URL
 * kannte (weitergeleiteter Link, Browser-Verlauf, Referrer), kam dauerhaft an
 * die Datei, auch nach einem Passwortwechsel.
 *
 * Ergebnis der Zuordnung wird kurz im Speicher gehalten, damit eine Galerie mit
 * 100 Thumbnails nicht 100 identische Abfragen auslöst.
 */
type KeyInfo = { albumId: string; isProtected: boolean } | null;

const LOOKUP_TTL_MS = 60_000;
const lookupCache = new Map<string, { value: KeyInfo; expires: number }>();

/**
 * Findet das Foto zu einem Storage-Key. Varianten leiten sich vom Basis-Key ab
 * (`<key>.webp`, `<key>_thumb.webp`); Original und RAW haben eigene Keys.
 */
async function lookupKey(keyPath: string): Promise<KeyInfo> {
  const cached = lookupCache.get(keyPath);
  if (cached && cached.expires > Date.now()) return cached.value;

  const base = keyPath.replace(/(_thumb)?\.webp$/, "");
  const photo = await prisma.photo.findFirst({
    where: { OR: [{ storageKey: base }, { originalKey: keyPath }, { rawKey: keyPath }] },
    select: { albumId: true, album: { select: { passwordHash: true } } },
  });

  // Kein Treffer = kein Foto (Logo, Branding-Bild) → öffentlich, wie bisher.
  const value: KeyInfo = photo
    ? { albumId: photo.albumId, isProtected: photo.album.passwordHash !== null }
    : null;
  lookupCache.set(keyPath, { value, expires: Date.now() + LOOKUP_TTL_MS });
  return value;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ key: string[] }> },
) {
  const { key } = await params;
  const keyPath = key.join("/");

  // Path-Traversal ausschließen (zusätzlich zur Prüfung im Local-Driver).
  if (keyPath.includes("..")) {
    return new NextResponse("Bad request", { status: 400 });
  }

  const info = await lookupKey(keyPath);
  if (info?.isProtected) {
    // Gast mit gültigem Album-Cookie ODER angemeldeter Admin (Backend-Ansicht).
    const allowed = (await hasAccess(info.albumId)) || Boolean((await auth())?.user?.email);
    // 404 statt 403: die Existenz der Datei wird nicht bestätigt.
    if (!allowed) return new NextResponse("Not found", { status: 404 });
  }

  const obj = await getStorage().get(keyPath);
  if (!obj) {
    return new NextResponse("Not found", { status: 404 });
  }

  if (obj.kind === "redirect") {
    return NextResponse.redirect(obj.url);
  }

  return new NextResponse(obj.body as BodyInit, {
    headers: {
      "Content-Type": obj.contentType,
      // Keys sind unveränderlich (uuid) -> aggressiv cachen. Geschützte Bilder
      // aber NUR im Browser des Gastes, nie in einem geteilten Proxy/CDN.
      "Cache-Control": info?.isProtected
        ? "private, max-age=3600"
        : "public, max-age=31536000, immutable",
    },
  });
}
