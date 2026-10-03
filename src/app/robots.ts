import type { MetadataRoute } from "next";

import { getSeoSettings, siteBaseUrl } from "@/lib/seo";

/**
 * robots.txt — der zweite Hebel neben dem `noindex` im Dokument. Ist die
 * Website nicht freigegeben oder der Schalter „von Suchmaschinen finden lassen"
 * aus, wird alles gesperrt.
 *
 * Auch im Normalfall bleiben Galerie-Links (`/a/…`), Admin und API außen vor:
 * Galerien sind privat, alles andere hat im Index nichts verloren.
 */
export const dynamic = "force-dynamic"; // hängt an den Einstellungen, nicht am Build

export default async function robots(): Promise<MetadataRoute.Robots> {
  const seo = await getSeoSettings();
  const base = siteBaseUrl();

  if (!seo.indexable) {
    return { rules: [{ userAgent: "*", disallow: "/" }] };
  }

  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/a/", "/api/"] }],
    ...(base ? { sitemap: new URL("/sitemap.xml", base).toString() } : {}),
  };
}
