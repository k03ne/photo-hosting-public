"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { mediaUrl } from "@/lib/media";
import type { HeroScatterItem } from "@/themes/schema";

type Props = {
  title: string;
  subtitle?: string;
  items: HeroScatterItem[];
  /** 0..1 — Feinsteuerung der Parallax-Spreizung zwischen den Spalten. */
  intensity: number;
};

/** Spaltenzahl der Bilderwand (mobil halbiert per CSS-Grid). */
const COLS = 4;
/** Kopien je Spalte für die nahtlose Endlos-Schleife (min. 3 füllen 100vh). */
const COPIES = 3;
/** Scrollhöhe des Hero — bestimmt, wie lange die Endlos-Wall „läuft". */
const STAGE_VH = 600;

/**
 * Startseiten-Hero („immersive"): großer Display-Wortmark über einer endlosen
 * Bilderwand. Beim Laden fächern Text und erste Bilder automatisch auf; beim
 * Scrollen (Lenis) laufen die Spalten mit leicht unterschiedlicher Geschwindig-
 * keit weiter und wiederholen sich nahtlos (Modulo-Transform) — es „endet" nie.
 * Der Wortmark scrollt über die erste Bildschirmhöhe sanft aus dem Bild.
 * Bei `prefers-reduced-motion`/No-JS: statische, ruhige Bilderwand (SSR).
 */
