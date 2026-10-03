"use client";

import { createContext, useContext, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { AnimatePresence, motion } from "framer-motion";
import { FilmStrip } from "@/components/gl/FilmStrip";
import { useThemeStore, type FilmItem } from "@/store/useThemeStore";
import { MOCK_ITEMS, mockAlbumTiles } from "@/lib/mock-filmstrip";

/**
 * „Reel" — immersive, awwwards-artige Startseite. Ein vollflächiger
 * WebGL-Filmstreifen (R3F) mit Custom-Shadern liegt unter einer absolut
 * positionierten DOM-Ebene (Typo, Filter, Socials, Burger, Lightbox, Album-Grid).
 * Default-Export → via `next/dynamic({ ssr:false })` erst bei aktivem Theme
 * geladen (Three.js landet nicht im Haupt-Bundle).
 *
 * State fließt ausschließlich über den Zustand-Store (useThemeStore) zwischen
 * DOM und Canvas. Hintergrund (Modus + Farbe) ist unter /admin/pages pflegbar.
 */

export interface ReelThemeProps {
  title?: string;
  items?: FilmItem[];
  categories?: string[];
  social?: { label: string; href: string }[];
  /** Social-Links, die statt in die Ecke in den Menü-Drawer gehören. */
  menuSocial?: { label: string; href: string }[];
  menu?: { label: string; href: string; external?: boolean }[];
  /** Hintergrund der Startseite (aus SiteSettings). */
  background?: { mode: "light" | "dark"; color: string };
  /** Display-Schrift (Grundeinstellung): editorial | serif | display | sans. */
  font?: string;
  /** Filterleiste unten anzeigen? */
  showFilter?: boolean;
}

/** Schrift-Schlüssel → CSS-Familie (Variablen aus layout.tsx). */
const FONT_VARS: Record<string, string> = {
  editorial: "var(--font-editorial), Georgia, serif",
  serif: "var(--font-serif), Georgia, serif",
  display: "var(--font-display), system-ui, sans-serif",
  sans: "var(--font-sans), system-ui, sans-serif",
};

const EASE = [0.22, 1, 0.36, 1] as const;

/** Aus Modus + Farbe abgeleitete Overlay-Palette (Kontrast der DOM-Ebene). */
interface Palette {
  color: string; // Hintergrundfarbe
  fg: string; // Vorder-/Schriftfarbe
  surface: string; // leichte Fläche (Filterleiste)
  border: string; // dezente Linie
  drawerBg: string; // undurchsichtige Panels (Drawer/Caption)
  overlay: string; // Abdunkelung hinter Overlays
  font: string; // Display-Schrift-Familie
}

function makePalette(mode: "light" | "dark", color: string, font: string): Palette {
  const light = mode === "light";
  return {
    color,
    fg: light ? "#141414" : "#ffffff",
    surface: light ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.06)",
    border: light ? "rgba(0,0,0,0.10)" : "rgba(255,255,255,0.12)",
    drawerBg: light ? "#ffffff" : "#0d0d0d",
    overlay: "rgba(0,0,0,0.4)",
    font: FONT_VARS[font] ?? FONT_VARS.editorial,
  };
}

/** Kategorien der übergebenen Items, eindeutig und in Erst-Vorkommens-Reihenfolge. */
function distinctCategories(items: FilmItem[]): string[] {
  const out: string[] = [];
  for (const it of items) {
    const c = it.category?.trim();
    if (c && !out.includes(c)) out.push(c);
  }
  return out;
}

const PaletteCtx = createContext<Palette>(makePalette("dark", "#0b0b0d", "editorial"));
const usePalette = () => useContext(PaletteCtx);

