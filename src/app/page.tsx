import { StartThemeView } from "@/components/themes/StartThemeView";
import { SitePlaceholder } from "@/components/portfolio/SitePlaceholder";
import { getPlaceholderTokens, getStartPageData } from "@/lib/start-page-data";

// DB-Zugriff pro Aufruf — nicht zur Build-Zeit prerendern.
export const dynamic = "force-dynamic";

/**
 * Root-Domain `/`: zeigt fest das immersive WebGL-Startseiten-Theme (FilmStrip
 * oder OmniGrid), sofern die Website öffentlich aktiv ist (sonst Platzhalter).
 * Inhalt (kuratierte Bilder/Alben, Filter, Menü) kommt aus dem Startseite-Editor,
 * Farbe/Schrift aus den Grundeinstellungen, Wortmark/Socials aus dem Branding.
 */
export default async function Home() {
  const data = await getStartPageData();

  // Website deaktiviert (oder kein Owner) → nicht öffentlich sichtbar.
  if (!data || !data.enabled) return <SitePlaceholder tokens={await getPlaceholderTokens()} />;

  return <StartThemeView data={data} />;
}
