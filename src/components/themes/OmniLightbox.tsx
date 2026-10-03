"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { useGridStore } from "@/store/useGridStore";

/**
 * DOM-Lightbox des OmniGrid-Themes (getrennt von `share/LightboxOverlay.tsx`,
 * das die PhotoSwipe-Gastgalerie bedient). Framer-Motion-Ein-/Ausblendung mit:
 *  - radialem Verlaufs-Backdrop (Zentrum hell → Rand dunkel),
 *  - scharfen, rechtwinkligen Bildecken (bewusst KEINE Rundung),
 *  - Schließen-Button oben rechts + optionaler Bildunterschrift unter dem Bild.
 * Behält Fokusfang (Esc/Backdrop schließt, Fokus-Rückgabe) für WCAG bei.
 */
export function OmniLightbox() {
  const item = useGridStore((s) => s.lightboxItem);
  const close = useGridStore((s) => s.closeLightbox);
  const closeRef = useRef<HTMLButtonElement>(null);
  const restoreRef = useRef<Element | null>(null);

  useEffect(() => {
    if (!item) return;
    restoreRef.current = document.activeElement;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      (restoreRef.current as HTMLElement | null)?.focus?.();
    };
  }, [item, close]);

  return (
    <AnimatePresence>
      {item && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label={item.subtitle ?? "Bild"}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.32, ease: "easeOut" }}
          onClick={close}
          className="fixed inset-0 z-50 flex items-center justify-center p-6 backdrop-blur-md sm:p-10"
          // Weicher Radialverlauf: Zentrum leicht transluzent, Ränder fast schwarz.
          style={{
            background:
              "radial-gradient(circle at center, rgba(8,8,10,0.72) 0%, rgba(4,4,6,0.9) 55%, rgba(0,0,0,0.97) 100%)",
          }}
        >
          <motion.figure
            initial={{ scale: 0.94, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.94, opacity: 0 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-full max-w-4xl flex-col items-center gap-4"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {/* Scharfe 90°-Ecken: bewusst KEIN border-radius. */}
            <img
              src={item.full}
              alt={item.subtitle ?? ""}
              className="max-h-[82vh] w-auto max-w-full object-contain shadow-2xl"
            />
            {item.subtitle && (
              <figcaption className="text-center text-sm tracking-wide text-white/70">
                {item.subtitle}
              </figcaption>
            )}
          </motion.figure>

          <button
            ref={closeRef}
            type="button"
            onClick={close}
            aria-label="Schließen"
            className="absolute right-5 top-5 rounded-full border border-white/20 bg-black/40 px-3 py-2 text-sm text-white backdrop-blur transition hover:bg-black/70"
          >
            ✕
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
