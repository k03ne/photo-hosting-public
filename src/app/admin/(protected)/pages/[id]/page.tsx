import { notFound } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { deriveSubpageTokens, SITE_DEFAULT_BG } from "@/lib/color";
import { requireAdmin } from "@/server/current-admin";
import { parseBlocks } from "@/themes/schema";
import { parseStartItems } from "@/lib/start-items";
import { parseOmniBrandMode, parseStartTheme } from "@/lib/start-theme";
import { DEMO_SOURCE, unsplashConfigured } from "@/lib/unsplash";
import { DEFAULT_THEME } from "@/themes/registry";
import { PageEditor } from "@/components/admin/PageEditor";
import { StartPageEditor } from "@/components/admin/StartPageEditor";

export default async function PageEditorRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const admin = await requireAdmin();

  const page = await prisma.page.findUnique({ where: { id } });
  if (!page || page.ownerId !== admin.id) notFound();

  // Die feste Startseite hat einen eigenen Inhalts-Editor (kein Block-Builder).
  if (page.kind === "HOME") {
    const [settings, albums, demoCount] = await Promise.all([
      prisma.siteSettings.findUnique({
        where: { ownerId: admin.id },
        select: {
          startItems: true,
          startShowFilter: true,
          startTheme: true,
          omniAutoSpeed: true,
          omniShowGridLines: true,
          omniAlwaysColor: true,
          omniSubtitle: true,
          omniGap: true,
          omniCellSize: true,
          omniBrandMode: true,
          omniHeadline: true,
          startBgColor: true,
          startBgMode: true,
        },
      }),
      prisma.album.findMany({
        where: { ownerId: admin.id },
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          title: true,
          category: true,
          passwordHash: true,
          photos: {
            where: { deletedAt: null, mediaType: "IMAGE" },
            orderBy: { sortOrder: "asc" },
            select: {
              storageKey: true,
              isFavorite: true,
              category: true,
              caption: true,
              width: true,
              height: true,
            },
          },
        },
      }),
      // Zähler für die Aufräum-Schalter im Demo-Panel; ohne Schlüssel entfällt
      // die Funktion samt Abfrage.
      unsplashConfigured()
        ? prisma.photo.count({
            where: { demoSource: DEMO_SOURCE, deletedAt: null, album: { ownerId: admin.id } },
          })
        : Promise.resolve(null),
    ]);

    const library = albums.map((a) => ({
      id: a.id,
      title: a.title,
      category: a.category,
      hasPassword: a.passwordHash !== null,
      photos: a.photos.map((p) => ({
        storageKey: p.storageKey,
        isFavorite: p.isFavorite,
        category: p.category,
        caption: p.caption,
        width: p.width,
        height: p.height,
      })),
    }));

    return (
      <StartPageEditor
        initial={{
          items: parseStartItems(settings?.startItems),
          showFilter: settings?.startShowFilter ?? true,
        }}
        appearance={{
          startTheme: parseStartTheme(settings?.startTheme),
          omniAutoSpeed: settings?.omniAutoSpeed ?? 0.08,
          omniShowGridLines: settings?.omniShowGridLines ?? true,
          omniAlwaysColor: settings?.omniAlwaysColor ?? false,
          omniSubtitle: settings?.omniSubtitle ?? "",
          omniGap: settings?.omniGap ?? 0.16,
          omniCellSize: settings?.omniCellSize ?? 3.4,
          omniBrandMode: parseOmniBrandMode(settings?.omniBrandMode),
          omniHeadline: settings?.omniHeadline ?? "",
        }}
        bg={{
          color: settings?.startBgColor ?? SITE_DEFAULT_BG,
          mode: settings?.startBgMode === "light" ? "light" : "dark",
        }}
        library={library}
        demo={demoCount === null ? undefined : { existing: demoCount }}
      />
    );
  }

  // Mediathek für die Bildauswahl + aktives Theme für die Live-Vorschau.
  const [albums, settings] = await Promise.all([
    prisma.album.findMany({
      where: { ownerId: admin.id },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        title: true,
        category: true, // Fallback-Kategorie fürs Portfolio
        photos: {
          // Wie in `resolvePageBlocks`: Blöcke zeigen nur Bilder — sonst wiche die
          // Live-Vorschau von der öffentlichen Seite ab.
          where: { deletedAt: null, mediaType: "IMAGE" },
          orderBy: { sortOrder: "asc" },
          select: {
            storageKey: true,
            blurDataUrl: true,
            caption: true,
            category: true,
            isFavorite: true,
            width: true,
            height: true,
          },
        },
      },
    }),
    prisma.siteSettings.findUnique({
      where: { ownerId: admin.id },
      // Grundfarbe & Schrift der Startseite: Unterseiten erben sie IMMER — die
      // Vorschau muss deshalb dieselben Tokens anlegen wie die öffentliche Seite.
      select: { activeTheme: true, startBgColor: true, siteFont: true },
    }),
  ]);

  return (
    <PageEditor
      pageId={page.id}
      title={page.title}
      slug={page.slug}
      isPublished={page.isPublished}
      isHome={page.isHome}
      kind={page.kind}
      theme={settings?.activeTheme ?? DEFAULT_THEME}
      tokenOverrides={deriveSubpageTokens({
        color: settings?.startBgColor,
        font: settings?.siteFont,
      })}
      initialBlocks={parseBlocks(page.blocks)}
      library={albums}
    />
  );
}
