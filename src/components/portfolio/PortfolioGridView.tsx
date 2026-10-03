"use client";

import { useEffect, useMemo, useState } from "react";
import { Gallery as PhotoSwipeGallery, Item } from "react-photoswipe-gallery";
import "photoswipe/dist/photoswipe.css";

import { pswpIcons } from "@/components/share/icons";
import { mediaUrl } from "@/lib/media";
import type { PortfolioItem } from "@/themes/schema";

type Layout = "grid" | "masonry" | "justified";

/**
 * Kuratiertes Portfolio-Raster — read-only-Variante der Kundengalerie
 * ([share/Gallery.tsx](src/components/share/Gallery.tsx)) ohne Likes/Kommentare/
 * Downloads. Fixes Kategorie-Menü (Overview + Kategorien), Klick öffnet die
 * PhotoSwipe-Lightbox. Styling erbt die aktiven Theme-Tokens (bg-canvas,
 * text-ink …), passt sich also jedem Theme an. Wird ausschließlich auf
 * Portfolio-Seiten verwendet, nie in Kunden-Alben.
 */
export function PortfolioGridView({
  title,
  items,
  columns,
  layout,
  selection,
  randomCount,
  showCategories,
  immersive = false,
}: {
  title?: string;
  items: PortfolioItem[];
  columns: number;
  layout: Layout;
  selection: "all" | "random";
  randomCount: number;
  showCategories: boolean;
  /** Vollflächige „Bilderwand" (randlos, dichtes Raster, zentriertes Menü). */
  immersive?: boolean;
}) {
  const cols = useResponsiveColumns(columns);
  const [active, setActive] = useState<string | null>(null); // null = Overview

  // Kategorien in Reihenfolge des ersten Auftretens.
  const categories = useMemo(
    () => Array.from(new Set(items.map((p) => p.category).filter((c): c is string => !!c))),
    [items],
  );

  // Overview: alle Bilder ODER eine zufällige Teilmenge. Zufall erst nach dem
  // Mount (kein Hydration-Mismatch); initial = Reihenfolge wie geliefert.
  const sig = items.map((i) => i.key).join(",");
  const [overview, setOverview] = useState<PortfolioItem[]>(items);
  useEffect(() => {
    if (selection === "random") {
      setOverview([...items].sort(() => Math.random() - 0.5).slice(0, randomCount));
    } else {
      setOverview(items);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, randomCount, sig]);

  if (items.length === 0) return null;

  const visible = active ? items.filter((p) => p.category === active) : overview;

  return (
    <section className={immersive ? "px-1 py-1 sm:px-1.5 sm:py-1.5" : "px-3 py-8 md:px-6"}>
      {title && (
        <h2
          className={
            immersive
              ? "mb-6 mt-4 text-center font-display text-4xl font-normal uppercase tracking-[0.14em] sm:text-6xl"
              : "mb-6 text-center font-display text-3xl font-light tracking-tight"
          }
        >
          {title}
        </h2>
      )}

      {showCategories && categories.length > 0 && (
        <nav
          className={`sticky top-0 z-20 mb-6 flex snap-x items-center gap-5 overflow-x-auto bg-canvas/85 py-3 backdrop-blur ${
            immersive ? "justify-start sm:justify-center" : ""
          }`}
        >
          <MenuItem
            label="Overview"
            active={active === null}
            immersive={immersive}
            onClick={() => setActive(null)}
          />
          {categories.map((c) => (
            <MenuItem
              key={c}
              label={c}
              active={active === c}
              immersive={immersive}
              onClick={() => setActive(c)}
            />
          ))}
        </nav>
      )}

      <PhotoSwipeGallery options={{ bgOpacity: 0.94, showHideAnimationType: "fade", ...pswpIcons }}>
        {layout === "grid" && (
          <div
            className="grid gap-1.5"
            style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
          >
            {visible.map((p, i) => (
              <Tile key={p.key} photo={p} square delayMs={revealDelay(i)} />
            ))}
          </div>
        )}

        {layout === "justified" && (
          <div className="flex flex-wrap gap-1.5">
            {visible.map((p, i) => {
              const ratio = p.width / Math.max(p.height, 1);
              return (
                <div
                  key={p.key}
                  style={{ flexGrow: ratio, flexBasis: `${ratio * 240}px` }}
                  className="relative h-60 sm:h-72"
                >
                  <Tile photo={p} fill delayMs={revealDelay(i)} />
                </div>
              );
            })}
            <div className="grow-[999]" />
          </div>
        )}

        {layout === "masonry" && (
          // Spalten per Round-Robin füllen → Lesereihenfolge links→rechts.
          <div className="flex gap-1.5">
            {Array.from({ length: cols }).map((_, colIdx) => (
              <div key={colIdx} className="flex flex-1 flex-col gap-1.5">
                {visible
                  .filter((_, i) => i % cols === colIdx)
                  .map((p, j) => (
                    <Tile key={p.key} photo={p} delayMs={revealDelay(j * cols + colIdx)} />
                  ))}
              </div>
            ))}
          </div>
        )}
      </PhotoSwipeGallery>
    </section>
  );
}

/** Ansteigender, gedeckelter Einblend-Delay pro Bild (gestaffelte Kaskade). */
function revealDelay(index: number): number {
  return Math.min(index, 14) * 45;
}

function Tile({
  photo,
  square,
  fill,
  delayMs = 0,
}: {
  photo: PortfolioItem;
  square?: boolean;
  fill?: boolean;
  delayMs?: number;
}) {
  const [loaded, setLoaded] = useState(false);
  const wrapperClass = square ? "relative aspect-square" : fill ? "absolute inset-0" : "relative";

  return (
    <div
      className={`group overflow-hidden bg-canvas ${wrapperClass}`}
      style={
        !square && !fill && photo.width && photo.height
          ? { aspectRatio: `${photo.width} / ${photo.height}` }
          : undefined
      }
    >
      <Item
        original={mediaUrl(photo.key, "full")}
        thumbnail={mediaUrl(photo.key, "thumb")}
        width={photo.width}
        height={photo.height}
        caption={photo.caption ?? undefined}
      >
        {({ ref, open }) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            ref={(node) => {
              if (typeof ref === "function") ref(node);
              else if (ref && "current" in ref)
                (ref as React.MutableRefObject<HTMLImageElement | null>).current = node;
              if (node?.complete && node.naturalWidth > 0) setLoaded(true);
            }}
            src={mediaUrl(photo.key, "full")}
            alt={photo.caption ?? ""}
            loading="lazy"
            onClick={open}
            onLoad={() => setLoaded(true)}
            style={{ transitionDelay: `${delayMs}ms` }}
            className={`relative z-10 w-full cursor-pointer transition-all duration-700 ease-out ${
              square || fill ? "h-full object-cover" : "h-auto"
            } ${loaded ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"}`}
          />
        )}
      </Item>

      {/* Hover-Caption (nur Desktop), editorial-dezent. */}
      {photo.caption && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 hidden bg-gradient-to-t from-black/45 to-transparent p-3 opacity-0 transition-opacity duration-200 group-hover:opacity-100 sm:block">
          <span className="text-[11px] uppercase tracking-[0.18em] text-white/90">
            {photo.caption}
          </span>
        </div>
      )}
    </div>
  );
}

/** Kategorie-Menüpunkt: Versal-Sperrung, aktiv = Ink + Unterstrich. */
function MenuItem({
  label,
  active,
  immersive,
  onClick,
}: {
  label: string;
  active: boolean;
  immersive?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`shrink-0 snap-start whitespace-nowrap pb-1 uppercase transition ${
        immersive
          ? "font-display text-xs tracking-[0.24em] sm:text-sm"
          : "text-[11px] tracking-[0.22em]"
      } ${
        active
          ? "border-b border-ink text-ink"
          : "border-b border-transparent text-muted hover:text-ink"
      }`}
    >
      {label}
    </button>
  );
}

function useResponsiveColumns(base: number): number {
  const [cols, setCols] = useState(base);
  useEffect(() => {
    const compute = () => {
      const w = window.innerWidth;
      if (w < 640) setCols(Math.min(2, base));
      else if (w < 1024) setCols(Math.min(3, base));
      else setCols(base);
    };
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, [base]);
  return cols;
}
