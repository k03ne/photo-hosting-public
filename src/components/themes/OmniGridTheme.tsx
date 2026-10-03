"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Canvas } from "@react-three/fiber";
import { EffectComposer, Noise, Vignette } from "@react-three/postprocessing";
import { BlendFunction } from "postprocessing";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

import { InfiniteGrid } from "@/components/gl/InfiniteGrid";
import { OmniLightbox } from "@/components/themes/OmniLightbox";
import {
  useGridStore,
  type GridImage,
  type HeroBehavior,
  type ThemeMode,
} from "@/store/useGridStore";

export interface OmniGridThemeProps {
  images: GridImage[];
  /** Zwischenraum-Anteil pro Zelle (0..1). Kleiner = engeres Raster. */
  gapSize?: number;
  /** Basis-Zellgröße (Weltkoordinaten). Größer = größere Bilder / mehr Zoom. */
  cellSize?: number;
  /** Start-Theme; per UI (unten links) umschaltbar. */
  themeMode?: ThemeMode;
  /** Zentrale Headline. */
  heroText?: string;
  /** Optionaler Unterzeile/Tagline unter der Headline. */
  heroSubtitle?: string;
  /** 'persistent' = immer sichtbar; 'fade' = bei Interaktion aus, bei Ruhe ein. */
  heroBehavior?: HeroBehavior;
  /** Bei Idle sanft in Zufallsrichtung schwenken; stoppt bei Eingabe. */
  autoScrollOnIdle?: boolean;
  /** Geschwindigkeit des Idle-Auto-Schwenks (Welt-Einheiten/Sek). Klein = subtil. */
  autoScrollSpeed?: number;
  /** Minimalistische „Schneidematte" hinter den Bildern einblenden. */
  showGridLines?: boolean;
  /** Bilder dauerhaft farbig zeigen statt erst beim Hover. */
  alwaysColor?: boolean;
  // ── 4-Ecken-UI ──────────────────────────────────────────────────────────────
  /** Wortmarke oben links (Fallback, wenn kein Logo-Bild hinterlegt ist). */
  siteName?: string;
  /** Logo-Bild oben links; ersetzt die Wortmarke. */
  logoSrc?: string;
  /**
   * Marke oben links an den Hero koppeln: sichtbar nur, WÄHREND die Mitte
   * ausgeblendet ist (Wortmarke wandert bei Bewegung von der Mitte nach oben
   * links und im Leerlauf zurück). `false` = dauerhaft sichtbar.
   */
  brandFollowsHero?: boolean;
  navItems?: { label: string; href: string; external?: boolean }[];
  /** Social-Links unten rechts (Modus „corner"). */
  socials?: { label: string; href: string }[];
  /** Social-Links als eigene Gruppe im Burger-Menü (Modus „menu"). */
  menuSocials?: { label: string; href: string }[];
  /** Kategorien der Filterleiste (unten mittig). Leer = keine Leiste. */
  categories?: string[];
  /** Filterleiste anzeigen? Kommt aus den Startseiten-Einstellungen. */
  showFilter?: boolean;
}

/**
 * Theme 2 — „OmniGrid": unendliches, omnidirektional zieh-/scrollbares WebGL-
 * Bildraster mit 4-Ecken-DOM-UI, zentraler Headline (an Idle gekoppelt),
 * Hell/Dunkel-Umschaltung, globalem Grain/Vignette-Post und barrierefreier
 * DOM-Spiegelung. Via `next/dynamic({ ssr:false })` laden (siehe Loader unten).
 */
