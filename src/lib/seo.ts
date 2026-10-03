import "server-only";

import type { Metadata } from "next";

import { formatDisplayName } from "@/lib/branding";
import { getSiteOwnerId } from "@/lib/portfolio";
import { prisma } from "@/lib/prisma";

/**
 * Metadaten der öffentlichen Website: Titel, Beschreibung, Favicon,
 * Link-Vorschau und die Freigabe für Suchmaschinen.
 *
 * Alles kommt aus `SiteSettings` des Website-Inhabers (`getSiteOwnerId`) — die
 * öffentlichen Routen haben keine Session. Fehlt der Datensatz oder die
 * Datenbank, greifen die Fallbacks unten; Metadaten dürfen nie die Seite
 * mitreißen.
 */

/** Was ohne eigene Angaben im Tab steht. */
const FALLBACK_TITLE = "Fotografie";

export type SeoSettings = {
  title: string;
  description: string | null;
  faviconKey: string | null;
  ogImageKey: string | null;
  /** Aufnahme in Suchmaschinen erlaubt UND Website überhaupt öffentlich. */
  indexable: boolean;
};

export async function getSeoSettings(): Promise<SeoSettings> {
  const fallback: SeoSettings = {
    title: FALLBACK_TITLE,
    description: null,
    faviconKey: null,
    ogImageKey: null,
    indexable: false,
  };

  try {
    const ownerId = await getSiteOwnerId();
    if (!ownerId) return fallback;

    const s = await prisma.siteSettings.findUnique({
      where: { ownerId },
      select: {
        seoTitle: true,
        seoDescription: true,
        seoIndexable: true,
        faviconKey: true,
        ogImageKey: true,
        portfolioEnabled: true,
        ownerName: true,
        nameDisplayStyle: true,
        startTitle: true,
      },
    });
    if (!s) return fallback;

    const title =
      s.seoTitle?.trim() ||
      s.startTitle?.trim() ||
      formatDisplayName(s.ownerName, s.nameDisplayStyle) ||
      FALLBACK_TITLE;

    return {
      title,
      description: s.seoDescription?.trim() || null,
      faviconKey: s.faviconKey,
      ogImageKey: s.ogImageKey,
      // Eine nicht freigeschaltete Website zeigt nur den Platzhalter — die
      // gehört unter keinen Umständen in den Index.
      indexable: s.seoIndexable && s.portfolioEnabled,
    };
  } catch {
    return fallback;
  }
}

/** Basis-URL für absolute Adressen (Link-Vorschau, robots.txt, sitemap.xml). */
export function siteBaseUrl(): URL | null {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!raw) return null;
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

/** `Metadata` für das Root-Layout — gilt damit für die ganze Anwendung. */
export async function buildSiteMetadata(): Promise<Metadata> {
  const seo = await getSeoSettings();
  const base = siteBaseUrl();
  const images = seo.ogImageKey ? [{ url: `/api/media/${seo.ogImageKey}` }] : undefined;

  return {
    ...(base ? { metadataBase: base } : {}),
    title: seo.title,
    description: seo.description ?? undefined,
    // Ohne eigenes Favicon bleibt es beim Browser-Standard (kein 404-Icon).
    ...(seo.faviconKey ? { icons: { icon: `/api/media/${seo.faviconKey}` } } : {}),
    openGraph: {
      type: "website",
      siteName: seo.title,
      title: seo.title,
      description: seo.description ?? undefined,
      images,
    },
    twitter: {
      card: images ? "summary_large_image" : "summary",
      title: seo.title,
      description: seo.description ?? undefined,
      images,
    },
    // Der Schalter im Backend wirkt hier: `noindex` für die GANZE Anwendung.
    // Der Admin-Bereich und die Galerie-Links setzen zusätzlich ihr eigenes
    // `noindex` — sie dürfen auch bei freigegebener Website nie im Index landen.
    robots: seo.indexable ? undefined : { index: false, follow: false },
  };
}

/** Für Bereiche, die grundsätzlich nicht in den Index gehören. */
export const NOINDEX: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};
