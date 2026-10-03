import { create } from "zustand";

/**
 * Zustand-Store für das OmniGrid-Theme (unendliches WebGL-Drag-Raster).
 * Einzige Brücke zwischen der WebGL-Canvas-Ebene (R3F) und der DOM-Ebene
 * (Untertitel, Lightbox, 4-Ecken-UI, barrierefreie Button-Spiegelung).
 */

/** Ein Quellbild des Rasters. Für Mock- wie Echtdaten identisch. */
export interface GridImage {
  id: string;
  /** Low-Res-Textur fürs Raster — z.B. `mediaUrl(key,"thumb")`. */
  src: string;
  /** Voll aufgelöste URL für die DOM-Lightbox — `mediaUrl(key,"full")`. */
  full: string;
  /** Seitenverhältnis Breite/Höhe (>1 quer, <1 hoch). */
  aspect: number;
  /** Optionaler Untertitel (Bildtitel/Caption) — auch als a11y-Label genutzt. */
  subtitle?: string;
  /** Portfolio-Kategorie für die Filterleiste; leer/fehlend = nur unter „Alle". */
  category?: string;
}

export type ThemeMode = "light" | "dark";
/** 'persistent' = Headline bleibt immer; 'fade' = bei Interaktion aus, bei Ruhe ein. */
export type HeroBehavior = "persistent" | "fade";

/** Ruhezeit bis „idle": Headline wieder ein + Auto-Schwenk startet (ms). */
const IDLE_MS = 3200;

/** Voreingestellte Auto-Schwenk-Geschwindigkeit (Welt-Einheiten/Sek). Bewusst
 *  sehr langsam & subtil; per `autoScrollSpeed`-Prop überschreibbar. */
const DEFAULT_AUTO_SPEED = 0.08;

interface GridStore {
  // ── Quelldaten ────────────────────────────────────────────────────────────
  items: GridImage[];
  setItems: (items: GridImage[]) => void;

  // ── Aktive (eindeutige) Rasterinstanz (Graustufen→Farbe + Untertitel) ──────
  /**
   * Eindeutige *Instanz*-ID der aktuell hervorgehobenen Ebene — NICHT die Bild-ID.
   * Im unendlichen Wrap-Around teilen sich mehrere Klon-Ebenen dieselbe Bild-ID;
   * nur die eine gehoverte/fokussierte Instanz darf farbig werden. Deshalb wird
   * hier die je Ebene eindeutige Instanz-ID getrackt, nicht das Bild.
   */
  activeInstanceId: string | null;
  /** Bild der aktiven Instanz (für Untertitel + Öffnen aus der Untertitelleiste). */
  activeImage: GridImage | null;
  subtitle: string | null;
  /** Hover/Fokus einer eindeutigen Instanz aktivieren. */
  setHover: (instanceId: string, image: GridImage) => void;
  /** Hover-Ende — räumt nur, wenn genau diese Instanz noch aktiv ist (kein Flackern beim Übergang). */
  clearHover: (instanceId: string) => void;
  /** a11y-Fokus (kein eindeutiges Instanz-Ziel): nur Untertitel, keine Farb-Isolation nötig. */
  focusImage: (image: GridImage) => void;
  clearActive: () => void;

  // ── Lightbox ──────────────────────────────────────────────────────────────
  lightboxItem: GridImage | null;
  openLightbox: (item: GridImage) => void;
  closeLightbox: () => void;

  // ── Theme (Hell/Dunkel) ────────────────────────────────────────────────────
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  toggleThemeMode: () => void;

  // ── Hero-Headline ───────────────────────────────────────────────────────────
  heroBehavior: HeroBehavior;
  /** Sichtbarkeit der zentralen Headline (an Idle-/Interaktions-Zustand gekoppelt). */
  heroVisible: boolean;

  // ── Idle / Auto-Schwenk ─────────────────────────────────────────────────────
  autoScrollOnIdle: boolean;
  /** Auto-Schwenk-Geschwindigkeit (Welt-Einheiten/Sek); klein = subtil. */
  autoScrollSpeed: number;
  /** Normierter Schwenk-Richtungsvektor bei Idle (null = kein Auto-Schwenk). */
  autoScrollDir: { x: number; y: number } | null;

