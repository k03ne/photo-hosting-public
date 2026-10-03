import { parseBlocks } from "@/themes/schema";
import { BlockRenderer } from "@/themes/BlockRenderer";
import { resolvePageBlocks, getSiteOwnerId } from "@/lib/portfolio";
import { getSiteNavigation, type SiteNavigation } from "@/lib/site-menu";
import { SmoothScroll } from "./SmoothScroll";
import { SiteMenu } from "./SiteMenu";

/**
 * Rendert eine öffentliche Portfolio-Seite mit dem aktiven Theme. Gemeinsam
 * genutzt von der Root-Startseite (`/`) und den weiteren Seiten (`/[slug]`).
 * Galerie-Blöcke werden vor dem Rendern zu Foto-Keys aufgelöst.
 *
 * Navigation ist das globale Burger-Menü — dasselbe wie auf der WebGL-
 * Startseite. Die frühere Pill-Leiste am unteren Rand gab es nur hier; die
 * Website hatte damit zwei verschiedene Navigationen.
 */
export async function PortfolioView({
  blocks,
  theme,
  tokenOverrides,
}: {
  /** Rohe `blocks` aus der DB (Page.blocks). */
  blocks: unknown;
  /** Aktiver Theme-Identifier aus SiteSettings.activeTheme. */
  theme: string;
  /** Von der Startseite abgeleitete Token-Overrides (Grundfarbe/Schrift). */
  tokenOverrides?: Record<string, string>;
}) {
  // Owner einmal auflösen und teilen — Blöcke und Navigation müssen zwingend
  // dieselbe Quelle haben, sonst zeigt die Seite Inhalte zweier Konten gemischt.
  const ownerId = await getSiteOwnerId();
  const [resolved, nav] = await Promise.all([
    resolvePageBlocks(parseBlocks(blocks), ownerId),
    loadNavigation(ownerId),
  ]);

  return (
    <main className="min-h-screen">
      <SmoothScroll />
      <BlockRenderer
        blocks={resolved}
        theme={theme}
        tokenOverrides={tokenOverrides}
        // Als `footer` übergeben, damit das Menü innerhalb des Theme-Wrappers
        // liegt und dessen CSS-Variablen erbt (es positioniert sich selbst fix).
        footer={<SiteMenu items={nav.items} socials={nav.socialsMode === "menu" ? nav.socials : []} />}
      />
    </main>
  );
}

/** Navigation der Unterseiten — leer, wenn das Menü global abgeschaltet ist. */
const EMPTY_NAV: SiteNavigation = { enabled: false, items: [], socials: [], socialsMode: "off" };

async function loadNavigation(ownerId: string | null): Promise<SiteNavigation> {
  if (!ownerId) return EMPTY_NAV;
  const nav = await getSiteNavigation(ownerId);
  return nav.enabled ? nav : EMPTY_NAV;
}
