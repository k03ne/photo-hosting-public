import type { ComponentType } from "react";
import type { Block, BlockType, BlockOf } from "./schema";

// Registrierte Themes. Wächst mit jedem neuen Theme (siehe registry.ts).
export type ThemeName = "immersive";

/** Props, die JEDE Theme-Blockkomponente erhält. Generisch über den Blocktyp,
 *  damit `block.data` in der konkreten Komponente exakt typisiert ist. */
export interface BlockComponentProps<B extends Block = Block> {
  block: B;
  index: number;
}

/**
 * Map Blocktyp → React-Komponente. Der gemappte Typ erzwingt, dass ein Theme
 * für JEDEN Blocktyp eine Komponente bereitstellt (Vollständigkeit zur
 * Compile-Zeit) — und dass deren Props zum jeweiligen Block passen.
 */
export type BlockComponentMap = {
  [T in BlockType]: ComponentType<BlockComponentProps<BlockOf<T>>>;
};

export interface ThemeDefinition {
  name: ThemeName;
  label: string; // menschenlesbar fürs Admin-Dropdown
  /** Kurzbeschreibung fürs Admin (Theme-Auswahl mit Vorschau). */
  description?: string;
  /** Pfad zur Vorschaugrafik (in /public) für die Theme-Auswahl. */
  preview?: string;
  blocks: BlockComponentMap;
  /** Design-Tokens als CSS-Variablen — Grundlage für Schritt 3. */
  tokens?: Record<string, string>;
}