export function HeroScatterView({ title, subtitle, items, intensity }: Props) {
  const wordmarkRef = useRef<HTMLDivElement>(null);
  const colRefs = useRef<(HTMLDivElement | null)[]>([]);
  const setHeights = useRef<number[]>([]);
  const [intro, setIntro] = useState(false);
  const [reduced, setReduced] = useState(false);

  const hasImages = items.length > 0;

  // Bilder rundlaufend auf die Spalten verteilen (stabil pro Item-Set).
  const columns = useMemo(() => {
    const cols: HeroScatterItem[][] = Array.from({ length: COLS }, () => []);
    items.forEach((it, i) => cols[i % COLS].push(it));
    // Leere Spalten (sehr wenige Bilder) mit dem Pool auffüllen.
    return cols.map((c) => (c.length ? c : items));
  }, [items]);

  // Parallax-Geschwindigkeit je Spalte: um 1.0 gestreut, je nach intensity.
  const speeds = useMemo(
    () => columns.map((_, i) => 1 + (i - (COLS - 1) / 2) * (0.06 + intensity * 0.14)),
    [columns, intensity],
  );

  // Auto-Auffächern nach dem ersten Paint auslösen (CSS-Transition).
  useEffect(() => {
    const id = requestAnimationFrame(() => setIntro(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    if (!hasImages) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setReduced(true);
      return;
    }

    const measure = () => {
      setHeights.current = colRefs.current.map((el) => {
        const set = el?.querySelector("[data-set]") as HTMLElement | null;
        return set?.offsetHeight ?? 1;
      });
    };
    measure();

    let raf = 0;
    const loop = () => {
      const y = window.scrollY;
      colRefs.current.forEach((el, i) => {
        if (!el) return;
        const sh = setHeights.current[i] || 1;
        const off = y * speeds[i];
        const wrapped = ((off % sh) + sh) % sh; // 0..sh, nahtlos
        el.style.transform = `translate3d(0, ${-wrapped}px, 0)`;
      });
      const wm = wordmarkRef.current;
      if (wm) {
        const vh = window.innerHeight || 1;
        wm.style.transform = `translate3d(0, ${-y * 0.5}px, 0)`;
        wm.style.opacity = String(Math.max(0, 1 - y / (vh * 0.75)));
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    window.addEventListener("resize", measure);
    // Bilder laden verändert die Set-Höhe → nachmessen.
    window.addEventListener("load", measure);
    const remeasure = setTimeout(measure, 600);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(remeasure);
      window.removeEventListener("resize", measure);
      window.removeEventListener("load", measure);
    };
  }, [hasImages, speeds]);

  // Ohne Bilder: ruhiger, rein typografischer Vollflächen-Titel.
  if (!hasImages) {
    return (
      <section className="relative flex min-h-[92svh] items-center justify-center overflow-hidden bg-canvas px-[4vw]">
        <Wordmark title={title} subtitle={subtitle} intro={intro} />
      </section>
    );
  }

  return (
    <section className="relative bg-canvas" style={{ height: reduced ? "auto" : `${STAGE_VH}vh` }}>
      <div
        className={`overflow-hidden bg-canvas ${
          reduced ? "relative min-h-[100svh]" : "sticky top-0 h-[100svh]"
        }`}
      >
        {/* Endlose Bilderwand */}
        <div className="grid h-full grid-cols-2 gap-x-[1.4vw] px-[1.4vw] sm:grid-cols-4">
          {columns.map((col, ci) => (
            <div
              key={ci}
              // Mobil nur die ersten 2 Spalten zeigen (2-spaltige Wall).
              className={`relative overflow-hidden ${ci >= 2 ? "hidden sm:block" : "block"}`}
            >
              <div
                ref={(el) => {
                  colRefs.current[ci] = el;
                }}
                className="will-change-transform"
                style={{
                  // Intro: Spalten fächern gestaffelt von unten ein.
                  transition: "opacity 900ms ease, translate 1100ms cubic-bezier(.2,.7,.2,1)",
                  transitionDelay: `${ci * 90}ms`,
                  opacity: intro ? 1 : 0,
                  translate: intro ? "0 0" : "0 8vh",
                }}
              >
                {Array.from({ length: reduced ? 1 : COPIES }).map((_, copy) => (
                  <div
                    key={copy}
                    data-set={copy === 0 ? true : undefined}
                    className="flex flex-col gap-y-[1.4vw] pb-[1.4vw]"
                  >
                    {col.map((item, ii) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={`${item.key}-${ii}`}
                        src={mediaUrl(item.key, "full")}
                        alt=""
                        loading={copy === 0 && ii < 2 ? "eager" : "lazy"}
                        // Originalformat beibehalten: natürliches Seitenverhältnis,
                        // kein Zuschnitt. aspectRatio reserviert den Platz vorab
                        // (kein Layout-Shift → korrekte Set-Höhenmessung).
                        className="block h-auto w-full"
                        style={{
                          aspectRatio:
                            item.width && item.height ? item.width / item.height : undefined,
                          ...(item.blurDataUrl
                            ? { backgroundImage: `url(${item.blurDataUrl})`, backgroundSize: "cover" }
                            : {}),
                        }}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Wortmark über der Wand — scrollt über die erste Bildschirmhöhe aus. */}
        <div
          ref={wordmarkRef}
          className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center"
        >
          <Wordmark title={title} subtitle={subtitle} intro={intro} />
        </div>
      </div>
    </section>
  );
}

/** Großer Display-Wortmark (Cormorant) mittig; optional Subline. Fächert beim
 *  Laden auf (Spreizung des Trackings + Einblenden). */
function Wordmark({
  title,
  subtitle,
  intro,
}: {
  title: string;
  subtitle?: string;
  intro: boolean;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-[3vw] text-center">
      <h1
        className="font-display font-light uppercase leading-[0.82] text-ink [font-size:clamp(2.75rem,13vw,15rem)]"
        style={{
          transition: "opacity 1000ms ease, letter-spacing 1200ms cubic-bezier(.2,.7,.2,1)",
          opacity: intro ? 1 : 0,
          letterSpacing: intro ? "0.01em" : "0.32em",
        }}
      >
        {title}
      </h1>
      {subtitle && (
        <p
          className="mt-[3vh] text-[0.7rem] uppercase tracking-[0.35em] text-muted sm:text-xs"
          style={{ transition: "opacity 1200ms ease 300ms", opacity: intro ? 1 : 0 }}
        >
          {subtitle}
        </p>
      )}
    </div>
  );
}
