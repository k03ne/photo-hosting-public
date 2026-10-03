import Link from "next/link";
import { notFound } from "next/navigation";

import { AlbumForm } from "@/components/admin/AlbumForm";
import { Tabs } from "@/components/admin/Tabs";
import { AlbumPasswordForm } from "@/components/admin/AlbumPasswordForm";
import { CommentModeration } from "@/components/admin/CommentModeration";
import { DeleteAlbumButton } from "@/components/admin/DeleteAlbumButton";
import { FavoritesByGuest } from "@/components/admin/FavoritesByGuest";
import type { PhotoExif } from "@/components/share/Gallery";
import { PhotoManager } from "@/components/admin/PhotoManager";
import { PhotoUploader } from "@/components/admin/PhotoUploader";
import { DemoPhotosPanel } from "@/components/admin/DemoPhotosPanel";
import { DEMO_SOURCE, unsplashConfigured } from "@/lib/unsplash";
import { ShareSettingsForm } from "@/components/admin/ShareSettingsForm";
import { ShareTokenReset } from "@/components/admin/ShareTokenReset";
import { mediaUrl } from "@/lib/media";
import { prisma } from "@/lib/prisma";
import { isLegacyShareToken } from "@/lib/share-token";
import { updateAlbum, updateShareSettings } from "@/server/actions/albums";
import { requireAdmin } from "@/server/current-admin";

