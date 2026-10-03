import { notFound } from "next/navigation";
import type { Metadata } from "next";

import type { PhotoExif } from "@/components/share/Gallery";
import { PasswordGate } from "@/components/share/PasswordGate";
import { SharedGallery } from "@/components/share/SharedGallery";
import { hasAccess } from "@/lib/album-access";
import { prisma } from "@/lib/prisma";
import { NOINDEX } from "@/lib/seo";
import { albumByIdentifier } from "@/lib/share-lookup";
import { getGuestId } from "@/server/guest";

export const dynamic = "force-dynamic"; // Zugriff hängt vom Cookie ab

/**
 * Galerie-Links sind privat — sie gehören unabhängig von der SEO-Einstellung
 * der Website nie in einen Suchindex. Zusätzlich sperrt robots.txt `/a/`.
 */
export const metadata: Metadata = NOINDEX;

export default async function SharePage({
  params,
}: {
  params: Promise<{ shareToken: string }>;
}) {
  const { shareToken } = await params;

  // Nur veröffentlichte Alben; sonst 404 (keine Existenz preisgeben).
  // Auflösung per kryptischem Token oder (falls freigeschaltet) lesbarem Slug.
  const album = await prisma.album.findFirst({
    where: albumByIdentifier(shareToken),
    select: {
      id: true,
      title: true,
      description: true,
      layout: true,
      columns: true,
      gridSpacing: true,
      passwordHash: true,
      coverBlurPx: true,
      coverOverlay: true,
      showExif: true,
      headerTitlePos: true,
      headerAlign: true,
      headerFont: true,
      headerButton: true,
      headerTextColor: true,
      themeMode: true,
      bgColor: true,
      coverPhoto: { select: { storageKey: true, focusX: true, focusY: true } },
    },
  });
  if (!album) notFound();

  const coverFocus = {
    x: album.coverPhoto?.focusX ?? 50,
    y: album.coverPhoto?.focusY ?? 50,
  };

  // Passwortschutz: ohne gültiges Cookie -> Gate (Fotos werden nicht geladen).
  if (album.passwordHash && !(await hasAccess(album.id))) {
    return (
      <PasswordGate
        shareToken={shareToken}
        albumTitle={album.title}
        coverKey={album.coverPhoto?.storageKey ?? null}
        coverFocusX={coverFocus.x}
        coverFocusY={coverFocus.y}
      />
    );
  }

  const guestId = await getGuestId();

  const rows = await prisma.photo.findMany({
    where: { albumId: album.id, deletedAt: null },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      storageKey: true,
      mediaType: true,
      originalKey: true,
      originalName: true,
      caption: true,
      category: true,
      width: true,
      height: true,
      blurDataUrl: true,
      rawKey: true,
      originalSizeBytes: true,
      takenAt: true,
      exif: true,
      _count: {
        select: {
          reactions: true,
          comments: { where: { isHidden: false } },
        },
      },
      // Ob der aktuelle Gast bereits geliked hat (leer, wenn keine Gast-ID).
      reactions: {
        where: { guestId: guestId ?? "__none__" },
        select: { id: true },
      },
    },
  });

  const photos = rows.map((p) => ({
    id: p.id,
    storageKey: p.storageKey,
    mediaType: p.mediaType,
    videoKey: p.mediaType === "VIDEO" ? p.originalKey : null,
    caption: p.caption,
    category: p.category,
    width: p.width,
    height: p.height,
    blurDataUrl: p.blurDataUrl,
    likeCount: p._count.reactions,
    commentCount: p._count.comments,
    liked: p.reactions.length > 0,
    hasRaw: !!p.rawKey,
    originalName: p.originalName,
    sizeBytes: p.originalSizeBytes,
    takenAt: p.takenAt ? p.takenAt.toISOString() : null,
    exif: (p.exif as PhotoExif | null) ?? null,
  }));

  return (
    <SharedGallery
      title={album.title}
      description={album.description}
      layout={album.layout}
      columns={album.columns}
      gridSpacing={album.gridSpacing}
      coverKey={album.coverPhoto?.storageKey ?? null}
      coverBlurPx={album.coverBlurPx}
      coverOverlay={album.coverOverlay}
      coverFocusX={coverFocus.x}
      coverFocusY={coverFocus.y}
      photos={photos}
      shareToken={shareToken}
      isProtected={!!album.passwordHash}
      showExif={album.showExif}
      headerTitlePos={album.headerTitlePos}
      headerAlign={album.headerAlign}
      headerFont={album.headerFont}
      headerButton={album.headerButton}
      headerTextColor={album.headerTextColor}
      themeMode={album.themeMode}
      bgColor={album.bgColor}
    />
  );
}
