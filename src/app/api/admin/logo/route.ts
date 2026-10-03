import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";
import sharp from "sharp";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/server/current-admin";
import { getStorage } from "@/lib/storage";
import { DEFAULT_THEME } from "@/themes/registry";

export const runtime = "nodejs";

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB reichen für ein Logo
const MAX_DIM = 800; // längste Kante

/** Lädt (oder ersetzt) das Logo-Bild hoch: verarbeitet zu WebP, speichert im
 *  Storage und hinterlegt den Key in den SiteSettings. Alte Datei wird entfernt. */
export async function POST(req: Request) {
  const admin = await requireAdmin();

  const form = await req.formData();
  const file = form.get("logo");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Keine Datei." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Datei zu groß (max. 5 MB)." }, { status: 400 });
  }

  const input = Buffer.from(await file.arrayBuffer());
  let webp: Buffer;
  try {
    webp = await sharp(input, { failOn: "none" })
      .rotate()
      .resize({ width: MAX_DIM, height: MAX_DIM, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 90 }) // WebP behält Transparenz
      .toBuffer();
  } catch {
    return NextResponse.json({ error: "Kein gültiges Bild." }, { status: 400 });
  }

  const storage = getStorage();
  const key = `logos/${randomUUID()}.webp`;
  await storage.save(key, webp, "image/webp");

  const existing = await prisma.siteSettings.findUnique({
    where: { ownerId: admin.id },
    select: { logoImageKey: true },
  });

  await prisma.siteSettings.upsert({
    where: { ownerId: admin.id },
    update: { logoImageKey: key, logoType: "IMAGE" },
    create: { ownerId: admin.id, activeTheme: DEFAULT_THEME, logoImageKey: key, logoType: "IMAGE" },
  });

  // Alte Datei aufräumen (best effort).
  if (existing?.logoImageKey && existing.logoImageKey !== key) {
    await storage.delete(existing.logoImageKey).catch(() => {});
  }

  return NextResponse.json({ ok: true, key });
}

/** Entfernt das Logo-Bild und schaltet zurück auf das Schrift-Logo. */
export async function DELETE() {
  const admin = await requireAdmin();
  const existing = await prisma.siteSettings.findUnique({
    where: { ownerId: admin.id },
    select: { logoImageKey: true },
  });
  if (existing?.logoImageKey) {
    await getStorage().delete(existing.logoImageKey).catch(() => {});
  }
  await prisma.siteSettings.update({
    where: { ownerId: admin.id },
    data: { logoImageKey: null, logoType: "TEXT" },
  });
  return NextResponse.json({ ok: true });
}
