import { z } from "zod";

/**
 * Striktes Schema der Inhaltsblöcke. Dieses zod-Schema ist die EINZIGE Quelle
 * der Wahrheit: das Backend validiert damit vor dem Speichern (Server Action),
 * das Frontend leitet die TS-Typen per z.infer ab. Neue Blocktypen werden hier
 * ergänzt — Schema und Typen bleiben so garantiert synchron.
 *
 * `data` ist pro Blocktyp eigen; die Diskriminante ist `type`.
 */

const heroBlock = z.object({
  id: z.string(),
  type: z.literal("hero"),
  data: z.object({
    headline: z.string(),
    subline: z.string().optional(),
    imageKey: z.string().optional(), // storageKey eines Fotos (Mediathek)
    align: z.enum(["left", "center", "right"]).default("center"),
  }),
});

const galleryBlock = z.object({
  id: z.string(),
  type: z.literal("gallery"),
  data: z.object({
    albumId: z.string().optional(), // ganze Galerie aus einem Album …
    photoKeys: z.array(z.string()).default([]), // … ODER manuell gewählte storageKeys
    columns: z.number().int().min(1).max(6).default(3),
    layout: z.enum(["grid", "masonry", "justified"]).default("masonry"),
  }),
});

const textBlock = z.object({
  id: z.string(),
  type: z.literal("text"),
  data: z.object({
    heading: z.string().optional(),
    body: z.string(), // Markdown/Plaintext
    align: z.enum(["left", "center"]).default("left"),
  }),
});

/**
 * Kuratiertes Portfolio-Raster (Signatur-Block des „studio"-Themes): eine von
 * Hand über die ganze Mediathek zusammengestellte Bildauswahl (`photoKeys`),
 * die als Overview + automatische Kategorie-Tabs mit Lightbox erscheint. Die
 * Kategorien entstehen aus der effektiven Kategorie je Foto
 * (`photo.category ?? album.category`) — aufgelöst zur Renderzeit in `items`.
 */
const portfolioGridBlock = z.object({
  id: z.string(),
  type: z.literal("portfolioGrid"),
  data: z.object({
    title: z.string().optional(),
    photoKeys: z.array(z.string()).default([]), // kuratierte storageKeys
    selection: z.enum(["all", "random"]).default("all"), // Overview: alle | zufällig
    randomCount: z.number().int().min(1).max(60).default(12),
    columns: z.number().int().min(1).max(6).default(4),
    layout: z.enum(["grid", "masonry", "justified"]).default("masonry"),
    showCategories: z.boolean().default(true),
    // Transient (nicht redaktionell): zur Renderzeit aufgelöste Fotos.
    items: z
      .array(
        z.object({
          key: z.string(),
          category: z.string().nullable(),
          caption: z.string().nullable(),
          width: z.number(),
          height: z.number(),
          blurDataUrl: z.string().nullable(),
        }),
      )
      .default([]),
  }),
});

/**
 * „heroScatter" — Startseiten-Hero: großer Display-Wortmark mittig, umschlossen
 * von einem geordneten Bilderraster, das beim (Lenis-)Scrollen aus der
 * Mittellinie in seine volle Größe aufwächst (clip-path-Reveal). Die Bildquelle
 * ist wählbar: manuelle Auswahl (`photoKeys`), alle Kategorien oder öffentliche
 * Alben. Wie `portfolioGrid` werden die Bilder zur Renderzeit zu `items`
 * aufgelöst (siehe resolvePageBlocks). Der Blocktyp-Name bleibt aus
 * Datenkompatibilität „heroScatter".
 */
const heroScatterBlock = z.object({
  id: z.string(),
  type: z.literal("heroScatter"),
  data: z.object({
    title: z.string(),
    subtitle: z.string().optional(),
    /** Bildquelle: manuell | alle Kategorien | öffentliche Alben. */
    source: z.enum(["manual", "categories", "albums"]).default("categories"),
    photoKeys: z.array(z.string()).default([]), // bei source=manual
    /** Anzahl gezeigter Bilder (bei automatischen Quellen; wiederholt bei zu wenigen). */
    count: z.number().int().min(3).max(40).default(14),
    /** Staffelung des Reveals zwischen den Spalten (0 = synchron, 1 = stark). */
    intensity: z.number().min(0).max(1).default(0.5),
    // Transient (nicht redaktionell): zur Renderzeit aufgelöste Bilder.
    items: z
      .array(
        z.object({
          key: z.string(),
          width: z.number(),
          height: z.number(),
          blurDataUrl: z.string().nullable(),
        }),
      )
      .default([]),
  }),
});

const contactFormBlock = z.object({
  id: z.string(),
  type: z.literal("contactForm"),
  data: z.object({
    heading: z.string().optional(),
    // Empfänger wird global in den Einstellungen (contactRecipient) gepflegt;
    // dieses Feld ist nur noch für Altdaten geduldet und wird nicht genutzt.
    email: z.string().optional(),
    fields: z
      .array(z.enum(["name", "email", "phone", "message"]))
      .default(["name", "email", "message"]),
  }),
});

export const blockSchema = z.discriminatedUnion("type", [
  heroBlock,
  heroScatterBlock,
  galleryBlock,
  portfolioGridBlock,
  textBlock,
  contactFormBlock,
]);

/** Aufgelöstes Foto im Portfolio-Raster (Element von `portfolioGrid.data.items`). */
export type PortfolioItem = BlockOf<"portfolioGrid">["data"]["items"][number];

/** Aufgelöstes Bild im Hero-Scatter (Element von `heroScatter.data.items`). */
export type HeroScatterItem = BlockOf<"heroScatter">["data"]["items"][number];

/** Ein ganzer Seiteninhalt: geordnetes Array von Blöcken. */
export const blocksSchema = z.array(blockSchema);

// Abgeleitete Typen — nie von Hand pflegen.
export type Block = z.infer<typeof blockSchema>;
export type BlockType = Block["type"];
export type BlockOf<T extends BlockType> = Extract<Block, { type: T }>;

/**
 * Sichere Grenze DB(Json/unknown) → typisiertes Block[]. Ungültige Blöcke
 * lassen wir NICHT den Render crashen: safeParse, im Fehlerfall leeres Array
 * (und in Dev ein Log). Beim Speichern nutzt die Server Action stattdessen
 * .parse und lehnt invaliden Input hart ab.
 */
export function parseBlocks(json: unknown): Block[] {
  const result = blocksSchema.safeParse(json);
  if (result.success) return result.data;
  if (process.env.NODE_ENV !== "production") {
    console.warn("[BlockRenderer] Ungültige blocks-Daten:", result.error.issues);
  }
  return [];
}
