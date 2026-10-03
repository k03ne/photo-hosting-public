import "server-only";

import crypto from "node:crypto";
import { headers } from "next/headers";

import { appSecret } from "@/lib/app-secret";
import { prisma } from "@/lib/prisma";

// Brute-Force-Schutz für Album-Passwörter: max. N Fehlversuche pro
// Album + IP innerhalb des Zeitfensters.
const WINDOW_MS = 15 * 60 * 1000; // 15 Minuten
const MAX_FAILED = 5;

/** Gehashte Client-IP (Datenschutz — keine Klartext-IP speichern). */
export async function clientIpHash(): Promise<string> {
  const h = await headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    "unknown";
  // Secret als Pepper: ohne ihn ließe sich der IP-Hash trivial zurückrechnen
  // (der Adressraum ist klein genug für eine vollständige Tabelle).
  return crypto.createHash("sha256").update(ip + appSecret()).digest("hex");
}

export async function isRateLimited(
  albumId: string,
  ipHash: string,
): Promise<boolean> {
  const since = new Date(Date.now() - WINDOW_MS);
  const failed = await prisma.accessAttempt.count({
    where: { albumId, ipHash, success: false, createdAt: { gte: since } },
  });
  return failed >= MAX_FAILED;
}

export async function recordAttempt(
  albumId: string,
  ipHash: string,
  success: boolean,
): Promise<void> {
  await prisma.accessAttempt.create({ data: { albumId, ipHash, success } });
}
