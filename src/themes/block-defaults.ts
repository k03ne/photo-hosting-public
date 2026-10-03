import type { Block, BlockType } from "./schema";
import { uid } from "@/lib/uid";

/** Anzeige-Metadaten der Blocktypen für die Editor-Palette. */
export const BLOCK_META: Record<BlockType, { label: string; icon: string; hint: string }> = {
  hero: { label: "Hero", icon: "▧", hint: "Großes Kopfbild mit Titel" },
  heroScatter: {
    label: "Hero (Scatter)",
    icon: "✦",
    hint: "Titel mittig, verteilte Bilder mit Scroll-/WebGL-Effekt",
  },
  portfolioGrid: {
    label: "Portfolio",
    icon: "▤",
    hint: "Kuratiertes Raster: Overview + Kategorien + Lightbox",
  },
  gallery: { label: "Galerie", icon: "▦", hint: "Bildraster (Album oder Auswahl)" },
  text: { label: "Text", icon: "¶", hint: "Überschrift & Fließtext" },
  contactForm: { label: "Kontakt", icon: "✉", hint: "Kontaktformular" },
};

/** Reihenfolge der Blöcke in der Palette. */
export const BLOCK_ORDER: BlockType[] = [
  "hero",
  "heroScatter",
  "portfolioGrid",
  "gallery",
  "text",
  "contactForm",
];

/**
 * Erzeugt einen neuen Block mit sinnvollen Defaults. Das Ergebnis entspricht
 * exakt dem (bereits mit zod-Defaults aufgelösten) `Block`-Ausgabetyp, ist also
 * ohne weitere Validierung speicherbar.
 */
export function createBlock(type: BlockType): Block {
  const id = uid();
  switch (type) {
    case "hero":
      return { id, type, data: { headline: "Neue Überschrift", align: "center" } };
    case "heroScatter":
      return {
        id,
        type,
        data: {
          title: "Dein Name",
          source: "categories",
          photoKeys: [],
          count: 14,
          intensity: 0.5,
          items: [],
        },
      };
    case "gallery":
      return { id, type, data: { photoKeys: [], columns: 3, layout: "masonry" } };
    case "portfolioGrid":
      return {
        id,
        type,
        data: {
          photoKeys: [],
          selection: "all",
          randomCount: 12,
          columns: 4,
          layout: "masonry",
          showCategories: true,
          items: [],
        },
      };
    case "text":
      return { id, type, data: { body: "Dein Text …", align: "left" } };
    case "contactForm":
      return {
        id,
        type,
        // Empfänger kommt global aus den Einstellungen (contactRecipient).
        data: { fields: ["name", "email", "message"] },
      };
  }
}