export default function OmniGridTheme({
  images,
  gapSize,
  cellSize,
  themeMode = "dark",
  heroText,
  heroSubtitle,
  heroBehavior = "persistent",
  autoScrollOnIdle = false,
  autoScrollSpeed,
  showGridLines = false,
  alwaysColor = false,
  siteName,
  logoSrc,
  brandFollowsHero = false,
  navItems,
  socials,
  menuSocials,
  categories,
  showFilter = false,
}: OmniGridThemeProps) {
  const reducedMotion = useReducedMotion() ?? false;
  const setItems = useGridStore((s) => s.setItems);
  const configure = useGridStore((s) => s.configure);
  const armIdle = useGridStore((s) => s.armIdle);
  const registerActivity = useGridStore((s) => s.registerActivity);

  const mode = useGridStore((s) => s.themeMode);
  const dark = mode === "dark";

  // Kategorie-Filter: das Raster wird mit der gefilterten Menge neu aufgebaut
  // (das unendliche Wrap-Around kachelt genau diese Bilder). `useMemo`, sonst
  // wäre die Liste bei jedem Render neu und der Effekt unten liefe endlos.
  const [filter, setFilter] = useState("all");
  const visible = useMemo(
    () => (filter === "all" ? images : images.filter((i) => i.category === filter)),
    [images, filter],
  );

  // Props → Store übernehmen und Idle-Beobachtung starten.
  useEffect(() => {
    setItems(visible);
    configure({ heroBehavior, autoScrollOnIdle, autoScrollSpeed, themeMode });
    armIdle();
  }, [
    visible,
    heroBehavior,
    autoScrollOnIdle,
    autoScrollSpeed,
    themeMode,
    setItems,
    configure,
    armIdle,
  ]);

  // Jede Nutzereingabe (überall) meldet Aktivität: Headline (bei 'fade') aus,
  // Auto-Schwenk stoppen, Idle-Timer neu. Ein zentraler Listener statt viele.
  useEffect(() => {
    const on = () => registerActivity();
    const evts = ["pointerdown", "pointermove", "wheel", "keydown", "touchstart", "touchmove"];
    evts.forEach((e) => window.addEventListener(e, on, { passive: true }));
    return () => evts.forEach((e) => window.removeEventListener(e, on));
  }, [registerActivity]);

  const bg = dark ? "#0a0a0b" : "#eceae4";
  const halo = textHalo(dark);

  return (
    <div
      className={`fixed inset-0 select-none transition-colors duration-500 ${
        dark ? "text-white" : "text-neutral-900"
      }`}
      style={{ background: bg }}
    >
      <Canvas
        camera={{ position: [0, 0, 12], fov: 55 }}
        dpr={[1, 2]} // Retina, gedeckelt (Mobile-Performance/60fps)
        gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
        style={{ touchAction: "none" }} // native Touch-Scroll unterdrücken → Drag
      >
        <color attach="background" args={[bg]} />
        <InfiniteGrid
          reducedMotion={reducedMotion}
          gap={gapSize}
          cellSize={cellSize}
          showGridLines={showGridLines}
          dark={dark}
          alwaysColor={alwaysColor}
        />

        <EffectComposer>
          <Vignette offset={0.12} darkness={dark ? 0.82 : 0.5} eskil={false} />
          <Noise
            premultiply
            blendFunction={BlendFunction.OVERLAY}
            opacity={reducedMotion ? 0 : dark ? 0.06 : 0.035}
          />
        </EffectComposer>
      </Canvas>

      {/* ── 4-Ecken-UI + Center. Wrapper klick-durchlässig; nur Controls fangen. ── */}
      <div className="pointer-events-none fixed inset-0 z-10">
        {/* Oben links: Logo / Wortmarke */}
        <BrandMark name={siteName} logoSrc={logoSrc} followsHero={brandFollowsHero} halo={halo} />

        {/* Oben rechts: Menü / Burger */}
        {((navItems && navItems.length > 0) || (menuSocials && menuSocials.length > 0)) && (
          <BurgerMenu items={navItems ?? []} socials={menuSocials ?? []} dark={dark} />
        )}

        {/* Unten links: Hell/Dunkel-Umschalter */}
        <ThemeToggleButton dark={dark} />

        {/* Unten mittig: Kategorie-Filter (zwischen Umschalter und Socials) */}
        {showFilter && categories && categories.length > 0 && (
          <GridFilterBar
            categories={categories}
            active={filter}
            onChange={setFilter}
            dark={dark}
          />
        )}

        {/* Unten rechts: Social-Links */}
        {socials && socials.length > 0 && (
          <nav
            aria-label="Social-Links"
            className="pointer-events-auto absolute bottom-5 right-5 flex items-center gap-4"
          >
            {socials.map((s) => (
              <a
                key={s.href}
                href={s.href}
                target="_blank"
                rel="noreferrer"
                style={{ textShadow: halo }}
                className="text-[11px] uppercase tracking-[0.15em] opacity-80 transition hover:opacity-100"
              >
                {s.label}
              </a>
            ))}
          </nav>
        )}

        {/* Center: Hero-Headline (an Idle-/Interaktions-Zustand gekoppelt) */}
        <HeroHeadline text={heroText} subtitle={heroSubtitle} halo={halo} />
      </div>

      {/* Spiegelt die SICHTBARE Menge — sonst führte die Tastatur-Navigation zu
          Bildern, die der Filter gerade ausblendet. */}
      <AccessibleGridOverlay images={visible} />
      <OmniLightbox />
    </div>
  );
}

