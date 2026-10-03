import ReelThemeLoader from "@/components/themes/ReelThemeLoader";
import { OmniGridThemeLoader } from "@/components/themes/OmniGridTheme";
import type { StartPageData } from "@/lib/start-page-data";
import type { GridImage } from "@/store/useGridStore";

/**
 * Rendert das konfigurierte Startseiten-Theme (FilmStrip/Reel oder OmniGrid) aus
 * den aufbereiteten `StartPageData`. GEMEINSAM genutzt von der öffentlichen
 * Root-Seite (`/`) und der Admin-Vorschau (`/admin/start-preview`), damit die
 * Vorschau IMMER exakt das öffentliche Theme zeigt (früher hart FilmStrip → die
 * OmniGrid-Startseite ließ sich nicht korrekt prüfen). Der „öffentlich"-Schalter
 * wird bewusst nicht hier ausgewertet — das entscheidet der jeweilige Aufrufer.
 */
export function StartThemeView({ data }: { data: StartPageData }) {
  // OmniGrid: unendliches, zieh-/scrollbares Bildraster (kuratierte Bilder → GridImage).
  if (data.startTheme === "omnigrid") {
    const images: GridImage[] = data.items
      .filter((it): it is typeof it & { src: string; full: string } => !!it.src && !!it.full)
      .map((it) => ({
        id: it.id,
        src: it.src,
        full: it.full,
        aspect: it.aspect ?? 1,
        subtitle: it.title || undefined,
        category: it.category || undefined,
      }));

    // Zwei Auftritte der Marke:
    //  „swap"  — die Wortmarke steht mittig und weicht bei Bewegung dem Logo
    //            oben links; im Leerlauf tauschen sie zurück.
    //  „fixed" — das Logo klebt oben links, die Mitte gehört freiem Text.
    // In beiden Fällen blendet die Mitte bei Bewegung aus (heroBehavior "fade").
    const swap = data.omni.brandMode === "swap";

    return (
      <OmniGridThemeLoader
        images={images}
        themeMode={data.background.mode}
        siteName={data.brand.name}
        logoSrc={data.brand.logoSrc ?? undefined}
        // Im Swap-Modus gehört die Marke oben links zum Hero-Wechsel; im
        // Fixed-Modus steht sie unabhängig davon dauerhaft da.
        brandFollowsHero={swap}
        heroText={(swap ? data.brand.name : data.omni.headline) ?? undefined}
        heroSubtitle={data.omni.subtitle ?? undefined}
        heroBehavior="fade"
        autoScrollOnIdle
        autoScrollSpeed={data.omni.autoScrollSpeed}
        gapSize={data.omni.gap}
        cellSize={data.omni.cellSize}
        showGridLines={data.omni.showGridLines}
        alwaysColor={data.omni.alwaysColor}
        navItems={data.menu.length ? data.menu : undefined}
        // „corner" = wie bisher unten rechts, „menu" = als Gruppe im Burger.
        socials={data.socialsMode === "corner" && data.social.length ? data.social : undefined}
        menuSocials={data.socialsMode === "menu" ? data.social : undefined}
        categories={data.categories}
        showFilter={data.showFilter}
      />
    );
  }

  // Standard: FilmStrip/Reel-Theme.
  return (
    <ReelThemeLoader
      title={data.title}
      items={data.items.length ? data.items : undefined}
      categories={data.categories.length ? data.categories : undefined}
      // Platzierung wie beim OmniGrid: Ecke, Drawer oder gar nicht.
      social={data.socialsMode === "corner" ? data.social : []}
      menuSocial={data.socialsMode === "menu" ? data.social : []}
      menu={data.menu}
      background={data.background}
      font={data.font}
      showFilter={data.showFilter}
    />
  );
}
