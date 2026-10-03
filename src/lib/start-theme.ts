/**
 * Typen und Normalisierung rund um das Startseiten-Theme. Bewusst OHNE Prisma-
 * Import (im Gegensatz zu `start-page-data.ts`), damit auch Client-Komponenten
 * — Editor, ThemeCard, Mockup — dieselbe Quelle nutzen können.
 *
 * Vorher lag der Union-Typ in sechs Dateien parallel und die Normalisierung
 * `=== "omnigrid" ? "omnigrid" : "reel"` war fünfmal ausgeschrieben; ein neues
 * Theme hätte still an den vergessenen Stellen auf „reel" zurückfallen können.
 */

/** Theme der fixen Startseite. */
export type StartTheme = "reel" | "omnigrid";

/** Alle Themes in Anzeigereihenfolge (Auswahl im Admin). */
export const START_THEMES: { key: StartTheme; label: string; hint: string; beta?: boolean }[] = [
  {
    key: "reel",
    label: "FilmStrip",
    hint: "Horizontaler Bildstreifen vor einem großen Wortmark. Ruhig, editorial.",
    // Noch in Arbeit — im Admin sichtbar als BETA gekennzeichnet.
    beta: true,
  },
  {
    key: "omnigrid",
    label: "OmniGrid",
    hint: "Unendliches, zieh- und scrollbares Bildraster. Dicht, verspielt.",
  },
];

/** Ist das Theme noch als BETA gekennzeichnet? */
export function isBetaTheme(key: StartTheme): boolean {
  return START_THEMES.find((t) => t.key === key)?.beta ?? false;
}

/** Normalisiert einen gespeicherten Wert auf ein gültiges Theme (Fallback „reel"). */
export function parseStartTheme(value: unknown): StartTheme {
  return value === "omnigrid" ? "omnigrid" : "reel";
}

/**
 * Prüft, OB ein Wert ein Theme benennt — im Gegensatz zu `parseStartTheme`, das
 * jeden unbekannten Wert still zu „reel" macht. Für optionale Quellen (Query-
 * Overrides der Vorschau) nötig: dort soll ein Tippfehler den gespeicherten
 * Stand behalten, nicht heimlich das Theme wechseln.
 */
export function isStartTheme(value: unknown): value is StartTheme {
  return value === "reel" || value === "omnigrid";
}

/** Anzeigename eines Themes. */
export function startThemeLabel(key: StartTheme): string {
  return START_THEMES.find((t) => t.key === key)?.label ?? key;
}

/** Auftritt der Marke auf der OmniGrid-Startseite. */
export type OmniBrandMode = "swap" | "fixed";

/** Normalisiert den gespeicherten String auf einen gültigen Modus. */
export function parseOmniBrandMode(value: unknown): OmniBrandMode {
  return value === "fixed" ? "fixed" : "swap";
}