/**
 * Weicher Schein in der Gegenfarbe hinter der Schrift.
 *
 * Die 4-Ecken-UI steht direkt auf dem Bildraster. Im dunklen Modus trägt der
 * kräftige Vignette-Rand die weiße Schrift noch; im hellen Modus stand dunkle
 * Schrift auf mittelhellen Bildern praktisch kontrastlos da — und mit dauerhaft
 * farbigen Bildern wird es schlimmer. Ein Kasten hinter jedem Wort würde die
 * Ruhe des Themes zerstören, ein Schein trägt den Text unsichtbar.
 */
function textHalo(dark: boolean): string {
  return dark
    ? "0 1px 2px rgba(0,0,0,0.75), 0 0 18px rgba(0,0,0,0.55)"
    : "0 1px 2px rgba(255,255,255,0.95), 0 0 18px rgba(255,255,255,0.8)";
}

/** Dasselbe für Nicht-Text (Burger-Striche, die `bg-current` nutzen). */
function iconHalo(dark: boolean): string {
  return dark
    ? "drop-shadow(0 1px 3px rgba(0,0,0,0.8))"
    : "drop-shadow(0 1px 3px rgba(255,255,255,0.95))";
}

/**
 * Marke oben links — Logo-Bild, sonst Wortmarke.
 *
 * `followsHero` dreht die Sichtbarkeit gegen den Hero: solange die Mitte steht,
 * bleibt oben links frei; sobald sie beim Ziehen ausblendet, rückt die Marke
 * nach. So wirkt es wie EINE Marke, die den Platz wechselt, statt wie zwei
 * gleichzeitige Wortmarken. Ohne `followsHero` klebt sie dauerhaft oben links.
 */
function BrandMark({
  name,
  logoSrc,
  followsHero,
  halo,
}: {
  name?: string;
  logoSrc?: string;
  followsHero: boolean;
  halo: string;
}) {
  const heroVisible = useGridStore((s) => s.heroVisible);
  if (!name && !logoSrc) return null;

  const visible = followsHero ? !heroVisible : true;

  return (
    <AnimatePresence>
      {visible && (
        <motion.a
          href="/"
          aria-label={name ? `${name} — zur Startseite` : "Zur Startseite"}
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="pointer-events-auto absolute left-5 top-5 block"
        >
          {logoSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoSrc}
              alt={name ?? ""}
              // Höhe deckelt, Breite folgt dem Seitenverhältnis — beliebige
              // Logo-Formate bleiben so in der Ecke beherrschbar.
              className="h-8 w-auto max-w-[40vw] object-contain sm:h-10"
            />
          ) : (
            <span
              style={{ textShadow: halo }}
              className="text-sm font-medium uppercase tracking-[0.25em]"
            >
              {name}
            </span>
          )}
        </motion.a>
      )}
    </AnimatePresence>
  );
}

