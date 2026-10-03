import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import sharp from "sharp";

import { prisma } from "@/lib/prisma";
import { getStorage } from "@/lib/storage";
import { requireAdmin } from "@/server/current-admin";
import { DEFAULT_THEME } from "@/themes/registry";

export const runtime = "nodejs";

const MAX_BYTES = 8 * 1024 * 1024;

/**
 * Favicon und Link-Vorschaubild (Open Graph). Beide sind Bild-Uploads mit
 * festem Ausgabeformat, deshalb eine Route mit `kind` statt zweier fast
 * gleicher — wie `api/admin/logo`, nur ohne dessen Logo-Sonderlogik.
 *
 * Bewusst feste Formate: das Favicon muss quadratisch und klein sein, das
 * OG-Bild 1200×630 — sonst schneiden Browser bzw. Messenger selbst zu.
 */
const KINDS = {
  favicon: {
    field: "faviconKey" as const,
    prefix: "branding/favicon",
    // PNG statt WebP: Safari und ältere Clients zeigen WebP-Favicons nicht.
    // `contain` + transparent, damit ein Logo nicht angeschnitten wird.
    async process(input: Buffer) {
      const data = await sharp(input, { failOn: "none" })
        .rotate()
        .resize(256, 256, {
          fit: "contain",
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .png()
        .toBuffer();
      return { data, ext: "png", mime: "image/png" };
    },
  },
  og: {
    field: "ogImageKey" as const,
    prefix: "branding/og",
    // JPEG: von allen Messengern/Netzwerken zuverlässig gelesen.
    async process(input: Buffer) {
      const data = await sharp(input, { failOn: "none" })
        .rotate()
        .resize(1200, 630, { fit: "cover", position: "attention" })
        .jpeg({ quality: 85 })
        .toBuffer();
      return { data, ext: "jpg", mime: "image/jpeg" };
    },
  },
};

type Kind = keyof typeof KINDS;
type Field = (typeof KINDS)[Kind]["field"];

function kindOf(req: Request): Kind | null {
  const raw = new URL(req.url).searchParams.get("kind");
  return raw === "favicon" || raw === "og" ? raw : null;
}

export async function POST(req: Request) {
  const admin = await requireAdmin();

  const kind = kindOf(req);
  if (!kind) return NextResponse.json({ error: "Unbekannter Bildtyp." }, { status: 400 });
  const spec = KINDS[kind];

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Keine Datei." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Datei zu groß (max. 8 MB)." }, { status: 400 });
  }

  let out: { data: Buffer; ext: string; mime: string };
  try {
    out = await spec.process(Buffer.from(await file.arrayBuffer()));
  } catch {
    return NextResponse.json({ error: "Kein gültiges Bild." }, { status: 400 });
  }

  const storage = getStorage();
  const key = `${spec.prefix}-${randomUUID()}.${out.ext}`;
  await storage.save(key, out.data, out.mime);

  const old = await currentKey(admin.id, spec.field);
  const patch = spec.field === "faviconKey" ? { faviconKey: key } : { ogImageKey: key };

  await prisma.siteSettings.upsert({
    where: { ownerId: admin.id },
    update: patch,
    create: { ownerId: admin.id, activeTheme: DEFAULT_THEME, ...patch },
  });

  // Alte Datei aufräumen (best effort).
  if (old && old !== key) await storage.delete(old).catch(() => {});

  // Favicon und Titelbild stecken in den Layout-Metadaten — ohne das hier
  // zeigt der Tab weiter das alte Symbol.
  revalidatePath("/", "layout");
  revalidatePath("/admin/settings");

  return NextResponse.json({ ok: true, key });
}

/** Aktuell hinterlegter Storage-Key des jeweiligen Feldes. */
async function currentKey(ownerId: string, field: Field): Promise<string | null> {
  const s = await prisma.siteSettings.findUnique({
    where: { ownerId },
    select: { faviconKey: true, ogImageKey: true },
  });
  return s?.[field] ?? null;
}

export async function DELETE(req: Request) {
  const admin = await requireAdmin();

  const kind = kindOf(req);
  if (!kind) return NextResponse.json({ error: "Unbekannter Bildtyp." }, { status: 400 });
  const spec = KINDS[kind];

  const old = await currentKey(admin.id, spec.field);
  if (old) await getStorage().delete(old).catch(() => {});

  await prisma.siteSettings.update({
    where: { ownerId: admin.id },
    data: spec.field === "faviconKey" ? { faviconKey: null } : { ogImageKey: null },
  });

  revalidatePath("/", "layout");
  revalidatePath("/admin/settings");

  return NextResponse.json({ ok: true });
}
