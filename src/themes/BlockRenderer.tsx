import type { ComponentType, CSSProperties, ReactNode } from "react";
import type { Block } from "./schema";
import type { BlockComponentProps } from "./types";
import { resolveTheme } from "./registry";

interface BlockRendererProps {
  /** Bereits validierte Blöcke (siehe parseBlocks). */
  blocks: Block[];
  /** Aktiver Theme-Identifier aus SiteSettings.activeTheme. */
  theme: string;
  /** Optionaler Footer — wird INNERHALB der Theme-Token gerendert, erbt also
   *  automatisch das aktive Theme-Styling. */
  footer?: ReactNode;
  /** Optionale Token-Overrides (z.B. von der Startseite abgeleitete Grundfarbe/
   *  Schrift). Werden ÜBER die Basis-Tokens des Themes gelegt. */
  tokenOverrides?: Record<string, string>;
}

/**
 * Nimmt die Inhaltsdaten und rendert sie mit den Komponenten des aktiven
 * Themes. Kennt selbst KEIN Styling — nur den Lookup Daten → Komponente.
 * Server Component: Themes können async/Server-seitig Daten (z.B. Album-Fotos
 * für einen Gallery-Block) laden.
 */
export function BlockRenderer({ blocks, theme, footer, tokenOverrides }: BlockRendererProps) {
  const active = resolveTheme(theme);

  // Schritt 3: Die Theme-Tokens werden als CSS-Variablen auf den Wrapper
  // injiziert. Sie überschreiben die globalen Design-Variablen (--canvas,
  // --ink, --font-display …) NUR in diesem Teilbaum. Dadurch reagieren alle
  // Tailwind-Utilities (bg-canvas, text-ink, font-display …) der Theme-
  // Komponenten automatisch — Theme-Wechsel = andere Variablenwerte, ohne die
  // Blockdaten anzufassen. Scoping auf den Wrapper statt <body>, damit das
  // Admin-/Galerie-Styling unberührt bleibt.
  // Basis-Tokens des Themes + optionale Overrides der Startseite (Grundfarbe/
  // Schrift). Die Overrides gewinnen, sodass die Unterseiten von der Startseite
  // „erben".
  const themeStyle = {
    ...(active.tokens ?? {}),
    ...(tokenOverrides ?? {}),
  } as CSSProperties;

  return (
    <div style={themeStyle} data-theme={active.name} className="bg-canvas font-sans text-ink">
      {blocks.map((block, index) => {
        // Lookup ist typ-sicher vollständig (BlockComponentMap deckt alle Typen
        // ab). Die Cast-Grenze hier ist nötig, weil `block` eine Union ist;
        // Vollständigkeit garantiert die Map zur Compile-Zeit.
        const Component = active.blocks[block.type] as ComponentType<
          BlockComponentProps<Block>
        >;

        if (!Component) {
          // Nur bei manuell/kaputt entferntem Theme-Block: in Dev sichtbar,
          // in Prod still überspringen (nie die ganze Seite crashen).
          if (process.env.NODE_ENV !== "production") {
            return (
              <div
                key={block.id}
                data-block-error
                style={{ padding: 16, outline: "1px dashed red" }}
              >
                Unbekannter Block-Typ „{block.type}" im Theme „{active.name}"
              </div>
            );
          }
          return null;
        }

        return <Component key={block.id} block={block} index={index} />;
      })}
      {footer}
    </div>
  );
}
