import "server-only";

import crypto from "node:crypto";

import { appSecret } from "@/lib/app-secret";

/**
 * Symmetrische Verschlüsselung kleiner Secrets (z.B. das SMTP-Passwort) für die
 * Ablage in der DB. AES-256-GCM mit einem aus `AUTH_SECRET` abgeleiteten
 * Schlüssel — dasselbe Vertrauensmodell wie beim Album-Zugriff
 * ([album-access.ts](src/lib/album-access.ts)): ohne `AUTH_SECRET` nicht lesbar.
 * Serverseitig only.
 */
const ALGO = "aes-256-gcm";

function key(): Buffer {
  // Fixer App-Salt → stabiler Schlüssel über Neustarts hinweg.
  return crypto.scryptSync(appSecret(), "photo-hosting/secret-box", 32);
}

/** Verschlüsselt Klartext → `iv:tag:ciphertext` (jeweils base64). */
export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, enc].map((b) => b.toString("base64")).join(":");
}

/** Entschlüsselt; bei ungültigem/verfälschtem Input `null` (nie werfen). */
export function decryptSecret(payload: string): string | null {
  try {
    const [ivB64, tagB64, encB64] = payload.split(":");
    if (!ivB64 || !tagB64 || !encB64) return null;
    const decipher = crypto.createDecipheriv(ALGO, key(), Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(encB64, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}
