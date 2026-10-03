"use client";

import { useEffect } from "react";

/**
 * Aktiviert Lenis-Smooth-Scroll für die öffentliche Website (weiches,
 * trägheitsbehaftetes Scrollen — Grundlage der scroll-getriebenen Hero-Reveals).
 * Rendert selbst nichts. Bei `prefers-reduced-motion` bleibt natives Scrollen
 * aktiv. Lenis wird dynamisch geladen, damit es nicht im Basis-Bundle landet.
 */
export function SmoothScroll() {
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    let raf = 0;
    let lenis: import("lenis").default | undefined;
    let disposed = false;

    (async () => {
      const Lenis = (await import("lenis")).default;
      if (disposed) return;
      lenis = new Lenis({
        lerp: 0.09, // Trägheit — kleiner = weicher/langsamer
        wheelMultiplier: 1,
        smoothWheel: true,
      });
      const loop = (time: number) => {
        lenis?.raf(time);
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    })();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      lenis?.destroy();
    };
  }, []);

  return null;
}
