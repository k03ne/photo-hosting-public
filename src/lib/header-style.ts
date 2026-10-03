/** Header-Darstellungsoptionen eines Albums (Werte wie im Prisma-Schema). */
export type HeaderStyle = {
  titlePos: string; // TOP | CENTER | BOTTOM
  align: string; // LEFT | CENTER | RIGHT
  font: string; // DISPLAY | SERIF | SANS
  button: string; // UNDER | BOTTOM | HIDDEN
};

/**
 * Tailwind-Klassen für die vertikale/horizontale Platzierung + Ausrichtung.
 * `items` (vertikal) und `justify` (horizontal) beziehen sich auf den flex-row
 * Header. Der nötige Rand kommt aus konstantem Padding am Container (nicht hier),
 * damit sich Hero und die kleine Backend-Vorschau proportional gleich verhalten.
 */
export function headerLayout(titlePos: string, align: string) {
  const items =
    titlePos === "TOP"
      ? "items-start"
      : titlePos === "BOTTOM"
        ? "items-end"
        : "items-center";
  const justify =
    align === "LEFT"
      ? "justify-start"
      : align === "RIGHT"
        ? "justify-end"
        : "justify-center";
  // Ausrichtung des Inhalts (Textblock): Text + Flex-Items.
  const content =
    align === "LEFT"
      ? "text-left items-start"
      : align === "RIGHT"
        ? "text-right items-end"
        : "text-center items-center";
  return { items, justify, content };
}

/**
 * Schrift-Preset des Album-Titels → Familie + Gewicht. Case/Tracking kommen aus
 * dem Titel selbst (durchgängiger Galerie-Look). Legacy „DISPLAY" = MODERN.
 * Werte: SANS | SERIF | MODERN | TIMELESS | BOLD | SUBTLE.
 */
export function headerFontClass(font: string): string {
  switch (font) {
    case "SANS":
      return "font-sans font-normal";
    case "SUBTLE":
      return "font-sans font-extralight";
    case "SERIF":
      return "font-serif font-normal";
    case "TIMELESS":
      return "font-serif font-light";
    case "BOLD":
      return "font-display font-bold";
    case "MODERN":
    default:
      return "font-display font-light";
  }
}

/** Auswahloptionen für die Album-Schrift (Wert, Label) — UI + Validierung. */
export const ALBUM_FONTS: [string, string][] = [
  ["SANS", "Sans"],
  ["SERIF", "Serif"],
  ["MODERN", "Modern"],
  ["TIMELESS", "Timeless"],
  ["BOLD", "Bold"],
  ["SUBTLE", "Subtle"],
];

/** Bild-Abstand der Galerie → Tailwind-Gap-Klasse. */
export function gridGapClass(spacing: string): string {
  return spacing === "LARGE" ? "gap-5 sm:gap-6" : "gap-2.5 sm:gap-3";
}

/**
 * Seitlicher Rand der Galerie („Schutzzone" am äußersten Rand). Volle Breite,
 * nur dieser Rand bleibt. Minimum für ALLE Abstufungen ist der „Large"-Abstand —
 * mit dem kleinen Regular-Abstand säßen die Bilder sonst zu nah am Rand.
 */
export function gridEdgeClass(_spacing: string): string {
  return "px-4 sm:px-5";
}
