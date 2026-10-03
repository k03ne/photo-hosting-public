import type { BlockComponentProps } from "../../types";
import type { BlockOf } from "../../schema";
import { PortfolioGridView } from "@/components/portfolio/PortfolioGridView";

/**
 * Signatur-Block des „immersive"-Themes: die vollflächige Bilderwand. Dichtes,
 * randloses Raster mit Hover-Captions, Klick-zum-Vergrößern (Lightbox) und einem
 * fixen Kategorie-Menü zum Springen — inspiriert von immersiven Fotograf:innen-
 * Startseiten. Delegiert an die gemeinsame View im `immersive`-Modus.
 */
export function PortfolioGrid({ block }: BlockComponentProps<BlockOf<"portfolioGrid">>) {
  const { title, items, columns, layout, selection, randomCount, showCategories } = block.data;
  return (
    <PortfolioGridView
      title={title}
      items={items}
      columns={columns}
      layout={layout}
      selection={selection}
      randomCount={randomCount}
      showCategories={showCategories}
      immersive
    />
  );
}
