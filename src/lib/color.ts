/**
 * Farb-Helfer für die Token-Ableitung. Wandelt eine Hex-Farbe in HSL-Bestandteile
 * und entscheidet per WCAG-Luminanz, ob heller oder dunkler Vordergrund besser
 * kontrastiert (Grenze ≈ 0.179, NICHT 0.5 — mittelhelle Farben bekämen sonst
 * fälschlich weißen, unlesbaren Text).
 */
export function hexToHsl(hex: string | null | undefined):
  | { h: number; s: number; l: number; dark: boolean }
  | null {
  if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return null;
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let s = 0;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }

  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const lum = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);

  return {
    h: Math.round(h),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
    dark: lum < 0.179,
  };
}

/** Schrift-Schlüssel (siteFont) → CSS-Font-Stack (Display-Schrift). */
const FONT_CSS: Record<string, string> = {
  editorial: "var(--font-editorial), Georgia, serif",
  serif: "var(--font-serif), Georgia, serif",
  display: "var(--font-display), system-ui, sans-serif",
  sans: "var(--font-sans), system-ui, sans-serif",
};

/**
 * Standard-Erscheinungsbild der Website, solange nichts eingestellt wurde.
 * EINE Quelle für Startseite UND Unterseiten — brächte jede Seite eigene
 * Fallbacks mit, sähen sie vor der ersten Einstellung unterschiedlich aus.
 */
export const SITE_DEFAULT_BG = "#0b0b0d";
export const SITE_DEFAULT_FONT = "editorial";

/**
 * Leitet die Design-Tokens der Unterseiten aus den globalen Einstellungen ab
 * (Grundfarbe + Schrift). Es gibt KEIN separates Unterseiten-Theme: Hintergrund,
 * Kontrast und Schrift kommen IMMER von der Startseite, damit die ganze Website
 * als ein Design wirkt — auch wenn noch nichts gesetzt ist (dann greifen die
 * Standardwerte oben, dieselben wie auf der Startseite). Der garantierte
 * Kontrast (weißer/schwarzer Text je nach Luminanz) wird hier wie in der
 * Album-Gastansicht sichergestellt.
 */
export function deriveSubpageTokens(opts: {
  color: string | null | undefined;
  font: string | null | undefined;
}): Record<string, string> {
  // Bewusst nie `undefined`: sonst fiele die Seite auf die Theme-Defaults zurück
  // und wiche vom Rest der Website ab.
  const c = hexToHsl(opts.color) ?? hexToHsl(SITE_DEFAULT_BG)!;

  const { h, s, l, dark } = c;
  // Flächen leicht gegen den Grund abgesetzt (dunkel: heller, hell: dunkler).
  const surfaceL = dark ? Math.min(l + 6, 100) : Math.max(l - 5, 0);
  const lineL = dark ? Math.min(l + 16, 100) : Math.max(l - 12, 0);
  const ink = dark ? "0 0% 100%" : "0 0% 8%";
  const muted = dark ? "0 0% 66%" : "0 0% 42%";

  return {
    "--canvas": `${h} ${s}% ${l}%`,
    "--surface": `${h} ${s}% ${surfaceL}%`,
    "--ink": ink,
    "--muted": muted,
    "--line": `${h} ${Math.round(s * 0.6)}% ${lineL}%`,
    "--accent": ink,
    "--accent-ink": `${h} ${s}% ${l}%`,
    "--font-display":
      FONT_CSS[opts.font ?? SITE_DEFAULT_FONT] ?? FONT_CSS[SITE_DEFAULT_FONT],
  };
}
