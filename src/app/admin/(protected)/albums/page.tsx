import Link from "next/link";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/server/current-admin";

const layoutLabels: Record<string, string> = {
  MASONRY: "Masonry",
  GRID: "Raster",
  JUSTIFIED: "Ausgerichtet",
};

export default async function AlbumsPage() {
  const admin = await requireAdmin();
  const albums = await prisma.album.findMany({
    where: { ownerId: admin.id },
    include: {
      _count: { select: { photos: { where: { deletedAt: null } } } },
      coverPhoto: { select: { storageKey: true, blurDataUrl: true, focusX: true, focusY: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            Alben
          </h1>
          <p className="mt-1.5 text-muted">
            {albums.length} {albums.length === 1 ? "Album" : "Alben"}
          </p>
        </div>
        <Link href="/admin/albums/new" className="btn-accent">
          Neues Album
        </Link>
      </div>

      {albums.length === 0 ? (
        <div className="card grid place-items-center border-dashed p-16 text-center">
          <p className="text-sm text-muted">
            Noch keine Alben. Erstelle dein erstes Album.
          </p>
        </div>
      ) : (
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {albums.map((album) => (
            <li key={album.id}>
              <Link
                href={`/admin/albums/${album.id}`}
                className="card group block overflow-hidden transition hover:-translate-y-0.5 hover:shadow-lg"
              >
                <div
                  className="relative aspect-[3/2] bg-canvas"
                  style={
                    album.coverPhoto?.blurDataUrl
                      ? {
                          backgroundImage: `url(${album.coverPhoto.blurDataUrl})`,
                          backgroundSize: "cover",
                          backgroundPosition: "center",
                        }
                      : undefined
                  }
                >
                  {album.coverPhoto ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`/api/media/${album.coverPhoto.storageKey}.webp`}
                      alt=""
                      className="h-full w-full object-cover"
                      style={{
                        objectPosition: `${album.coverPhoto.focusX}% ${album.coverPhoto.focusY}%`,
                      }}
                    />
                  ) : (
                    <div className="grid h-full place-items-center text-3xl text-muted/40">
                      ▦
                    </div>
                  )}
                  <span
                    className={`chip absolute right-2 top-2 ${
                      album.isPublished
                        ? "bg-accent text-[hsl(var(--accent-ink))]"
                        : "bg-black/60 text-white"
                    }`}
                  >
                    {album.isPublished ? "Live" : "Entwurf"}
                  </span>
                </div>
                <div className="p-4">
                  <h2 className="font-medium">{album.title}</h2>
                  <p className="mt-1 text-sm text-muted">
                    {album._count.photos}{" "}
                    {album._count.photos === 1 ? "Bild" : "Bilder"} ·{" "}
                    {layoutLabels[album.layout]}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
