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

/** Dateiname ohne Endung, klein geschrieben — Grundlage fürs Zuordnen. */
function baseName(name: string): string {
  return name.replace(/\.[^.]+$/, "").toLowerCase();
}

/**
 * Ordnet eine hochgeladene RAW-Datei automatisch dem Foto mit gleichem
 * Basis-Dateinamen im Album zu (z.B. IMG_1234.CR2 -> IMG_1234.jpg).
 */
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

  const album = await prisma.album.findFirst({
    where: { id, ownerId: admin.id },
    select: { id: true },
  });
  if (!album) {
    return NextResponse.json({ error: "Album nicht gefunden." }, { status: 404 });
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

  // Passendes Foto per Basis-Dateiname finden; unbelegte RAW-Slots bevorzugen.
  const target = baseName(file.name);
  const candidates = await prisma.photo.findMany({
    where: { albumId: id, deletedAt: null },
    select: { id: true, storageKey: true, originalName: true, rawKey: true },
  });
  const match =
    candidates.find((p) => baseName(p.originalName) === target && !p.rawKey) ??
    candidates.find((p) => baseName(p.originalName) === target);

  if (!match) {
    return NextResponse.json(
      { matched: false, message: `Kein passendes Bild für „${file.name}“.` },
      { status: 200 },
    );
  }

  const storage = getStorage();
  const rawKey = `${match.storageKey}_raw.${e}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await storage.save(rawKey, buffer, "application/octet-stream");
  if (match.rawKey && match.rawKey !== rawKey) {
    await storage.delete(match.rawKey);
  }

  await prisma.photo.update({
    where: { id: match.id },
    data: { rawKey, rawName: file.name, rawSizeBytes: file.size },
  });

  return NextResponse.json(
    { matched: true, photoName: match.originalName },
    { status: 201 },
  );
}
