import { notFound, redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { getSiteOwnerId } from "@/lib/portfolio";
import { deriveSubpageTokens } from "@/lib/color";
import { PortfolioView } from "@/components/portfolio/PortfolioView";
import { SitePlaceholder } from "@/components/portfolio/SitePlaceholder";
import { getPlaceholderTokens } from "@/lib/start-page-data";

// DB-Zugriff pro Aufruf — nicht zur Build-Zeit prerendern.
export const dynamic = "force-dynamic";

/**
 * Öffentliche Portfolio-Seite unter `/[slug]` (z.B. /contact, /about). Auflösung
 * über den (pro Owner eindeutigen) Slug des Website-Owners; nur veröffentlichte
 * Seiten rendern, sonst 404 (Existenz wird nicht geleakt). Die als Startseite
 * markierte Seite lebt unter `/` und leitet hier dorthin um.
 */
export default async function PortfolioPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const ownerId = await getSiteOwnerId();
  if (!ownerId) notFound();

  const page = await prisma.page.findFirst({
    where: { ownerId, slug, isPublished: true, isEnabled: true },
    include: {
      owner: {
        select: {
          settings: {
            select: {
              activeTheme: true,
              portfolioEnabled: true,
              // Grundfarbe/Schrift der Startseite → Unterseiten „erben" sie.
              startBgColor: true,
              siteFont: true,
            },
          },
        },
      },
    },
  });
  if (!page) notFound();

  // Die Startseite wird unter der Root-Domain ausgeliefert — kein Duplikat.
  if (page.isHome) redirect("/");

  // Globaler Schalter: Ist die Website nicht freigeschaltet, wird der Inhalt
  // NICHT ausgeliefert — stattdessen eine neutrale Platzhalterseite.
  if (!page.owner.settings?.portfolioEnabled) {
    return <SitePlaceholder tokens={await getPlaceholderTokens()} />;
  }

  // Unterseiten leiten Grundfarbe & Schrift von der Startseite ab (kein separates
  // Unterseiten-Theme mehr).
  const tokenOverrides = deriveSubpageTokens({
    color: page.owner.settings.startBgColor,
    font: page.owner.settings.siteFont,
  });

  return (
    <PortfolioView
      blocks={page.blocks}
      theme={page.owner.settings.activeTheme}
      tokenOverrides={tokenOverrides}
    />
  );
}
