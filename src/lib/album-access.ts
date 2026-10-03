import "server-only";

import crypto from "node:crypto";
import { cookies } from "next/headers";

import { appSecret } from "@/lib/app-secret";

// Signiertes, httpOnly-Cookie pro Album. Der Wert ist ein HMAC der albumId,
// daher nicht fälschbar, ohne AUTH_SECRET zu kennen.
const MAX_AGE = 60 * 60 * 24 * 7; // 7 Tage

function sign(albumId: string): string {
  return crypto.createHmac("sha256", appSecret()).update(albumId).digest("hex");
}

function cookieName(albumId: string): string {
  return `alb_${albumId}`;
}

/** Setzt das Zugriffs-Cookie (nur aus Server Actions / Route Handlern aufrufbar). */
export async function grantAccess(albumId: string): Promise<void> {
  const store = await cookies();
  store.set(cookieName(albumId), sign(albumId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

/** Entfernt das Zugriffs-Cookie (Gast-Logout). */
export async function revokeAccess(albumId: string): Promise<void> {
  const store = await cookies();
  store.delete(cookieName(albumId));
}

/** Prüft, ob ein gültiges Zugriffs-Cookie für das Album vorliegt. */
export async function hasAccess(albumId: string): Promise<boolean> {
  const store = await cookies();
  const value = store.get(cookieName(albumId))?.value;
  if (!value) return false;

  const expected = sign(albumId);
  const a = Buffer.from(value);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
