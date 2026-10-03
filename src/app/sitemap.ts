import type { MetadataRoute } from "next";

import { getSiteOwnerId } from "@/lib/portfolio";
import { prisma } from "@/lib/prisma";
import { getSeoSettings, siteBaseUrl } from "@/lib/seo";

/**
 * sitemap.xml aus den veröffentlichten Seiten — dieselbe Auswahl wie das Menü,
 * nur mit absoluten URLs. Galerie-Links stehen bewusst NICHT drin: sie sind
 * privat und werden per Link geteilt, nicht gefunden.
 *
 * Ohne `NEXT_PUBLIC_APP_URL` fehlt die Basis für absolute Adressen — dann
 * bleibt die Sitemap leer, statt falsche URLs zu melden.
 */
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteBaseUrl();
  const seo = await getSeoSettings();
  if (!base || !seo.indexable) return [];

  const ownerId = await getSiteOwnerId();
  if (!ownerId) return [];

  const pages = await prisma.page.findMany({
    where: { ownerId, isPublished: true, isEnabled: true },
    select: { slug: true, isHome: true, updatedAt: true },
  });

  return pages.map((p) => ({
    url: new URL(p.isHome ? "/" : `/${p.slug}`, base).toString(),
    lastModified: p.updatedAt,
    priority: p.isHome ? 1 : 0.7,
  }));
}