export default async function EditAlbumPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const admin = await requireAdmin();

  const album = await prisma.album.findFirst({
    where: { id, ownerId: admin.id },
    include: {
      _count: { select: { photos: { where: { deletedAt: null } } } },
      coverPhoto: { select: { storageKey: true, focusX: true, focusY: true } },
      photos: {
        where: { deletedAt: null },
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          storageKey: true,
          mediaType: true,
          caption: true,
          category: true,
          portfolioCategory: true,
          isFavorite: true,
          blurDataUrl: true,
          originalName: true,
          originalSizeBytes: true,
          rawName: true,
          rawSizeBytes: true,
          width: true,
          height: true,
          takenAt: true,
          exif: true,
        },
      },
    },
  });
  if (!album) notFound();

  // Demo-Bilder-Panel nur bei hinterlegtem Unsplash-Schlüssel; die Anzahl gilt
  // kontoweit, weil die Aufräum-Schalter ebenfalls kontoweit wirken.
  const demo = unsplashConfigured()
    ? {
        count: await prisma.photo.count({
          where: { demoSource: DEMO_SOURCE, deletedAt: null, album: { ownerId: admin.id } },
        }),
      }
    : null;

  const comments = await prisma.comment.findMany({
    where: { photo: { albumId: id } },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      body: true,
      guestName: true,
      isHidden: true,
      createdAt: true,
      photo: { select: { storageKey: true } },
    },
  });

  // Favoriten pro (anonymem) Gast — Name aus dessen Kommentaren abgeleitet.
  const reactions = await prisma.reaction.findMany({
    where: { photo: { albumId: id }, type: "HEART" },
    orderBy: { createdAt: "asc" },
    select: {
      guestId: true,
      photo: { select: { id: true, storageKey: true, originalName: true } },
    },
  });
  const nameRows = await prisma.comment.findMany({
    where: { photo: { albumId: id }, guestName: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { guestId: true, guestName: true },
  });
  const nameByGuest = new Map<string, string>();
  for (const r of nameRows) {
    // orderBy desc -> erster Treffer ist der jüngste Name; nicht überschreiben.
    if (r.guestName && !nameByGuest.has(r.guestId)) {
      nameByGuest.set(r.guestId, r.guestName);
    }
  }
  const favByGuest = new Map<string, typeof reactions>();
  for (const r of reactions) {
    const list = favByGuest.get(r.guestId) ?? [];
    list.push(r);
    favByGuest.set(r.guestId, list);
  }
  const guestFavorites = Array.from(favByGuest.entries())
    .map(([guestId, rows]) => ({
      guestId,
      name: nameByGuest.get(guestId) ?? `Gast · ${guestId.slice(0, 6)}`,
      photos: rows.map((r) => r.photo),
    }))
    .sort((a, b) => b.photos.length - a.photos.length);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  // Nur eine Freigabe-Quelle anzeigen: ist die lesbare Klartext-URL aktiv, gilt
  // der Slug als Link; sonst der kryptische Token. (Der Token bleibt technisch
  // weiterhin gültig — er wird nur nicht mehr angezeigt.)
  const usesReadableUrl = album.readableUrl;
  const shareUrl = `${appUrl}/a/${
    usesReadableUrl ? album.slug : album.shareToken
  }`;

  const isEmpty = album._count.photos === 0;

  // Kopfbereich (in beiden Layouts identisch).
  const header = (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <Link
          href="/admin/albums"
          className="text-xs uppercase tracking-[0.15em] text-muted transition hover:text-ink"
        >
          ← Alben
        </Link>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
            {album.title}
          </h1>
          <span
            className={`chip ${
              album.isPublished
                ? "bg-ink text-canvas"
                : "border border-line text-muted"
            }`}
          >
            {album.isPublished ? "Live" : "Entwurf"}
          </span>
        </div>
        <p className="mt-1.5 text-sm text-muted">
          {album._count.photos}{" "}
          {album._count.photos === 1 ? "Bild" : "Bilder"} · {album.slug}
        </p>
      </div>

      {album.isPublished && (
        <a
          href={shareUrl}
          target="_blank"
          rel="noreferrer"
          className="btn-ghost self-start sm:self-auto"
        >
          Galerie ansehen ↗
        </a>
      )}
    </div>
  );

  const albumFormEl = (
    <AlbumForm
      action={updateAlbum}
      submitLabel="Änderungen speichern"
      album={{
        id: album.id,
        title: album.title,
        description: album.description,
        category: album.category,
        layout: album.layout,
        columns: album.columns,
        gridSpacing: album.gridSpacing,
        coverUrl: album.coverPhoto
          ? `/api/media/${album.coverPhoto.storageKey}.webp`
          : null,
        coverBlurPx: album.coverBlurPx,
        coverOverlay: album.coverOverlay,
        coverFocusX: album.coverPhoto?.focusX ?? 50,
        coverFocusY: album.coverPhoto?.focusY ?? 50,
        showExif: album.showExif,
        headerTitlePos: album.headerTitlePos,
        headerAlign: album.headerAlign,
        headerFont: album.headerFont,
        headerButton: album.headerButton,
        headerTextColor: album.headerTextColor,
        themeMode: album.themeMode,
        bgColor: album.bgColor,
        // Seitenverhältnis mitgeben, damit die Vorschau Masonry/Ausgerichtet
        // genauso staffelt wie die echte Galerie.
        previewPhotos: album.photos.map((p) => ({
          url: mediaUrl(p.storageKey, "thumb"),
          ratio: p.height > 0 ? p.width / p.height : 1,
        })),
      }}
    />
  );

  const shareSection = (
    <section className="card space-y-4 p-5">
      <h2 className="text-sm font-medium text-muted">Freigabe</h2>

      <div className="space-y-1.5">
        <p className="text-[11px] uppercase tracking-[0.15em] text-muted">
          {usesReadableUrl ? "Freigabelink" : "Kryptischer Link"}
        </p>
        <code className="block break-all rounded-lg border bg-canvas px-3 py-2 text-xs">
          {shareUrl}
        </code>
        {!album.isPublished && (
          <p className="text-xs text-amber-600">
            Entwurf — der Link liefert 404, bis das Album veröffentlicht ist.
          </p>
        )}
      </div>

      <div className="border-t pt-4">
        <ShareSettingsForm
          action={updateShareSettings}
          albumId={album.id}
          appUrl={appUrl}
          slug={album.slug}
          isPublished={album.isPublished}
          readableUrl={album.readableUrl}
        />
      </div>

      <div className="border-t pt-4">
        <ShareTokenReset
          albumId={album.id}
          isLegacyToken={isLegacyShareToken(album.shareToken)}
        />
      </div>

      <div className="border-t pt-4">
        <AlbumPasswordForm albumId={album.id} hasPassword={!!album.passwordHash} />
      </div>
    </section>
  );

  const dangerSection = (
    <section className="card space-y-3 p-5">
      <h2 className="text-sm font-medium text-red-500">Gefahrenzone</h2>
      <DeleteAlbumButton albumId={album.id} albumTitle={album.title} />
      <p className="text-xs text-muted">
        Löscht das Album samt aller Bilder, Kommentare und Bewertungen.
      </p>
    </section>
  );

  // Leeres Album → fokussierter Einrichtungs-Assistent (einspaltig, Upload zuerst)
  // statt der vollen Zwei-Spalten-Verwaltung. Vermeidet das „springende" Upload-
  // Feld und führt Schritt für Schritt bis zur Freigabe.
  if (isEmpty) {
    return (
      <div className="space-y-8">
        {header}

        <div className="mx-auto max-w-3xl space-y-6">
          <section className="card space-y-6 p-6 sm:p-8">
            <ol className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[11px] uppercase tracking-[0.15em]">
              <li className="flex items-center gap-1.5 text-muted">
                <span className="grid h-5 w-5 place-items-center rounded-full bg-ink text-[10px] text-canvas">
                  ✓
                </span>
                Album erstellt
              </li>
              <span className="text-muted/40">→</span>
              <li className="flex items-center gap-1.5 font-medium text-ink">
                <span className="grid h-5 w-5 place-items-center rounded-full border border-ink text-[10px]">
                  2
                </span>
                Bilder hochladen
              </li>
              <span className="text-muted/40">→</span>
              <li className="flex items-center gap-1.5 text-muted">
                <span className="grid h-5 w-5 place-items-center rounded-full border border-line text-[10px]">
                  3
                </span>
                Teilen
              </li>
            </ol>

            <div className="space-y-2 text-center">
              <h2 className="font-display text-xl font-semibold tracking-tight">
                Lade die ersten Bilder hoch
              </h2>
              <p className="mx-auto max-w-md text-sm text-muted">
                Sobald Bilder vorhanden sind, kannst du Cover, Reihenfolge,
                Kategorien und die Freigabe verwalten.
              </p>
            </div>

            <PhotoUploader albumId={album.id} existingPhotos={[]} />
          </section>

          {/* Gerade im leeren Album am nützlichsten: Layout und Freigabe lassen
              sich erst mit Bildern beurteilen. */}
          {demo && <DemoPhotosPanel albumId={album.id} existing={demo.count} />}

          {/* Bewusst KEINE Cover-/Layout-/Farb-/Freigabe-Optionen hier: sie hängen
              von den Bildern ab und erscheinen erst danach in den Tabs. Nur die
              Möglichkeit, ein versehentlich angelegtes Album wieder zu entfernen. */}
          {dangerSection}
        </div>
      </div>
    );
  }

  // Bilder-Tab: Upload + Verwaltung, darunter Favoriten & Kommentare.
  const bilderTab = (
    <div className="space-y-6">
      <section className="card space-y-4 p-5">
        <h2 className="text-sm font-medium text-muted">Bilder</h2>
        <PhotoUploader
          albumId={album.id}
          existingPhotos={album.photos.map((p) => ({
            id: p.id,
            name: p.originalName,
          }))}
        />
        {demo && <DemoPhotosPanel albumId={album.id} existing={demo.count} />}
        <PhotoManager
          albumId={album.id}
          coverPhotoId={album.coverPhotoId}
          photos={album.photos.map((p) => ({
            ...p,
            takenAt: p.takenAt ? p.takenAt.toISOString() : null,
            exif: (p.exif as PhotoExif | null) ?? null,
          }))}
        />
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <section className="card space-y-4 p-5">
          <h2 className="text-sm font-medium text-muted">
            Favoriten pro Person ({guestFavorites.length})
          </h2>
          <FavoritesByGuest guests={guestFavorites} />
        </section>

        <section className="card space-y-3 p-5">
          <h2 className="text-sm font-medium text-muted">
            Kommentare ({comments.length})
          </h2>
          <CommentModeration comments={comments} />
        </section>
      </div>
    </div>
  );

  // Einstellungen-Tab: zweispaltiger Live-Preview-Editor, darunter die Gefahrenzone.
  const einstellungenTab = (
    <div className="space-y-6">
      {albumFormEl}
      {dangerSection}
    </div>
  );

  return (
    <div className="space-y-8">
      {header}

      <Tabs
        ariaLabel="Album-Bereiche"
        initial="bilder"
        tabs={[
          { id: "bilder", label: "Bilder", badge: album._count.photos, content: bilderTab },
          { id: "einstellungen", label: "Einstellungen", content: einstellungenTab },
          { id: "freigabe", label: "Freigabe", content: shareSection },
        ]}
      />
    </div>
  );
}
