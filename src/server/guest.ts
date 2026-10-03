import "server-only";

import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";

// Anonyme Gast-ID (Cookie), um Likes/Kommentare einem Besucher zuzuordnen,
// ohne echte Anmeldung.
const COOKIE = "guest_id";
const MAX_AGE = 60 * 60 * 24 * 365; // 1 Jahr

/** Liest die Gast-ID (oder null), ohne zu setzen — für Server Components. */
export async function getGuestId(): Promise<string | null> {
  const store = await cookies();
  return store.get(COOKIE)?.value ?? null;
}

/** Liest die Gast-ID oder legt sie an — nur aus Server Actions aufrufbar. */
export async function ensureGuestId(): Promise<string> {
  const store = await cookies();
  const existing = store.get(COOKIE)?.value;
  if (existing) return existing;

  const id = randomUUID();
  store.set(COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
  return id;
}
