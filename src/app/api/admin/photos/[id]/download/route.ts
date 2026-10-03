import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { getStorage } from "@/lib/storage";
import { requireAdmin } from "@/server/current-admin";

export const runtime = "nodejs";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const kind = new URL(req.url).searchParams.get("kind") ?? "original";

  let admin;
  try {
    admin = await requireAdmin();
  } catch {
    return new NextResponse("Nicht authentifiziert.", { status: 401 });
  }

  const photo = await prisma.photo.findFirst({
    where: { id, album: { ownerId: admin.id } },
    select: {
      originalKey: true,
      originalMime: true,
      originalName: true,
      rawKey: true,
      rawName: true,
    },
  });
  if (!photo) return new NextResponse("Nicht gefunden.", { status: 404 });

  const key = kind === "raw" ? photo.rawKey : photo.originalKey;
  const filename =
    kind === "raw"
      ? (photo.rawName ?? "raw")
      : (photo.originalName ?? "original");
  const mime =
    kind === "raw"
      ? "application/octet-stream"
      : (photo.originalMime ?? "application/octet-stream");

  if (!key) return new NextResponse("Datei nicht vorhanden.", { status: 404 });

  const obj = await getStorage().get(key);
  if (!obj) return new NextResponse("Datei nicht vorhanden.", { status: 404 });
  if (obj.kind === "redirect") return NextResponse.redirect(obj.url);

  return new NextResponse(obj.body as BodyInit, {
    headers: {
      "Content-Type": mime,
      "Content-Disposition": `attachment; filename="${filename.replace(/"/g, "")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
