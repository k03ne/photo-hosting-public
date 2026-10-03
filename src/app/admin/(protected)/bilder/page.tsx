import Link from "next/link";
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/server/current-admin";
import { LibraryUploader } from "@/components/admin/LibraryUploader";
import { MediaLibrary, type MediaItem } from "@/components/admin/MediaLibrary";
import { DemoPhotosPanel } from "@/components/admin/DemoPhotosPanel";
import { DEMO_SOURCE, unsplashConfigured } from "@/lib/unsplash";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 60;

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function MediaLibraryPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const admin = await requireAdmin();
  const sp = await searchParams;

  const albumFilter = one(sp.album);
  const categoryFilter = one(sp.category);
  const visFilter = one(sp.vis); // "" | "public" | "private"
  const page = Math.max(1, Number(one(sp.page)) || 1);

  // Filter zusammenbauen (Owner-Scope über die Album-Relation).
  const where: Prisma.PhotoWhereInput = { album: { ownerId: admin.id }, deletedAt: null };
  if (albumFilter) where.albumId = albumFilter;
  if (visFilter === "public") where.isPublic = true;
  if (visFilter === "private") where.isPublic = false;
  if (categoryFilter) {
    // Effektive Portfolio-Kategorie: Foto-Override ODER (leer → Album-Kategorie).
    where.OR = [
      { portfolioCategory: categoryFilter },
      { portfolioCategory: null, album: { ownerId: admin.id, category: categoryFilter } },
    ];
  }

  const [total, photos, albums, photoCats, albumCats] = await Promise.all([
    prisma.photo.count({ where }),
    prisma.photo.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        storageKey: true,
        blurDataUrl: true,
        portfolioCategory: true,
        isPublic: true,
        demoSource: true,
        album: { select: { title: true, category: true } },
      },
    }),
    prisma.album.findMany({
      where: { ownerId: admin.id },
      orderBy: { title: "asc" },
      select: { id: true, title: true },
    }),
    prisma.photo.findMany({
      where: { album: { ownerId: admin.id }, deletedAt: null, portfolioCategory: { not: null } },
      select: { portfolioCategory: true },
      distinct: ["portfolioCategory"],
    }),
    prisma.album.findMany({
      where: { ownerId: admin.id, category: { not: null } },
      select: { category: true },
      distinct: ["category"],
    }),
  ]);

  // Demo-Bilder: Panel nur zeigen, wenn ein Unsplash-Schlüssel hinterlegt ist.
  const demoCount = await prisma.photo.count({
    where: { demoSource: DEMO_SOURCE, deletedAt: null, album: { ownerId: admin.id } },
  });

  const categories = [
    ...new Set(
      [
        ...photoCats.map((x) => x.portfolioCategory),
        ...albumCats.map((x) => x.category),
      ].filter((c): c is string => Boolean(c)),
    ),
  ].sort((a, b) => a.localeCompare(b, "de"));

  const items: MediaItem[] = photos.map((p) => ({
    id: p.id,
    storageKey: p.storageKey,
    blurDataUrl: p.blurDataUrl,
    albumTitle: p.album.title,
    // Effektive Portfolio-Kategorie: Bild-Override ODER Album-Genre.
    category: p.portfolioCategory ?? p.album.category ?? null,
    // Ob dieses Bild ein eigenes Override hat (für „Zurücksetzen auf Album").
    hasOwnCategory: p.portfolioCategory != null,
    isPublic: p.isPublic,
    isDemo: p.demoSource != null,
  }));

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageHref = (n: number) => {
    const q = new URLSearchParams();
    if (albumFilter) q.set("album", albumFilter);
    if (categoryFilter) q.set("category", categoryFilter);
    if (visFilter) q.set("vis", visFilter);
    if (n > 1) q.set("page", String(n));
    const s = q.toString();
    return s ? `/admin/bilder?${s}` : "/admin/bilder";
  };

  const hasFilter = Boolean(albumFilter || categoryFilter || visFilter);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Bilder</h1>
        <p className="mt-1.5 text-muted">
          Alle {total} Bilder deiner Alben. Als „Öffentlich" markierte stehen den Seiten-Blöcken
          (Hero, Portfolio) zur Verfügung.
        </p>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        {/* Filter — links, klebt beim Scrollen */}
        <aside className="shrink-0 lg:sticky lg:top-16 lg:w-60">
          <form method="get" className="card space-y-3 p-4">
            <p className="text-sm font-medium">Filter</p>
            <label className="block text-sm">
              <span className="mb-1 block text-muted">Album</span>
              <select name="album" defaultValue={albumFilter} className="input w-full">
                <option value="">Alle Alben</option>
                {albums.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-muted">Portfolio-Kategorie</span>
              <select name="category" defaultValue={categoryFilter} className="input w-full">
                <option value="">Alle Kategorien</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-muted">Sichtbarkeit</span>
              <select name="vis" defaultValue={visFilter} className="input w-full">
                <option value="">Alle</option>
                <option value="public">Öffentlich</option>
                <option value="private">Privat</option>
              </select>
            </label>
            <div className="flex items-center gap-2 pt-1">
              <button type="submit" className="btn-accent flex-1">
                Anwenden
              </button>
              {hasFilter && (
                <Link href="/admin/bilder" className="btn-ghost">
                  Zurücksetzen
                </Link>
              )}
            </div>
          </form>
        </aside>

        {/* Raster — rechts */}
        <div className="min-w-0 flex-1 space-y-6">
          <LibraryUploader albums={albums} />
          {unsplashConfigured() && <DemoPhotosPanel existing={demoCount} />}
          <MediaLibrary photos={items} categories={categories} />

          {/* Pagination */}
          {pageCount > 1 && (
            <div className="flex items-center justify-center gap-4 text-sm">
              {page > 1 ? (
                <Link href={pageHref(page - 1)} className="btn-ghost">
                  ← Zurück
                </Link>
              ) : (
                <span className="btn-ghost opacity-40">← Zurück</span>
              )}
              <span className="text-muted">
                Seite {page} / {pageCount}
              </span>
              {page < pageCount ? (
                <Link href={pageHref(page + 1)} className="btn-ghost">
                  Weiter →
                </Link>
              ) : (
                <span className="btn-ghost opacity-40">Weiter →</span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
