"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { mediaUrl } from "@/lib/media";
import { TagCombobox } from "@/components/admin/TagCombobox";
import { setPhotosPortfolioCategoryGlobal, setPhotosPublic } from "@/server/actions/photos";

export type MediaItem = {
  id: string;
  storageKey: string;
  blurDataUrl: string | null;
  albumTitle: string;
  /** Effektive Portfolio-Kategorie (Bild-Override ODER Album-Genre). */
  category: string | null;
  /** true = eigenes Override; false = geerbt vom Album. */
  hasOwnCategory: boolean;
  isPublic: boolean;
  /** true = Platzhalter aus dem Demo-Import (Unsplash), kein echtes Bild. */
  isDemo: boolean;
};

// Raster-Größen (klein → groß). Volle Klassenstrings, damit Tailwind sie behält.
const GRID_SIZES = [
  "grid-cols-3 sm:grid-cols-5 lg:grid-cols-7 xl:grid-cols-9",
  "grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7",
  "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5",
  "grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
  "grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3",
] as const;
const DEFAULT_SIZE = 2;
const SIZE_KEY = "mediaGridSize";

/** Filterbares Foto-Raster der gesamten Mediathek mit Einzel-/Bulk-Freigabe. */
export function MediaLibrary({
  photos,
  categories,
}: {
  photos: MediaItem[];
  categories: string[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const [cat, setCat] = useState("");
  // Raster-Größe (Index in GRID_SIZES), in localStorage gemerkt.
  const [sizeIdx, setSizeIdx] = useState(DEFAULT_SIZE);
  useEffect(() => {
    const raw = Number(window.localStorage.getItem(SIZE_KEY));
    if (Number.isInteger(raw) && raw >= 0 && raw < GRID_SIZES.length) setSizeIdx(raw);
  }, []);
  function changeSize(idx: number) {
    setSizeIdx(idx);
    window.localStorage.setItem(SIZE_KEY, String(idx));
  }

  // Bereichsauswahl per Ziehen (Lese-Reihenfolge). anchor = Start-Index; base =
  // Auswahl-Schnappschuss bei Drag-Beginn (für additives Ziehen mit Modifier).
  const anchorRef = useRef<number | null>(null);
  const baseRef = useRef<Set<string>>(new Set());
  const draggingRef = useRef(false);

  // Ziehen endet überall (auch außerhalb des Rasters).
  useEffect(() => {
    const end = () => {
      draggingRef.current = false;
    };
    window.addEventListener("pointerup", end);
    return () => window.removeEventListener("pointerup", end);
  }, []);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // Auswahl vom Anker bis `index` (in Lese-Reihenfolge) auf `base` anwenden.
  function selectRange(index: number) {
    const anchor = anchorRef.current;
    if (anchor === null) return;
    const [lo, hi] = anchor <= index ? [anchor, index] : [index, anchor];
    const next = new Set(baseRef.current);
    for (let i = lo; i <= hi; i++) next.add(photos[i].id);
    setSelected(next);
  }

  // Drag-Beginn auf einer Kachel: Anker setzen, Basis je nach Modifier.
  function startSelect(index: number, additive: boolean) {
    anchorRef.current = index;
    baseRef.current = additive ? new Set(selected) : new Set();
    draggingRef.current = true;
    selectRange(index);
  }

  // Ziehen über eine weitere Kachel erweitert den Bereich.
  function enterSelect(index: number) {
    if (!draggingRef.current) return;
    selectRange(index);
  }

  function apply(ids: string[], value: boolean) {
    if (ids.length === 0) return;
    startTransition(async () => {
      await setPhotosPublic(ids, value);
      setSelected(new Set());
      router.refresh();
    });
  }

  /** Portfolio-Kategorie der Auswahl zuweisen (leer = auf Album-Genre zurück). */
  function applyCategory(value: string) {
    const ids = [...selected];
    if (ids.length === 0) return;
    startTransition(async () => {
      await setPhotosPortfolioCategoryGlobal(ids, value.trim());
      setSelected(new Set());
      setCat("");
      router.refresh();
    });
  }

  if (photos.length === 0) {
    return (
      <div className="card grid place-items-center border-dashed p-16 text-center">
        <p className="text-sm text-muted">Keine Bilder für diese Filter.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Bulk-Leiste */}
      {selected.size > 0 && (
        <div className="sticky top-16 z-20 flex flex-wrap items-center gap-3 rounded-xl border bg-canvas/90 px-4 py-3 backdrop-blur">
          <span className="text-sm font-medium">{selected.size} ausgewählt</span>
          <button
            type="button"
            disabled={pending}
            onClick={() => apply([...selected], true)}
            className="btn-accent py-1.5 disabled:opacity-50"
          >
            Öffentlich machen
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => apply([...selected], false)}
            className="btn-ghost py-1.5 disabled:opacity-50"
          >
            Privat machen
          </button>

          {/* Portfolio-Kategorie zuweisen (Mischalben-Override) */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              applyCategory(cat);
            }}
            className="flex w-full flex-wrap items-center gap-1 sm:w-auto"
          >
            <div className="w-full min-w-0 flex-1 sm:w-44 sm:flex-none">
              <TagCombobox
                value={cat}
                onChange={setCat}
                options={categories}
                placeholder="Portfolio-Kategorie…"
                clearLabel="Album-Kategorie verwenden"
                emptyHint="Noch keine Portfolio-Kategorien — tippe eine neue."
                inputClassName="input h-9 w-full py-1 text-sm"
              />
            </div>
            <button
              type="submit"
              disabled={pending}
              className="btn-ghost py-1.5 disabled:opacity-50"
            >
              Zuweisen
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => applyCategory("")}
              className="text-sm text-muted underline hover:text-ink disabled:opacity-50"
              title="Override entfernen — fällt auf die Album-Kategorie zurück"
            >
              Zurücksetzen
            </button>
          </form>

          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="ml-auto text-sm text-muted underline hover:text-ink"
          >
            Auswahl aufheben
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        {selected.size === 0 ? (
          <p className="text-xs text-muted">
            Ziehen zum Auswählen (ganze Reihen beim Runterziehen) · Shift/⌘ zum Hinzufügen ·
            Häkchen für einzelne Bilder
          </p>
        ) : (
          <span />
        )}

        {/* Raster-Größe */}
        <label className="flex shrink-0 items-center gap-2 text-xs text-muted">
          <span className="hidden sm:inline">Größe</span>
          <span aria-hidden className="text-[10px]">
            ▪
          </span>
          <input
            type="range"
            min={0}
            max={GRID_SIZES.length - 1}
            value={sizeIdx}
            onChange={(e) => changeSize(Number(e.target.value))}
            aria-label="Raster-Größe"
            className="w-24 accent-[hsl(var(--accent))]"
          />
          <span aria-hidden className="text-base">
            ◼
          </span>
        </label>
      </div>

      <div className={`grid select-none gap-3 ${GRID_SIZES[sizeIdx]}`}>
        {photos.map((p, index) => {
          const isSel = selected.has(p.id);
          return (
            <div
              key={p.id}
              onPointerDown={(e) => {
                // Nur primäre Maustaste / Touch; Ziehen = Bereichsauswahl.
                if (e.button !== 0) return;
                e.preventDefault();
                startSelect(index, e.shiftKey || e.metaKey || e.ctrlKey);
              }}
              onPointerEnter={() => enterSelect(index)}
              className={`group relative cursor-pointer touch-none overflow-hidden rounded-lg border transition ${
                isSel ? "ring-2 ring-blue-500" : ""
              }`}
            >
              {/* Auswahl-Checkbox */}
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => toggleSelect(p.id)}
                aria-pressed={isSel}
                aria-label="Auswählen"
                className={`absolute left-2 top-2 z-10 grid h-6 w-6 place-items-center rounded-full border text-xs ${
                  isSel ? "border-blue-500 bg-blue-500 text-white" : "border-white/70 bg-black/30 text-white"
                }`}
              >
                {isSel ? "✓" : ""}
              </button>

              {/* Platzhalter kennzeichnen, damit sie im Raster nicht mit echten
                  Bildern verwechselt werden. */}
              {p.isDemo && (
                <span
                  className="absolute right-2 top-2 z-10 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white"
                  title="Platzhalter aus dem Demo-Import"
                >
                  Demo
                </span>
              )}

              {/* Thumbnail — vollständiges Bild (unbeschnitten); Ränder in einer
                  neutralen, leicht abgesetzten Fläche (kein Blur). */}
              <div className="aspect-square w-full bg-neutral-100 dark:bg-neutral-800">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={mediaUrl(p.storageKey, "thumb")}
                  alt=""
                  loading="lazy"
                  draggable={false}
                  className="h-full w-full object-contain"
                />
              </div>

              {/* Footer: Album/Kategorie + Freigabe-Toggle */}
              <div className="flex items-center justify-between gap-2 px-2 py-2">
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium">{p.albumTitle}</p>
                  {p.category && (
                    <p
                      className={`truncate text-[11px] text-muted ${p.hasOwnCategory ? "" : "italic opacity-70"}`}
                      title={p.hasOwnCategory ? "Eigene Portfolio-Kategorie" : "Vom Album geerbt"}
                    >
                      {p.category}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  disabled={pending}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => apply([p.id], !p.isPublic)}
                  className={`chip shrink-0 px-2 py-1 text-[11px] transition disabled:opacity-50 ${
                    p.isPublic
                      ? "bg-accent text-[hsl(var(--accent-ink))]"
                      : "border text-muted hover:border-ink"
                  }`}
                  title={p.isPublic ? "Für Seiten freigegeben" : "Nicht freigegeben"}
                >
                  {p.isPublic ? "Öffentlich" : "Privat"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
