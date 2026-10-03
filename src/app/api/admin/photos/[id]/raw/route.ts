import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { getStorage } from "@/lib/storage";
import { requireAdmin } from "@/server/current-admin";

export const runtime = "nodejs";

const RAW_EXTS = [
  "cr2", "cr3", "nef", "nrw", "arw", "sr2", "srf", "dng", "raf", "orf",
  "rw2", "rwl", "pef", "srw", "raw", "3fr", "mef", "iiq", "x3f", "erf",
];
const MAX_RAW = 200 * 1024 * 1024; // 200 MB

function ext(name: string): string {
  const m = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : "";
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let admin;
  try {
    admin = await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Nicht authentifiziert." }, { status: 401 });
  }

  const photo = await prisma.photo.findFirst({
    where: { id, album: { ownerId: admin.id } },
    select: { id: true, storageKey: true, albumId: true, rawKey: true },
  });
  if (!photo) {
    return NextResponse.json({ error: "Foto nicht gefunden." }, { status: 404 });
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Keine Datei." }, { status: 400 });
  }
  const e = ext(file.name);
  if (!RAW_EXTS.includes(e)) {
    return NextResponse.json(
      { error: `Kein unterstütztes RAW-Format: .${e || "?"}` },
      { status: 415 },
    );
  }
  if (file.size > MAX_RAW) {
    return NextResponse.json({ error: "RAW-Datei zu groß." }, { status: 413 });
  }

  const storage = getStorage();
  const rawKey = `${photo.storageKey}_raw.${e}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await storage.save(rawKey, buffer, "application/octet-stream");

  // Alte RAW-Datei ersetzen, falls sich die Endung geändert hat.
  if (photo.rawKey && photo.rawKey !== rawKey) {
    await storage.delete(photo.rawKey);
  }

  await prisma.photo.update({
    where: { id },
    data: { rawKey, rawName: file.name, rawSizeBytes: file.size },
  });

  return NextResponse.json(
    { rawName: file.name, rawSizeBytes: file.size },
    { status: 201 },
  );
}
