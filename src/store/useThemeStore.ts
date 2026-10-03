import { create } from "zustand";

/**
 * Zentraler Zustand-Store für das FilmStrip-Theme. Einzige Brücke zwischen der
 * DOM-Ebene (React/Framer Motion) und der WebGL-Canvas-Ebene (R3F). Bewusst
 * minimal gehalten: die Canvas liest reaktiv `filter`/`view`, die DOM-Overlays
 * lesen `view`/`activeItem`/`menuOpen` — kein Prop-Drilling durch den Baum.
 */

/** Ein Element im 3D-Filmstreifen. Für Mock- wie Echtdaten identisch. */
export type FilmItemKind = "photo" | "album";

export interface FilmItem {
  id: string;
  kind: FilmItemKind;
  title: string;
  /** Kategorie für die Filterleiste (z.B. „Portraits", „Reisen"). */
  category: string;
  /** Basisfarbe für die generierte Mock-Textur (nur ohne `src` genutzt). */
  color?: string;
  /** Seitenverhältnis Breite/Höhe (>1 quer, <1 hoch). Steuert die Panel-Größe. */
  aspect?: number;
  /** Echtdaten-Pfad zur (Low-Res) WebP-Textur — z.B. `mediaUrl(key,"thumb")`. */
  src?: string;
  /** Voll aufgelöste URL für die Lightbox — `mediaUrl(key,"full")`. */
  full?: string;
  /** Bei kind==="album": Ziel-Album für die Grid-Ansicht. */
  albumId?: string;
  /** Bei kind==="album": Fotos des Albums für die Grid-Ansicht (Echtdaten). */
  albumPhotos?: { src: string; aspect: number }[];
}

/** Welche Ebene aktuell im Vordergrund steht. */
export type ViewState = "canvas" | "lightbox" | "album";

/**
 * Filter der Canvas-Auswahl. `"all"` = alles, `"albums"` = nur Album-Cover,
 * jeder andere String = konkreter Kategoriename. Als String statt Enum, damit
 * die Kategorien dynamisch aus den Daten kommen können.
 */
export type Filter = string;

interface ThemeStore {
  // ── Filter ──────────────────────────────────────────────────────────────
  filter: Filter;
  setFilter: (filter: Filter) => void;

  // ── View / Navigation ─────────────────────────────────────────────────────
  view: ViewState;
  /** Aktuell im Lightbox/Album fokussiertes Element. */
  activeItem: FilmItem | null;

  openLightbox: (item: FilmItem) => void;
  closeLightbox: () => void;
  openAlbum: (item: FilmItem) => void;
  closeAlbum: () => void;

  // ── Burger-Drawer ─────────────────────────────────────────────────────────
  menuOpen: boolean;
  setMenu: (open: boolean) => void;

  // ── Canvas → DOM Telemetrie ───────────────────────────────────────────────
  /** Geglättete, normierte Scroll-Geschwindigkeit (-1..1) aus der Canvas. */
  velocity: number;
  setVelocity: (v: number) => void;
}

export const useThemeStore = create<ThemeStore>((set) => ({
  filter: "all",
  setFilter: (filter) => set({ filter }),

  view: "canvas",
  activeItem: null,

  // Ein Klick auf ein Einzelbild öffnet die DOM-Lightbox; die Canvas dimmt.
  openLightbox: (item) => set({ view: "lightbox", activeItem: item }),
  closeLightbox: () => set({ view: "canvas", activeItem: null }),

  // Ein Klick auf ein Album-Cover blendet das HTML/CSS-Grid über die Canvas.
  openAlbum: (item) => set({ view: "album", activeItem: item }),
  closeAlbum: () => set({ view: "canvas", activeItem: null }),

  menuOpen: false,
  setMenu: (menuOpen) => set({ menuOpen }),

  velocity: 0,
  setVelocity: (velocity) => set({ velocity }),
}));
