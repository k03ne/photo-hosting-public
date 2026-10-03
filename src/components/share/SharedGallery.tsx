import type { CSSProperties } from "react";

import { Gallery, type GalleryPhoto } from "@/components/share/Gallery";
import { ArrowDownIcon, ArrowUpIcon } from "@/components/share/icons";
import { gridEdgeClass, headerFontClass, headerLayout } from "@/lib/header-style";
import { mediaUrl } from "@/lib/media";
import { lockAlbum } from "@/server/actions/share";

/**
 * Wandelt eine Hex-Farbe in ein „H S% L%"-Tripel (für CSS-Custom-Properties, die
 * per `hsl(var(--x) / a)` genutzt werden) und liefert zugleich, ob reiner weißer
 * Text besser kontrastiert (`dark`). So treibt die individuelle Album-Hintergrund-
 * farbe die Token-Palette (`--canvas`) UND die garantiert lesbare Textfarbe.
 *
 * WICHTIG: Die Schwarz/Weiß-Grenze liegt bei relativer Luminanz ≈ 0.179 (dort ist
 * der Kontrast zu Schwarz und zu Weiß gleich), NICHT bei 0.5. Mit 0.5 bekamen
 * mittelhelle Farben fälschlich weißen Text (unlesbar).
 */
function hexToCanvas(hex: string | null): { triple: string; dark: boolean } | null {
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

  // Relative Luminanz (WCAG) für die Kontrastentscheidung.
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const lum = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);

  const triple = `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
  return { triple, dark: lum < 0.179 };
}

export function SharedGallery({
  title,
  description,
  layout,
  columns,
  gridSpacing,
  coverKey,
  coverBlurPx,
  coverOverlay,
  coverFocusX = 50,
  coverFocusY = 50,
  photos,
  shareToken,
  isProtected,
  showExif,
  headerTitlePos,
  headerAlign,
  headerFont,
  headerButton,
  headerTextColor,
  themeMode,
  bgColor,
}: {
  title: string;
  description: string | null;
  layout: "MASONRY" | "GRID" | "JUSTIFIED";
  columns: number;
  gridSpacing: string;
  coverKey: string | null;
  coverBlurPx: number;
  coverOverlay: number;
  coverFocusX?: number;
  coverFocusY?: number;
  photos: GalleryPhoto[];
  shareToken: string;
  isProtected: boolean;
  showExif: boolean;
  headerTitlePos: string;
  headerAlign: string;
  headerFont: string;
  headerButton: string;
  headerTextColor: string | null;
  themeMode: string;
  bgColor: string | null;
}) {
  const { items, justify, content } = headerLayout(headerTitlePos, headerAlign);
  const fontClass = headerFontClass(headerFont);
  const showScroll = photos.length > 0 && headerButton !== "HIDDEN";

  // Eigene Textfarbe im Header (überschreibt weiß/Ink); null = automatisch.
  const custom =
    headerTextColor && /^#[0-9a-fA-F]{6}$/.test(headerTextColor)
      ? headerTextColor
      : null;
  const textStyle = custom ? { color: custom } : undefined;

  // Individuelle Hintergrundfarbe → Token `--canvas` treiben, damit sich auch die
  // sticky Kategorien-/Download-Leiste (nutzt `bg-canvas`) mitfärbt statt auf dem
  // Default-Canvas zu bleiben.
  const canvas = hexToCanvas(bgColor);

  // Erzwungenes Theme pro Album (AUTO folgt der globalen OS-/Toggle-Wahl). Ist
  // eine eigene Farbe gesetzt, bestimmt deren Luminanz den Kontrast.
  const themeClass =
    themeMode === "DARK"
      ? "force-dark dark"
      : themeMode === "LIGHT"
        ? "force-light"
        : canvas
          ? canvas.dark
            ? "force-dark dark"
            : "force-light"
          : "";

  // GARANTIERTE Lesbarkeit auf beliebiger Album-Farbe: `--canvas` = die Farbe,
  // `--ink`/`--muted` = reines Weiß bzw. Schwarz. Reines Schwarz/Weiß erreicht
  // gegen JEDE Hintergrundfarbe mindestens AA-Kontrast (≥ 4.5:1) — ein Grau
  // könnte das nahe der Schwarz/Weiß-Grenze nicht. `--surface`/`--line` bleiben
  // aus der force-Klasse (nur Panels/Ränder, keine Text-Lesbarkeit).
  const fg = canvas ? (canvas.dark ? "0 0% 100%" : "0 0% 0%") : null;
  const mainStyle =
    canvas && fg
      ? ({ "--canvas": canvas.triple, "--ink": fg, "--muted": fg } as CSSProperties)
      : undefined;

  return (
    <main
      id="top"
      className={`min-h-screen bg-canvas ${themeClass}`}
      style={mainStyle}
    >
      <header
        className={`relative flex overflow-hidden px-6 py-[9vh] ${items} ${justify} ${
          coverKey
            ? "h-[100svh] min-h-[560px]"
            : "min-h-[42vh] border-b bg-canvas"
        }`}
      >
        {coverKey && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={mediaUrl(coverKey, "full")}
              alt=""
              className={`absolute inset-0 h-full w-full object-cover ${
                coverBlurPx > 0 ? "scale-110" : ""
              }`}
              style={{
                objectPosition: `${coverFocusX}% ${coverFocusY}%`,
                ...(coverBlurPx > 0 ? { filter: `blur(${coverBlurPx}px)` } : {}),
              }}
            />
            <div
              className="absolute inset-0 bg-black"
              style={{ opacity: Math.min(coverOverlay, 70) / 100 }}
            />
          </>
        )}

        <div
          className={`relative z-10 flex max-w-3xl flex-col ${content} ${
            custom ? "" : coverKey ? "text-white" : "text-ink"
          }`}
          style={textStyle}
        >
          <h1
            className={`${fontClass} text-3xl uppercase tracking-[0.22em] drop-shadow-sm sm:text-5xl sm:tracking-[0.28em]`}
          >
            {title}
          </h1>
          {description && (
            <p
              className={`mt-5 max-w-xl text-sm font-light tracking-wide ${
                custom
                  ? "opacity-90"
                  : coverKey
                    ? "text-white/85"
                    : "text-muted"
              }`}
            >
              {description}
            </p>
          )}

          {showScroll && headerButton === "UNDER" && (
            <a
              href="#galerie"
              className={`mt-8 inline-flex items-center gap-1.5 border-b pb-1 text-[11px] uppercase tracking-[0.2em] transition hover:opacity-60 ${
                custom
                  ? "border-current"
                  : coverKey
                    ? "border-white text-white"
                    : "border-ink text-ink"
              }`}
            >
              Zur Galerie
              <ArrowDownIcon className="h-3.5 w-3.5" />
            </a>
          )}
        </div>

        {showScroll && headerButton === "BOTTOM" && (
          <a
            href="#galerie"
            className={`absolute bottom-6 left-1/2 z-10 inline-flex -translate-x-1/2 items-center gap-1.5 border-b pb-1 text-[11px] uppercase tracking-[0.2em] transition hover:opacity-60 ${
              custom
                ? "border-current"
                : coverKey
                  ? "border-white text-white"
                  : "border-ink text-ink"
            }`}
            style={textStyle}
          >
            Zur Galerie
            <ArrowDownIcon className="h-3.5 w-3.5" />
          </a>
        )}
      </header>

      <div
        id="galerie"
        className={`w-full scroll-mt-4 pb-14 pt-8 ${gridEdgeClass(gridSpacing)}`}
      >
        {photos.length === 0 ? (
          <p className="py-20 text-center text-sm text-muted">
            Dieses Album ist noch leer.
          </p>
        ) : (
          <Gallery
            photos={photos}
            layout={layout}
            columns={columns}
            spacing={gridSpacing}
            shareToken={shareToken}
            showExif={showExif}
            // Hell/Dunkel-Umschalter nur bei Auto(OS): erzwungenes Theme oder
            // eine feste Hintergrundfarbe machen den Umschalter wirkungslos.
            showThemeToggle={themeMode === "AUTO" && !bgColor}
          />
        )}
      </div>

      <footer className="flex flex-col items-center gap-5 border-t pt-10">
        {photos.length > 0 && (
          <a
            href="#galerie"
            className="inline-flex items-center gap-1.5 border-b border-ink pb-1 text-[11px] uppercase tracking-[0.2em] text-ink transition hover:opacity-60"
          >
            <ArrowUpIcon className="h-3.5 w-3.5" />
            Nach oben
          </a>
        )}
        {isProtected && (
          <form action={lockAlbum.bind(null, shareToken)}>
            <button
              type="submit"
              className="text-[11px] uppercase tracking-[0.2em] text-muted transition hover:text-ink"
            >
              Abmelden
            </button>
          </form>
        )}

        {/* Copyright ganz unten auf der Seite */}
        <p className="mt-6 w-full border-t pb-8 pt-8 text-center text-[11px] tracking-[0.15em] text-muted">
          © {new Date().getFullYear()} Andreas König
        </p>
      </footer>
    </main>
  );
}