export default function ReelTheme({
  title = "REEL",
  items = MOCK_ITEMS,
  categories,
  social = [],
  menuSocial = [],
  menu = [],
  background = { mode: "dark", color: "#0b0b0d" },
  font = "editorial",
  showFilter = true,
}: ReelThemeProps) {
  const view = useThemeStore((s) => s.view);
  const dimmed = view !== "canvas"; // Canvas tritt hinter Lightbox/Album zurück
  const pal = makePalette(background.mode, background.color, font);

  // Die Filterleiste MUSS zu den gezeigten Bildern passen. Vorher fiel sie auf
  // MOCK_CATEGORIES zurück, sobald keine Kategorien gepflegt waren — die Pillen
  // trugen dann Fantasienamen, und ein Klick filterte den Streifen auf nichts.
  // Im Zweifel kommen sie jetzt aus den Items, die tatsächlich im Streifen liegen.
  const cats = useMemo(
    () => (categories?.length ? categories : distinctCategories(items)),
    [categories, items],
  );

  return (
    <PaletteCtx.Provider value={pal}>
      <div
        className="fixed inset-0 overflow-hidden"
        style={{ background: pal.color, color: pal.fg }}
      >
        {/* ── WebGL-Ebene ────────────────────────────────────────────────── */}
        <motion.div
          className="absolute inset-0"
          style={{ cursor: "grab" }}
          animate={{
            filter: dimmed ? "blur(20px) brightness(0.5)" : "blur(0px) brightness(1)",
            scale: dimmed ? 1.06 : 1,
          }}
          transition={{ duration: 0.6, ease: EASE }}
        >
          <Canvas
            dpr={[1, 2]} // Retina begrenzt: nie über 2× rastern (Performance)
            gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
            camera={{ position: [0, 0, 7], fov: 35 }}
          >
            <color attach="background" args={[pal.color]} />
            <FilmStrip items={items} />
          </Canvas>
        </motion.div>

        {/* ── DOM-Ebene (Overlay) ────────────────────────────────────────── */}
        <DOMLayer
          title={title}
          categories={cats}
          social={social}
          menuSocial={menuSocial}
          menu={menu}
          showFilter={showFilter}
        />
      </div>
    </PaletteCtx.Provider>
  );
}

/* ════════════════════════════════════════════════════════════════════════ */
/* DOM-Overlay. Wrapper ist pointer-events-none, interaktive Kinder re-        */
/* aktivieren sie — so bleiben Wheel/Drag/Klick auf der Canvas erreichbar.     */
/* ════════════════════════════════════════════════════════════════════════ */
function DOMLayer({
  title,
  categories,
  social,
  menuSocial,
  menu,
  showFilter,
}: Required<Pick<ReelThemeProps, "categories" | "social" | "menu">> & {
  title: string;
  /** Social-Links, die in den Menü-Drawer gehören (Modus „menu"). */
  menuSocial: { label: string; href: string }[];
  showFilter: boolean;
}) {
  const view = useThemeStore((s) => s.view);
  const pal = usePalette();

  return (
    <div className="pointer-events-none absolute inset-0 z-10 select-none">
      {/* Kopfzeile: Wortmark links, Burger rechts */}
      <header className="absolute inset-x-0 top-0 flex items-center justify-between px-6 py-6 md:px-10">
        <span className="text-sm font-light tracking-[0.35em]" style={{ opacity: 0.8 }}>
          {title}
        </span>
        {(menu.length > 0 || menuSocial.length > 0) && <BurgerButton />}
      </header>

      {/* Zentrale, sehr feine Serifen-Typo. */}
      <div className="absolute inset-0 flex items-center justify-center">
        <h1
          className="text-center text-[15vw] font-extralight leading-none tracking-tight md:text-[11vw]"
          style={{ fontFamily: pal.font, opacity: 0.95 }}
        >
          {title}
        </h1>
      </div>

      {/* Social-Links unten links */}
      <nav className="pointer-events-auto absolute bottom-6 left-6 flex flex-col gap-1 md:left-10">
        {social.map((s) => (
          <a
            key={s.label}
            href={s.href}
            className="text-xs tracking-[0.2em] opacity-50 transition-opacity hover:opacity-100"
            style={{ color: pal.fg }}
          >
            {s.label.toUpperCase()}
          </a>
        ))}
      </nav>

      {/* Filterleiste unten mittig (optional) */}
      {showFilter && <FilterBar categories={categories} />}

      {/* Overlays */}
      <Drawer menu={menu} social={menuSocial} />
      <AnimatePresence>{view === "lightbox" && <Lightbox key="lb" />}</AnimatePresence>
      <AnimatePresence>{view === "album" && <AlbumGrid key="al" />}</AnimatePresence>
    </div>
  );
}

