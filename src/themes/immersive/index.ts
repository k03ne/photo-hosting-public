import type { ThemeDefinition } from "../types";
import { Hero } from "./components/Hero";
import { Gallery } from "./components/Gallery";
import { Text } from "./components/Text";
import { ContactForm } from "./components/ContactForm";
import { PortfolioGrid } from "./components/PortfolioGrid";
import { HeroScatter } from "../blocks/HeroScatter";

/**
 * „Immersive" — bildzentriertes Theme: eine vollflächige Bilderwand als
 * Startpunkt (Hover-Captions, Klick zum Vergrößern, fixes Kategorie-Menü),
 * kontrastreiche Versal-Serife als Display-Schrift. Inspiriert von immersiven
 * Fotograf:innen-Portfolios.
 */
export const immersiveTheme: ThemeDefinition = {
  name: "immersive",
  label: "Immersive",
  description: "Vollflächige Bilderwand, Kategorie-Menü, große Versal-Serife.",
  blocks: {
    hero: Hero,
    heroScatter: HeroScatter,
    gallery: Gallery,
    portfolioGrid: PortfolioGrid,
    text: Text,
    contactForm: ContactForm,
  },
  // Warme, editoriale Bühne (cremefarbener Grund); Display = hohe, schmale,
  // kontrastreiche Fashion-Serife (Cormorant) für den Wortmark-Hero.
  tokens: {
    "--canvas": "40 33% 96%",
    "--surface": "40 20% 92%",
    "--ink": "0 0% 6%",
    "--muted": "0 0% 40%",
    "--line": "40 15% 84%",
    "--accent": "0 0% 6%",
    "--accent-ink": "40 33% 96%",
    "--font-display": "var(--font-editorial), Georgia, serif",
  },
};