/** Zentrale Headline (+ optionale Unterzeile), ein-/ausgeblendet je nach `heroVisible`. */
function HeroHeadline({
  text,
  subtitle,
  halo,
}: {
  text?: string;
  subtitle?: string;
  halo: string;
}) {
  const heroVisible = useGridStore((s) => s.heroVisible);
  // Beide Felder sind im Modus „fixed" frei — der Untertitel darf deshalb auch
  // ohne Headline stehen (früher hing er an `text` und verschwand mit ihr).
  if (!text && !subtitle) return null;
  // Absolut dead-center: Vollflächen-Wrapper zentriert die Headline exakt im
  // Viewport (Flex-Center statt fehleranfälliger Translate-Rechnerei).
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-6">
      <AnimatePresence>
        {heroVisible && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            style={{ textShadow: halo }}
            className="max-w-3xl text-center"
          >
            {text && (
              <h1 className="text-3xl font-extralight leading-tight tracking-[0.2em] sm:text-5xl">
                {text}
              </h1>
            )}
            {subtitle && (
              <p
                className={`text-sm font-light tracking-[0.25em] opacity-80 sm:text-base ${
                  text ? "mt-4" : ""
                }`}
              >
                {subtitle}
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Umschalter Hell/Dunkel (unten links). */
function ThemeToggleButton({ dark }: { dark: boolean }) {
  const toggle = useGridStore((s) => s.toggleThemeMode);
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "Zu hellem Design wechseln" : "Zu dunklem Design wechseln"}
      className={`pointer-events-auto absolute bottom-5 left-5 rounded-full border px-3 py-1.5 text-[11px] uppercase tracking-[0.15em] backdrop-blur transition ${
        dark
          ? "border-white/20 bg-black/40 hover:bg-black/60"
          : "border-black/25 bg-white/75 hover:bg-white/95"
      }`}
    >
      {dark ? "Hell" : "Dunkel"}
    </button>
  );
}

/**
 * Kategorie-Filter unten mittig. Bewusst dieselbe Sprache wie im Reel-Theme
 * (Pillen, „Alle" zuerst), damit die Startseite unabhängig vom gewählten Theme
 * gleich bedient wird.
 */
function GridFilterBar({
  categories,
  active,
  onChange,
  dark,
}: {
  categories: string[];
  active: string;
  onChange: (value: string) => void;
  dark: boolean;
}) {
  const options = ["all", ...categories];
  return (
    // Auf schmalen Schirmen eine Etage höher: unten links sitzt der Hell/Dunkel-
    // Umschalter, unten rechts die Socials — nebeneinander passt das erst ab sm.
    <div className="pointer-events-none absolute inset-x-0 bottom-16 flex justify-center px-4 sm:bottom-5 sm:px-24">
      <div
        className={`pointer-events-auto flex max-w-full flex-wrap justify-center gap-1 rounded-full border p-1 backdrop-blur ${
          dark ? "border-white/15 bg-black/45" : "border-black/20 bg-white/80"
        }`}
      >
        {options.map((o) => {
          const isActive = active === o;
          return (
            <button
              key={o}
              type="button"
              onClick={() => onChange(o)}
              aria-pressed={isActive}
              className={`rounded-full px-3 py-1.5 text-[11px] uppercase tracking-[0.15em] transition ${
                isActive
                  ? dark
                    ? "bg-white text-black"
                    : "bg-black text-white"
                  : "opacity-70 hover:opacity-100"
              }`}
            >
              {o === "all" ? "Alle" : o}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Burger-Menü oben rechts mit ausklappbarem Link-Panel. */
function BurgerMenu({
  items,
  socials,
  dark,
}: {
  items: { label: string; href: string; external?: boolean }[];
  /** Zweite Gruppe im Panel — nur im Modus „menu" gefüllt. */
  socials: { label: string; href: string }[];
  dark: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="pointer-events-auto absolute right-5 top-5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="Menü"
        style={{ filter: iconHalo(dark) }}
        className="flex flex-col items-end gap-1.5 p-1"
      >
        <span className="block h-px w-6 bg-current" />
        <span className={`block h-px bg-current transition-all ${open ? "w-6" : "w-4"}`} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.nav
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            aria-label="Hauptmenü"
            className={`absolute right-0 top-9 flex min-w-40 flex-col gap-1 rounded-xl border p-2 backdrop-blur ${
              dark ? "border-white/15 bg-black/75" : "border-black/15 bg-white/90"
            }`}
          >
            {items.map((it) => (
              <a
                key={it.href}
                href={it.href}
                onClick={() => setOpen(false)}
                {...(it.external ? { target: "_blank", rel: "noreferrer" } : {})}
                className="rounded-lg px-3 py-1.5 text-sm tracking-wide transition hover:bg-current/10"
              >
                {it.label}
              </a>
            ))}

            {/* Social-Links als eigene Gruppe, durch eine Linie abgesetzt —
                sie führen von der Website weg und sind deshalb keine Navigation. */}
            {socials.length > 0 && (
              <>
                {items.length > 0 && (
                  <span
                    className={`my-1 block h-px ${dark ? "bg-white/15" : "bg-black/10"}`}
                    aria-hidden
                  />
                )}
                {socials.map((s) => (
                  <a
                    key={s.href}
                    href={s.href}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => setOpen(false)}
                    className="rounded-lg px-3 py-1.5 text-[11px] uppercase tracking-[0.15em] opacity-80 transition hover:bg-current/10 hover:opacity-100"
                  >
                    {s.label}
                  </a>
                ))}
              </>
            )}
          </motion.nav>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Barrierefreie DOM-Spiegelung der Canvas (visuell versteckt, aber fokussierbar).
 * Tab → aktiviert das Bild in der Canvas (Graustufen→Farbe); Enter/Klick → Lightbox.
 */
function AccessibleGridOverlay({ images }: { images: GridImage[] }) {
  const focusImage = useGridStore((s) => s.focusImage);
  const openLightbox = useGridStore((s) => s.openLightbox);
  return (
    <ul className="sr-only" aria-label="Bildraster">
      {images.map((img) => (
        <li key={img.id}>
          <button type="button" onFocus={() => focusImage(img)} onClick={() => openLightbox(img)}>
            {img.subtitle ?? "Bild"} — öffnen
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Fertiger Loader: lädt das Theme clientseitig (`ssr:false`, Three.js raus aus SSR). */
export const OmniGridThemeLoader = dynamic(() => import("./OmniGridTheme"), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 grid place-items-center bg-black">
      <span className="animate-pulse text-3xl font-extralight tracking-[0.3em] text-white/30">
        ···
      </span>
    </div>
  ),
});