/* ── Filterleiste ─────────────────────────────────────────────────────────── */
function FilterBar({ categories }: { categories: string[] }) {
  const filter = useThemeStore((s) => s.filter);
  const setFilter = useThemeStore((s) => s.setFilter);
  const pal = usePalette();
  // „Alle" + die aus den Daten stammenden Kategorien.
  const options = ["all", ...categories];
  const label = (o: string) => (o === "all" ? "Alle" : o);

  return (
    <div
      className="pointer-events-auto absolute bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full px-2 py-2 backdrop-blur-md"
      style={{ background: pal.surface, border: `1px solid ${pal.border}` }}
    >
      {options.map((o) => {
        const activeOpt = filter === o;
        return (
          <button
            key={o}
            onClick={() => setFilter(o)}
            className="relative rounded-full px-4 py-1.5 text-xs tracking-wide transition-opacity"
          >
            {activeOpt && (
              <motion.span
                layoutId="filter-pill"
                className="absolute inset-0 rounded-full"
                style={{ background: pal.fg }}
                transition={{ duration: 0.4, ease: EASE }}
              />
            )}
            <span
              className="relative z-10 transition-opacity"
              style={{
                color: activeOpt ? pal.color : pal.fg,
                opacity: activeOpt ? 1 : 0.6,
              }}
            >
              {label(o)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ── Burger + Drawer ──────────────────────────────────────────────────────── */
function BurgerButton() {
  const menuOpen = useThemeStore((s) => s.menuOpen);
  const setMenu = useThemeStore((s) => s.setMenu);
  const pal = usePalette();
  return (
    <button
      onClick={() => setMenu(!menuOpen)}
      aria-label="Menü"
      className="pointer-events-auto flex h-10 w-10 flex-col items-center justify-center gap-[5px]"
      style={{ color: pal.fg }}
    >
      <motion.span
        className="block h-px w-6 bg-current"
        animate={menuOpen ? { rotate: 45, y: 3 } : { rotate: 0, y: 0 }}
      />
      <motion.span
        className="block h-px w-6 bg-current"
        animate={menuOpen ? { rotate: -45, y: -3 } : { rotate: 0, y: 0 }}
      />
    </button>
  );
}

function Drawer({
  menu,
  social,
}: {
  menu: { label: string; href: string; external?: boolean }[];
  /** Abgesetzte Social-Gruppe unter der Navigation (Modus „menu"). */
  social: { label: string; href: string }[];
}) {
  const menuOpen = useThemeStore((s) => s.menuOpen);
  const setMenu = useThemeStore((s) => s.setMenu);
  const pal = usePalette();
  return (
    <AnimatePresence>
      {menuOpen && (
        <>
          <motion.div
            className="pointer-events-auto absolute inset-0"
            style={{ background: pal.overlay }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setMenu(false)}
          />
          <motion.aside
            className="pointer-events-auto absolute right-0 top-0 flex h-full w-full max-w-sm flex-col justify-center gap-6 px-10"
            style={{ background: pal.drawerBg, color: pal.fg }}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ duration: 0.5, ease: EASE }}
          >
            {menu.map((m, i) => (
              <motion.a
                key={m.label}
                href={m.href}
                {...(m.external ? { target: "_blank", rel: "noreferrer" } : {})}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 0.7, x: 0 }}
                whileHover={{ opacity: 1 }}
                transition={{ delay: 0.1 + i * 0.06, ease: EASE }}
                className="text-4xl font-extralight tracking-tight"
                style={{ fontFamily: pal.font }}
              >
                {m.label}
              </motion.a>
            ))}

            {/* Social-Links führen von der Website weg — deutlich kleiner und
                durch eine Linie abgesetzt, damit sie nicht wie Seiten wirken. */}
            {social.length > 0 && (
              <div className="mt-2 flex flex-col gap-3 border-t pt-6" style={{ borderColor: pal.border }}>
                {social.map((s) => (
                  <a
                    key={s.label}
                    href={s.href}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs tracking-[0.2em] opacity-60 transition-opacity hover:opacity-100"
                  >
                    {s.label.toUpperCase()}
                  </a>
                ))}
              </div>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

/* ── Lightbox (Einzelbild) ────────────────────────────────────────────────── */
function Lightbox() {
  const item = useThemeStore((s) => s.activeItem);
  const close = useThemeStore((s) => s.closeLightbox);
  const pal = usePalette();
  if (!item) return null;
  return (
    <motion.div
      className="pointer-events-auto absolute inset-0 z-20 flex items-center justify-center p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4, ease: EASE }}
      onClick={close}
    >
      <motion.figure
        className="relative flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-sm shadow-2xl"
        initial={{ scale: 0.92, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.92, y: 20 }}
        transition={{ duration: 0.5, ease: EASE }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Echtes Hi-Res-Bild; ohne Daten (Mock) ein Farbverlauf. */}
        {item.full ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.full}
            alt={item.title}
            className="w-full object-contain"
            style={{ maxHeight: "78vh", background: pal.color }}
          />
        ) : (
          <div
            className="w-full"
            style={{
              aspectRatio: String(item.aspect ?? 0.72),
              maxHeight: "70vh",
              background: `linear-gradient(145deg, ${item.color ?? "#333"}, #000)`,
            }}
          />
        )}
        <figcaption
          className="flex items-center justify-between px-5 py-4"
          style={{ background: pal.drawerBg, color: pal.fg }}
        >
          <span
            className="text-2xl font-light"
            style={{ fontFamily: pal.font }}
          >
            {item.title}
          </span>
          <span className="text-xs tracking-[0.2em]" style={{ opacity: 0.4 }}>
            {item.category.toUpperCase()}
          </span>
        </figcaption>
      </motion.figure>

      <CloseButton onClick={close} />
    </motion.div>
  );
}

/* ── Album-Grid (HTML/CSS über der Canvas) ────────────────────────────────── */
function AlbumGrid() {
  const item = useThemeStore((s) => s.activeItem);
  const close = useThemeStore((s) => s.closeAlbum);
  const pal = usePalette();
  if (!item) return null;
  const real = item.albumPhotos ?? [];
  const mock = real.length ? [] : mockAlbumTiles(item);
  return (
    <motion.div
      className="pointer-events-auto absolute inset-0 z-20 overflow-y-auto backdrop-blur-sm"
      style={{ background: `${pal.color}F2`, color: pal.fg }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4, ease: EASE }}
    >
      <div className="mx-auto max-w-6xl px-6 py-24 md:px-10">
        <div className="mb-12 flex items-end justify-between">
          <div>
            <p className="mb-2 text-xs tracking-[0.3em]" style={{ opacity: 0.4 }}>
              ALBUM
            </p>
            <h2
              className="text-5xl font-extralight tracking-tight md:text-7xl"
              style={{ fontFamily: pal.font }}
            >
              {item.title}
            </h2>
          </div>
          <button
            onClick={close}
            className="text-xs tracking-[0.25em] opacity-60 transition-opacity hover:opacity-100"
            style={{ color: pal.fg }}
          >
            ← ZURÜCK
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-5">
          {real.length > 0
            ? real.map((p, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <motion.img
                  key={`${item.id}-${i}`}
                  src={p.src}
                  alt=""
                  loading="lazy"
                  className="w-full rounded-sm object-cover"
                  style={{ aspectRatio: String(p.aspect || 0.8) }}
                  initial={{ opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03, duration: 0.5, ease: EASE }}
                />
              ))
            : mock.map((t, i) => (
                <motion.div
                  key={t.id}
                  className="aspect-[4/5] w-full rounded-sm"
                  style={{ background: t.background }}
                  initial={{ opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04, duration: 0.5, ease: EASE }}
                />
              ))}
        </div>
      </div>
    </motion.div>
  );
}

function CloseButton({ onClick }: { onClick: () => void }) {
  const pal = usePalette();
  return (
    <button
      onClick={onClick}
      aria-label="Schließen"
      className="absolute right-6 top-6 flex h-10 w-10 items-center justify-center text-2xl font-light opacity-70 transition-opacity hover:opacity-100 md:right-10 md:top-10"
      style={{ color: pal.fg }}
    >
      ✕
    </button>
  );
}