  /** Verhalten aus den Theme-Props übernehmen (einmalig beim Mount). */
  configure: (opts: {
    heroBehavior: HeroBehavior;
    autoScrollOnIdle: boolean;
    autoScrollSpeed?: number;
    themeMode?: ThemeMode;
  }) => void;
  /** Jede Nutzereingabe: Headline (bei 'fade') aus, Auto-Schwenk stoppen, Idle-Timer neu. */
  registerActivity: () => void;
  /** Idle-Beobachtung starten, ohne die „Interaktions"-Effekte (Mount / Lightbox zu). */
  armIdle: () => void;
}

export const useGridStore = create<GridStore>((set, get) => {
  // Idle-Timer im Closure der Store-Instanz (nur clientseitig aktiv).
  let idleTimer: ReturnType<typeof setTimeout> | null = null;

  const schedule = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(onIdle, IDLE_MS);
  };

  const onIdle = () => {
    const s = get();
    // Hinter geöffneter Lightbox oder über einem gehoverten Bild nicht auto-schwenken.
    if (s.lightboxItem) return;
    const next: Partial<GridStore> = {};
    if (s.heroBehavior === "fade" && !s.heroVisible) next.heroVisible = true;
    if (s.autoScrollOnIdle && !s.activeInstanceId) {
      // Zufällige Richtung: gleichverteilter Winkel → Einheitsvektor.
      const a = Math.random() * Math.PI * 2;
      next.autoScrollDir = { x: Math.cos(a), y: Math.sin(a) };
    }
    if (Object.keys(next).length) set(next);
  };

  return {
    items: [],
    setItems: (items) => set({ items }),

    activeInstanceId: null,
    activeImage: null,
    subtitle: null,
    setHover: (instanceId, image) =>
      // Hover eines Bildes stoppt einen laufenden Auto-Schwenk sofort.
      set({
        activeInstanceId: instanceId,
        activeImage: image,
        subtitle: image.subtitle ?? null,
        autoScrollDir: null,
      }),
    clearHover: (instanceId) => {
      // Nur räumen, wenn keine andere Instanz inzwischen übernommen hat.
      if (get().activeInstanceId !== instanceId) return;
      set({ activeInstanceId: null, activeImage: null, subtitle: null });
    },
    focusImage: (image) =>
      set({ activeInstanceId: null, activeImage: image, subtitle: image.subtitle ?? null }),
    clearActive: () => set({ activeInstanceId: null, activeImage: null, subtitle: null }),

    lightboxItem: null,
    openLightbox: (item) => set({ lightboxItem: item, autoScrollDir: null }),
    closeLightbox: () => {
      set({ lightboxItem: null });
      schedule(); // Idle-Beobachtung nach dem Schließen erneut anwerfen
    },

    themeMode: "dark",
    setThemeMode: (themeMode) => set({ themeMode }),
    toggleThemeMode: () =>
      set((s) => ({ themeMode: s.themeMode === "dark" ? "light" : "dark" })),

    heroBehavior: "persistent",
    heroVisible: true,

    autoScrollOnIdle: false,
    autoScrollSpeed: DEFAULT_AUTO_SPEED,
    autoScrollDir: null,

    configure: ({ heroBehavior, autoScrollOnIdle, autoScrollSpeed, themeMode }) =>
      set({
        heroBehavior,
        autoScrollOnIdle,
        ...(autoScrollSpeed != null ? { autoScrollSpeed } : {}),
        heroVisible: true,
        ...(themeMode ? { themeMode } : {}),
      }),

    registerActivity: () => {
      const s = get();
      const next: Partial<GridStore> = {};
      if (s.autoScrollDir) next.autoScrollDir = null;
      if (s.heroBehavior === "fade" && s.heroVisible) next.heroVisible = false;
      if (Object.keys(next).length) set(next);
      schedule();
    },

    armIdle: schedule,
  };
});
