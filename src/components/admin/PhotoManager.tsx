"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AnimatePresence, motion } from "framer-motion";

import type { PhotoExif } from "@/components/share/Gallery";
import { TagCombobox } from "@/components/admin/TagCombobox";
import { formatBytes } from "@/lib/format-bytes";
import { mediaUrl } from "@/lib/media";
import {
  deletePhoto,
  deletePhotos,
  removeRaw,
  reorderPhotos,
  restorePhotos,
  setCoverPhoto,
  setPhotoCategories,
  setPhotoPortfolioCategories,
  setPhotosCategory,
  setPhotosFavorite,
  setPhotosPortfolioCategory,
  updatePhoto,
} from "@/server/actions/photos";

// Persistierbare Auto-Sortierung: Feld + Richtung.
type SortField = "category" | "name" | "date";
type SortDir = "asc" | "desc";

// Raster-Größen (klein → groß). Volle Klassenstrings, damit Tailwind sie behält.
const GRID_SIZES = [
  "grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10",
  "grid-cols-3 sm:grid-cols-5 md:grid-cols-7 lg:grid-cols-8",
  "grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-6",
  "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5",
  "grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4",
] as const;
const GRID_DEFAULT = 2;
const GRID_KEY = "albumGridSize";

// Ein rückgängig machbarer Schritt. Der Stack lebt clientseitig, solange die
// Seite offen ist (LIFO). Löschungen sind dank Soft-Delete wiederherstellbar.
type UndoEntry =
  | { kind: "reorder"; label: string; order: string[] }
  | {
      kind: "category";
      label: string;
      prev: { id: string; category: string | null }[];
    }
  | {
      kind: "portfolioCategory";
      label: string;
      prev: { id: string; portfolioCategory: string | null }[];
    }
  | {
      kind: "favorite";
      label: string;
      prev: { id: string; isFavorite: boolean }[];
    }
  | {
      kind: "delete";
      label: string;
      photos: ManagedPhoto[];
      order: string[]; // Vollreihenfolge vor dem Löschen (zum Wiederherstellen)
      cover: string | null;
    };

/** Sortiert eine Fotokopie nach Feld/Richtung (stabil, für die Auto-Sortierung). */
function sortPhotos(
  list: ManagedPhoto[],
  field: SortField,
  dir: SortDir,
): ManagedPhoto[] {
  const factor = dir === "asc" ? 1 : -1;
  const collator = new Intl.Collator("de", { numeric: true, sensitivity: "base" });
  return [...list].sort((a, b) => {
    let cmp = 0;
    if (field === "name") {
      cmp = collator.compare(a.originalName, b.originalName);
    } else if (field === "date") {
      // Ohne Aufnahmedatum ans Ende (unabhängig von der Richtung).
      const ta = a.takenAt ? Date.parse(a.takenAt) : null;
      const tb = b.takenAt ? Date.parse(b.takenAt) : null;
      if (ta === null && tb === null) cmp = 0;
      else if (ta === null) return 1;
      else if (tb === null) return -1;
      else cmp = ta - tb;
    } else {
      // Kategorie alphabetisch; „ohne Kategorie" ans Ende. Innerhalb gleicher
      // Kategorie nach Dateiname, damit die Reihenfolge deterministisch ist.
      const ca = a.category ?? "";
      const cb = b.category ?? "";
      if (ca !== cb) {
        if (!ca) return 1;
        if (!cb) return -1;
        cmp = collator.compare(ca, cb);
      } else {
        cmp = collator.compare(a.originalName, b.originalName);
      }
    }
    return cmp * factor;
  });
}

/** Metadaten-Block im Editor: Abmessungen + verfügbare EXIF-Werte. */
function PhotoMeta({ photo }: { photo: ManagedPhoto }) {
  const e = photo.exif;
  const megapixel = ((photo.width * photo.height) / 1_000_000).toFixed(1);
  const rows: { label: string; value: string }[] = [
    { label: "Abmessungen", value: `${photo.width} × ${photo.height} px` },
    { label: "Auflösung", value: `${megapixel} MP` },
  ];
  if (photo.originalSizeBytes) {
    rows.push({ label: "Dateigröße", value: formatBytes(photo.originalSizeBytes) });
  }
  if (photo.takenAt) {
    rows.push({
      label: "Aufgenommen",
      value: new Date(photo.takenAt).toLocaleString("de-DE", {
        dateStyle: "medium",
        timeStyle: "short",
      }),
    });
  }
  if (e?.camera) rows.push({ label: "Kamera", value: e.camera });
  if (e?.lens) rows.push({ label: "Objektiv", value: e.lens });
  if (e?.focalLength) rows.push({ label: "Brennweite", value: `${e.focalLength} mm` });
  if (e?.aperture) rows.push({ label: "Blende", value: `f/${e.aperture}` });
  if (e?.exposure) rows.push({ label: "Belichtung", value: e.exposure });
  if (e?.iso) rows.push({ label: "ISO", value: String(e.iso) });

  return (
    <div className="space-y-2 rounded-xl border p-3">
      <p className="label">Metadaten</p>
      <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1 text-sm">
        {rows.map((r) => (
          <div key={r.label} className="contents">
            <dt className="text-muted">{r.label}</dt>
            <dd className="text-right text-ink">{r.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export type ManagedPhoto = {
  id: string;
  storageKey: string;
  mediaType: string; // IMAGE | VIDEO
  caption: string | null;
  category: string | null; // Galerie-Gruppe (Kundengalerie-Tabs)
  portfolioCategory: string | null; // Portfolio-Kategorie-Override (Mischalben)
  isFavorite: boolean;
  blurDataUrl: string | null;
  originalName: string;
  originalSizeBytes: number | null;
  rawName: string | null;
  rawSizeBytes: number | null;
  width: number;
  height: number;
  takenAt: string | null;
  exif: PhotoExif | null;
};

export function PhotoManager({
  albumId,
  coverPhotoId,
  photos: initial,
}: {
  albumId: string;
  coverPhotoId: string | null;
  photos: ManagedPhoto[];
}) {
  const router = useRouter();
  const [photos, setPhotos] = useState(initial);
  const [coverId, setCoverId] = useState(coverPhotoId);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filterCategory, setFilterCategory] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField | "manual">("manual");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  // Primäre Ziehen-Geste: "sort" = Kacheln umsortieren, "select" = Bereichsauswahl.
  const [mode, setMode] = useState<"sort" | "select">("sort");
  // Raster-Größe (Index in GRID_SIZES), in localStorage gemerkt.
  const [sizeIdx, setSizeIdx] = useState(GRID_DEFAULT);
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);
  const [undoing, setUndoing] = useState(false);
  const lastIndexRef = useRef<number | null>(null);
  // Beim „Malen": true = auswählen, false = abwählen, null = inaktiv.
  const paintRef = useRef<null | boolean>(null);
  // Bereichsauswahl per Ziehen (Lese-Reihenfolge). anchor = Start; base =
  // Auswahl-Schnappschuss bei Drag-Beginn (für additives Ziehen mit Modifier).
  const rangeAnchorRef = useRef<number | null>(null);
  const rangeBaseRef = useRef<Set<string>>(new Set());
  const rangeDraggingRef = useRef(false);
  const [, startTransition] = useTransition();

  // Nach einem `router.refresh()` (z.B. neue/ersetzte Uploads) liefert der
  // Server frische Props. Da `photos` ein eigener State ist, muss er neu
  // geseedet werden, sobald sich der Bestand tatsächlich ändert — sonst würden
  // neue Bilder erst nach vollständigem Reload erscheinen. Die Signatur aus
  // ID + storageKey erfasst Hinzufügen, Löschen und Ersetzen (beim Ersetzen
  // ändert sich der storageKey); reines Drag-Umsortieren lässt sie unberührt.
  const initialSig = initial.map((p) => `${p.id}:${p.storageKey}`).join("|");
  const sigRef = useRef(initialSig);
  useEffect(() => {
    if (sigRef.current === initialSig) return;
    sigRef.current = initialSig;
    setPhotos(initial);
    setCoverId(coverPhotoId);
    setSelected(new Set()); // IDs könnten weggefallen sein
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSig]);

  const categories = Array.from(
    new Set(photos.map((p) => p.category).filter((c): c is string => !!c)),
  );
  const hasUncategorized = photos.some((p) => !p.category);
  // Bekannte Portfolio-Kategorien (für Autovervollständigung der Vorschläge).
  const portfolioCategories = Array.from(
    new Set(photos.map((p) => p.portfolioCategory).filter((c): c is string => !!c)),
  );

  // Gefilterte Ansicht (nur Anzeige). "__none__" = ohne Kategorie.
  const visible =
    filterCategory === "__none__"
      ? photos.filter((p) => !p.category)
      : filterCategory
        ? photos.filter((p) => p.category === filterCategory)
        : photos;
  // Per Drag umsortieren nur im Sortier-Modus und in der ungefilterten
  // Vollansicht (sonst wäre die gespeicherte Reihenfolge relativ zu einer
  // Teilmenge mehrdeutig).
  const canReorder = mode === "sort" && filterCategory === null;

  // Ziehen (Malen/Bereich) bei Loslassen überall beenden.
  useEffect(() => {
    const end = () => {
      paintRef.current = null;
      rangeDraggingRef.current = false;
    };
    window.addEventListener("pointerup", end);
    return () => window.removeEventListener("pointerup", end);
  }, []);

  // Gemerkte Raster-Größe laden.
  useEffect(() => {
    const raw = Number(window.localStorage.getItem(GRID_KEY));
    if (Number.isInteger(raw) && raw >= 0 && raw < GRID_SIZES.length) setSizeIdx(raw);
  }, []);
  function changeSize(idx: number) {
    setSizeIdx(idx);
    window.localStorage.setItem(GRID_KEY, String(idx));
  }

  function pushUndo(entry: UndoEntry) {
    setUndoStack((s) => [...s, entry].slice(-50));
  }

  // Klick aufs Häkchen: startet Auswahl/Abwahl (und Malen-Modus).
  // Shift wählt einen Bereich ab dem zuletzt angeklickten Bild (in der Ansicht).
  function startPaint(id: string, index: number, shift: boolean) {
    if (shift && lastIndexRef.current !== null) {
      const from = lastIndexRef.current;
      setSelected((prev) => {
        const next = new Set(prev);
        const [a, b] = [from, index].sort((x, y) => x - y);
        for (let i = a; i <= b; i++) next.add(visible[i].id);
        return next;
      });
      return;
    }
    setSelected((prev) => {
      const next = new Set(prev);
      const target = !next.has(id);
      paintRef.current = target;
      if (target) next.add(id);
      else next.delete(id);
      return next;
    });
    lastIndexRef.current = index;
  }

  // Ziehen über weitere Kacheln übernimmt den Malen-Zustand.
  function paintOver(id: string) {
    if (paintRef.current === null) return;
    const target = paintRef.current;
    setSelected((prev) => {
      const next = new Set(prev);
      if (target) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  // Bereichsauswahl (Auswahl-Modus): Anker bis `index` in Lese-Reihenfolge der
  // sichtbaren Kacheln; `base` erlaubt additives Ziehen mit Modifier.
  function rangeSelectTo(index: number) {
    const anchor = rangeAnchorRef.current;
    if (anchor === null) return;
    const [lo, hi] = anchor <= index ? [anchor, index] : [index, anchor];
    const next = new Set(rangeBaseRef.current);
    for (let i = lo; i <= hi; i++) next.add(visible[i].id);
    setSelected(next);
  }

  function rangeStart(index: number, additive: boolean) {
    rangeAnchorRef.current = index;
    rangeBaseRef.current = additive ? new Set(selected) : new Set();
    rangeDraggingRef.current = true;
    rangeSelectTo(index);
  }

  function rangeEnter(index: number) {
    if (rangeDraggingRef.current) rangeSelectTo(index);
  }

  async function bulkCategory(category: string) {
    const ids = [...selected];
    if (ids.length === 0) return;
    const cat = category.trim();
    const prev = photos
      .filter((p) => selected.has(p.id))
      .map((p) => ({ id: p.id, category: p.category }));
    pushUndo({ kind: "category", label: "Gruppe geändert", prev });
    setPhotos((all) =>
      all.map((p) => (selected.has(p.id) ? { ...p, category: cat || null } : p)),
    );
    setSelected(new Set());
    await setPhotosCategory(albumId, ids, cat);
  }

  // Portfolio-Kategorie der Auswahl setzen (Mischalben-Override) — optimistisch + Undo.
  async function bulkPortfolioCategory(category: string) {
    const ids = [...selected];
    if (ids.length === 0) return;
    const cat = category.trim();
    const prev = photos
      .filter((p) => selected.has(p.id))
      .map((p) => ({ id: p.id, portfolioCategory: p.portfolioCategory }));
    pushUndo({ kind: "portfolioCategory", label: "Portfolio-Kategorie geändert", prev });
    setPhotos((all) =>
      all.map((p) => (selected.has(p.id) ? { ...p, portfolioCategory: cat || null } : p)),
    );
    setSelected(new Set());
    await setPhotosPortfolioCategory(albumId, ids, cat);
  }

  // Favoriten setzen/entfernen (Portfolio-Kuratierung) — optimistisch + Undo.
  async function applyFavorite(ids: string[], value: boolean) {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    const prev = photos
      .filter((p) => idSet.has(p.id))
      .map((p) => ({ id: p.id, isFavorite: p.isFavorite }));
    pushUndo({ kind: "favorite", label: value ? "Favorisiert" : "Favorit entfernt", prev });
    setPhotos((all) => all.map((p) => (idSet.has(p.id) ? { ...p, isFavorite: value } : p)));
    await setPhotosFavorite(albumId, ids, value);
  }

  /** Einzelnes Foto umschalten (Stern auf der Kachel). */
  function toggleFavorite(id: string) {
    const p = photos.find((x) => x.id === id);
    if (p) void applyFavorite([id], !p.isFavorite);
  }

  /** Bulk aus der Auswahlleiste. */
  async function bulkFavorite(value: boolean) {
    const ids = [...selected];
    setSelected(new Set());
    await applyFavorite(ids, value);
  }

  async function bulkDelete() {
    const ids = [...selected];
    if (ids.length === 0) return;
    if (!confirm(`${ids.length} Bild(er) in den Papierkorb legen? (Rückgängig möglich)`))
      return;
    const removed = photos.filter((p) => selected.has(p.id));
    const cover = coverId && selected.has(coverId) ? coverId : null;
    pushUndo({
      kind: "delete",
      label: `${ids.length} gelöscht`,
      photos: removed,
      order: photos.map((p) => p.id),
      cover,
    });
    setPhotos((prev) => prev.filter((p) => !selected.has(p.id)));
    if (cover) setCoverId(null);
    setSelected(new Set());
    await deletePhotos(albumId, ids);
  }

  async function bulkCover() {
    const id = [...selected][0];
    if (!id) return;
    setCoverId(id);
    setSelected(new Set());
    await setCoverPhoto(albumId, id);
  }

  // Auto-Sortierung: berechnet die Reihenfolge und speichert sie (sortOrder),
  // damit auch die Kundengalerie sie übernimmt. Rückgängig über den Stack.
  async function autoSort(field: SortField, dir: SortDir) {
    setSortField(field);
    setSortDir(dir);
    const sorted = sortPhotos(photos, field, dir);
    if (sorted.every((p, i) => p.id === photos[i].id)) return; // schon so sortiert
    pushUndo({
      kind: "reorder",
      label: "Auto-Sortierung",
      order: photos.map((p) => p.id),
    });
    setPhotos(sorted);
    await reorderPhotos(
      albumId,
      sorted.map((p) => p.id),
    );
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // Läuft gerade ein Sortier-Drag? Nur für die Cursor-Darstellung: solange
  // gezogen wird, soll überall „grabbing" stehen — sonst springt der Zeiger in
  // den Lücken zwischen den Kacheln (und über Buttons/Text) zurück auf Pfeil
  // bzw. Hand. Das erledigt eine Klasse am <body> (Regel in globals.css), weil
  // der Zeiger dabei auch Elemente AUSSERHALB des Rasters überfährt.
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    if (!dragging) return;
    document.body.classList.add("dnd-dragging");
    return () => document.body.classList.remove("dnd-dragging");
  }, [dragging]);

  function handleDragEnd(event: DragEndEvent) {
    setDragging(false);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const prevOrder = photos.map((p) => p.id);
    setPhotos((prev) => {
      const oldIndex = prev.findIndex((p) => p.id === active.id);
      const newIndex = prev.findIndex((p) => p.id === over.id);
      const next = arrayMove(prev, oldIndex, newIndex);
      startTransition(() =>
        reorderPhotos(
          albumId,
          next.map((p) => p.id),
        ),
      );
      return next;
    });
    pushUndo({ kind: "reorder", label: "Verschoben", order: prevOrder });
    setSortField("manual");
  }

  function handleSaved(updated: ManagedPhoto) {
    setPhotos((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
  }

  function handleDeleted(id: string) {
    const removed = photos.find((p) => p.id === id);
    if (removed) {
      pushUndo({
        kind: "delete",
        label: "1 gelöscht",
        photos: [removed],
        order: photos.map((p) => p.id),
        cover: coverId === id ? coverId : null,
      });
    }
    setPhotos((prev) => prev.filter((p) => p.id !== id));
    if (coverId === id) setCoverId(null);
    setEditIndex(null);
  }

  function handleCover(id: string) {
    setCoverId(id);
  }

  // Letzten Schritt zurücknehmen (Reihenfolge, Kategorie oder Löschen).
  async function undo() {
    const entry = undoStack[undoStack.length - 1];
    if (!entry || undoing) return;
    setUndoStack((s) => s.slice(0, -1));
    setUndoing(true);
    try {
      if (entry.kind === "reorder") {
        setPhotos((prev) => {
          const byId = new Map(prev.map((p) => [p.id, p]));
          return entry.order
            .map((id) => byId.get(id))
            .filter((p): p is ManagedPhoto => !!p);
        });
        await reorderPhotos(albumId, entry.order);
        setSortField("manual");
      } else if (entry.kind === "category") {
        const map = new Map(entry.prev.map((x) => [x.id, x.category]));
        setPhotos((prev) =>
          prev.map((p) =>
            map.has(p.id) ? { ...p, category: map.get(p.id) ?? null } : p,
          ),
        );
        await setPhotoCategories(albumId, entry.prev);
      } else if (entry.kind === "portfolioCategory") {
        const map = new Map(entry.prev.map((x) => [x.id, x.portfolioCategory]));
        setPhotos((prev) =>
          prev.map((p) =>
            map.has(p.id) ? { ...p, portfolioCategory: map.get(p.id) ?? null } : p,
          ),
        );
        await setPhotoPortfolioCategories(albumId, entry.prev);
      } else if (entry.kind === "favorite") {
        const map = new Map(entry.prev.map((x) => [x.id, x.isFavorite]));
        setPhotos((prev) =>
          prev.map((p) => (map.has(p.id) ? { ...p, isFavorite: map.get(p.id)! } : p)),
        );
        // Vorherige (gemischte) Werte gruppiert wiederherstellen.
        const toTrue = entry.prev.filter((x) => x.isFavorite).map((x) => x.id);
        const toFalse = entry.prev.filter((x) => !x.isFavorite).map((x) => x.id);
        if (toTrue.length) await setPhotosFavorite(albumId, toTrue, true);
        if (toFalse.length) await setPhotosFavorite(albumId, toFalse, false);
      } else {
        // Löschen rückgängig: Fotos zurückholen und Vorreihenfolge herstellen.
        setPhotos((prev) => {
          const byId = new Map(prev.map((p) => [p.id, p]));
          for (const p of entry.photos) byId.set(p.id, p);
          return entry.order
            .map((id) => byId.get(id))
            .filter((p): p is ManagedPhoto => !!p);
        });
        if (entry.cover) setCoverId(entry.cover);
        await restorePhotos(
          albumId,
          entry.photos.map((p) => p.id),
        );
      }
    } finally {
      setUndoing(false);
      router.refresh();
    }
  }

  if (photos.length === 0) {
    return (
      <p className="text-sm text-neutral-400">Noch keine Bilder hochgeladen.</p>
    );
  }

  return (
    <div className="space-y-3">
      <ManagerToolbar
        mode={mode}
        onMode={setMode}
        sizeIdx={sizeIdx}
        onSize={changeSize}
        categories={categories}
        hasUncategorized={hasUncategorized}
        filterCategory={filterCategory}
        onFilter={setFilterCategory}
        sortField={sortField}
        sortDir={sortDir}
        onSort={autoSort}
        canUndo={undoStack.length > 0}
        undoing={undoing}
        onUndo={undo}
      />

      {selected.size > 0 ? (
        <SelectionBar
          count={selected.size}
          categories={categories}
          portfolioCategories={portfolioCategories}
          onAssignCategory={bulkCategory}
          onAssignPortfolioCategory={bulkPortfolioCategory}
          onFavorite={bulkFavorite}
          onCover={selected.size === 1 ? bulkCover : undefined}
          onDelete={bulkDelete}
          onClear={() => setSelected(new Set())}
        />
      ) : (
        <p className="text-xs text-neutral-400">
          {mode === "select"
            ? "Auswählen: Ziehen für Mehrfachauswahl (ganze Reihen beim Runterziehen) · Shift/⌘ zum Hinzufügen"
            : canReorder
              ? "Sortieren: Ziehen zum Umsortieren · Klicken zum Bearbeiten · Häkchen zum Auswählen"
              : "Gefiltert — zum Umsortieren Filter auf „Alle“ setzen. Auswahl & Bearbeiten funktionieren weiter."}
        </p>
      )}

      <DndContext
        id="album-photo-grid"
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={() => setDragging(true)}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setDragging(false)}
      >
        <SortableContext
          items={visible.map((p) => p.id)}
          strategy={rectSortingStrategy}
        >
          <ul className={`grid gap-2 ${GRID_SIZES[sizeIdx]}`}>
            {visible.map((photo, index) => (
              <SortablePhoto
                key={photo.id}
                photo={photo}
                isCover={photo.id === coverId}
                selected={selected.has(photo.id)}
                disabled={!canReorder}
                selectMode={mode === "select"}
                onOpen={() => setEditIndex(index)}
                onRangeStart={(additive) => rangeStart(index, additive)}
                onRangeEnter={() => rangeEnter(index)}
                onPaintStart={(shift) => startPaint(photo.id, index, shift)}
                onPaintEnter={() => paintOver(photo.id)}
                onToggleFavorite={() => toggleFavorite(photo.id)}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>

      <AnimatePresence>
        {editIndex !== null && visible[editIndex] && (
          <PhotoEditor
            albumId={albumId}
            photo={visible[editIndex]}
            index={editIndex}
            total={visible.length}
            isCover={visible[editIndex].id === coverId}
            categories={categories}
            portfolioCategories={portfolioCategories}
            onClose={() => setEditIndex(null)}
            onPrev={
              editIndex > 0 ? () => setEditIndex(editIndex - 1) : undefined
            }
            onNext={
              editIndex < visible.length - 1
                ? () => setEditIndex(editIndex + 1)
                : undefined
            }
            onSaved={handleSaved}
            onDeleted={handleDeleted}
            onCover={handleCover}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/** Werkzeugleiste über dem Raster: Kategorie-Filter, Auto-Sortierung, Undo. */
function ManagerToolbar({
  mode,
  onMode,
  sizeIdx,
  onSize,
  categories,
  hasUncategorized,
  filterCategory,
  onFilter,
  sortField,
  sortDir,
  onSort,
  canUndo,
  undoing,
  onUndo,
}: {
  mode: "sort" | "select";
  onMode: (m: "sort" | "select") => void;
  sizeIdx: number;
  onSize: (idx: number) => void;
  categories: string[];
  hasUncategorized: boolean;
  filterCategory: string | null;
  onFilter: (c: string | null) => void;
  sortField: SortField | "manual";
  sortDir: SortDir;
  onSort: (field: SortField, dir: SortDir) => void;
  canUndo: boolean;
  undoing: boolean;
  onUndo: () => void;
}) {
  const showFilter = categories.length > 0;

  return (
    <div className="flex items-center gap-2 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {/* Modus: Sortieren vs. Auswählen (bestimmt die Ziehen-Geste) */}
      <div className="flex shrink-0 rounded-lg border p-0.5 text-xs">
        {(["sort", "select"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => onMode(m)}
            aria-pressed={mode === m}
            className={`rounded-md px-2.5 py-1 font-medium transition ${
              mode === m ? "bg-ink text-canvas" : "text-muted hover:text-ink"
            }`}
          >
            {m === "sort" ? "Sortieren" : "Auswählen"}
          </button>
        ))}
      </div>

      {showFilter && (
        <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted">
          <span className="hidden sm:inline">Filter</span>
          <select
            aria-label="Nach Gruppe filtern"
            value={filterCategory ?? "__all__"}
            onChange={(e) =>
              onFilter(e.target.value === "__all__" ? null : e.target.value)
            }
            className="input h-8 w-auto py-1 text-sm"
          >
            <option value="__all__">Alle</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
            {hasUncategorized && (
              <option value="__none__">Ohne Gruppe</option>
            )}
          </select>
        </label>
      )}

      <div className="ml-auto flex shrink-0 items-center gap-2">
        {/* Raster-Größe */}
        <label className="flex items-center gap-1.5 text-xs text-muted">
          <span aria-hidden className="text-[10px]">
            ▪
          </span>
          <input
            type="range"
            min={0}
            max={GRID_SIZES.length - 1}
            value={sizeIdx}
            onChange={(e) => onSize(Number(e.target.value))}
            aria-label="Raster-Größe"
            className="w-20 accent-[hsl(var(--accent))]"
          />
          <span aria-hidden className="text-sm">
            ◼
          </span>
        </label>

        {/* Auto-Sortierung (wird gespeichert). */}
        <label className="flex items-center gap-1.5 text-xs text-muted">
          <span className="hidden sm:inline">Sortieren</span>
          <select
            aria-label="Sortieren nach"
            value={sortField}
            onChange={(e) => {
              const f = e.target.value;
              if (f === "manual") return; // Manuell = nur Anzeige des Ist-Zustands
              onSort(f as SortField, sortDir);
            }}
            className="input h-8 w-auto py-1 text-sm"
          >
            <option value="manual">Manuell</option>
            <option value="category">Gruppe</option>
            <option value="name">Name</option>
            <option value="date">Datum</option>
          </select>
        </label>
        <button
          type="button"
          aria-label={sortDir === "asc" ? "Aufsteigend" : "Absteigend"}
          title={sortDir === "asc" ? "Aufsteigend" : "Absteigend"}
          disabled={sortField === "manual"}
          onClick={() =>
            onSort(sortField as SortField, sortDir === "asc" ? "desc" : "asc")
          }
          className="btn-ghost h-8 w-8 shrink-0 p-0 text-sm disabled:opacity-40"
        >
          {sortDir === "asc" ? "↑" : "↓"}
        </button>

        {canUndo && (
          <button
            type="button"
            onClick={onUndo}
            disabled={undoing}
            className="btn-ghost h-8 shrink-0 gap-1.5 px-3 py-1 text-sm disabled:opacity-50"
          >
            <span aria-hidden>↶</span>
            <span className="hidden sm:inline">
              {undoing ? "Mache…" : "Rückgängig"}
            </span>
          </button>
        )}
      </div>
    </div>
  );
}

/** Stern-Icon (gefüllt = Favorit). */
function StarIcon({ filled, className }: { filled?: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 3.5l2.6 5.27 5.82.85-4.21 4.1.99 5.79L12 16.77l-5.2 2.73.99-5.79-4.21-4.1 5.82-.85L12 3.5z" />
    </svg>
  );
}

function SelectionBar({
  count,
  categories,
  portfolioCategories,
  onAssignCategory,
  onAssignPortfolioCategory,
  onFavorite,
  onCover,
  onDelete,
  onClear,
}: {
  count: number;
  categories: string[];
  portfolioCategories: string[];
  onAssignCategory: (category: string) => void;
  onAssignPortfolioCategory: (category: string) => void;
  onFavorite: (value: boolean) => void;
  onCover?: () => void;
  onDelete: () => void;
  onClear: () => void;
}) {
  const [cat, setCat] = useState("");
  const [pfCat, setPfCat] = useState("");

  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-xl border bg-surface p-2 shadow-sm">
      <span className="px-1 text-sm font-medium text-ink">
        Auswahl ({count})
      </span>

      {/* Galerie-Gruppe (Kundengalerie-Tabs) */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onAssignCategory(cat);
          setCat("");
        }}
        className="flex items-center gap-1"
      >
        <div className="w-36">
          <TagCombobox
            value={cat}
            onChange={setCat}
            options={categories}
            placeholder="Gruppe…"
            title="Galerie-Gruppe: gruppiert Bilder in der Kundengalerie"
            clearLabel="Ohne Gruppe"
            emptyHint="Noch keine Gruppen in diesem Album."
            inputClassName="input h-8 w-full py-1 text-sm"
          />
        </div>
        <button type="submit" className="btn-ghost h-8 px-3 py-1 text-sm">
          Gruppe
        </button>
      </form>

      {/* Portfolio-Kategorie (Mischalben-Override; nur fürs Portfolio) */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onAssignPortfolioCategory(pfCat);
          setPfCat("");
        }}
        className="flex items-center gap-1"
      >
        <div className="w-40">
          <TagCombobox
            value={pfCat}
            onChange={setPfCat}
            options={portfolioCategories}
            placeholder="Portfolio-Kat.…"
            title="Portfolio-Kategorie: Genre fürs öffentliche Portfolio (überschreibt das Album)"
            clearLabel="Album-Kategorie verwenden"
            emptyHint="Noch keine Portfolio-Kategorien."
            inputClassName="input h-8 w-full py-1 text-sm"
          />
        </div>
        <button type="submit" className="btn-ghost h-8 px-3 py-1 text-sm">
          Portfolio
        </button>
      </form>

      {/* Portfolio-Favoriten (nur redaktionell; ohne Wirkung auf Kundengalerie) */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onFavorite(true)}
          className="btn-ghost flex h-8 items-center gap-1 px-3 py-1 text-sm"
          title="Als Favorit markieren (Portfolio)"
        >
          <StarIcon filled className="h-4 w-4" />
          Favorit
        </button>
        <button
          type="button"
          onClick={() => onFavorite(false)}
          className="btn-ghost h-8 px-2 py-1 text-sm text-muted"
          title="Favorit entfernen"
        >
          Entfernen
        </button>
      </div>

      {onCover && (
        <button
          type="button"
          onClick={onCover}
          className="btn-ghost h-8 px-3 py-1 text-sm"
        >
          Als Cover
        </button>
      )}

      <button
        type="button"
        onClick={onDelete}
        className="h-8 rounded-lg border border-red-300 px-3 py-1 text-sm font-medium text-red-600 transition hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950/40"
      >
        Löschen
      </button>

      <button
        type="button"
        onClick={onClear}
        className="ml-auto px-2 text-sm text-muted transition hover:text-ink"
      >
        Aufheben
      </button>
    </div>
  );
}

function SortablePhoto({
  photo,
  isCover,
  selected,
  disabled,
  selectMode,
  onOpen,
  onRangeStart,
  onRangeEnter,
  onPaintStart,
  onPaintEnter,
  onToggleFavorite,
}: {
  photo: ManagedPhoto;
  isCover: boolean;
  selected: boolean;
  disabled?: boolean;
  selectMode: boolean;
  onOpen: () => void;
  onRangeStart: (additive: boolean) => void;
  onRangeEnter: () => void;
  onPaintStart: (shift: boolean) => void;
  onPaintEnter: () => void;
  onToggleFavorite: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: photo.id, disabled });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  // Im Auswahl-Modus keine dnd-Listener (Ziehen = Bereichsauswahl statt Sortieren),
  // stattdessen der eigene Bereichs-Handler. WICHTIG: beides über EINEN Spread,
  // denn ein danach gesetztes `onPointerDown={undefined}` würde den Listener von
  // dnd-kit überschreiben und das Sortieren per Drag lahmlegen.
  const dragProps = selectMode
    ? {
        onPointerDown: (e: React.PointerEvent) => {
          if (e.button !== 0) return;
          e.preventDefault();
          onRangeStart(e.shiftKey || e.metaKey || e.ctrlKey);
        },
      }
    : listeners;

  // Der Zeiger soll sagen, was ein Ziehen HIER bewirkt: Auswahl aufziehen
  // (Fadenkreuz), Umsortieren (offene/geschlossene Hand) oder — wenn gefiltert
  // ist und deshalb nicht sortiert werden kann — nur Öffnen per Klick.
  const cursor = selectMode
    ? "cursor-crosshair"
    : disabled
      ? "cursor-pointer"
      : isDragging
        ? "cursor-grabbing"
        : "cursor-grab";

  return (
    <li
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...dragProps}
      onClick={selectMode ? undefined : onOpen}
      onPointerEnter={selectMode ? onRangeEnter : onPaintEnter}
      className={`group relative aspect-square touch-none overflow-hidden rounded-lg bg-neutral-100 ring-offset-2 ring-offset-surface transition dark:bg-neutral-800 ${cursor} ${
        selected ? "ring-2 ring-ink" : ""
      }`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={mediaUrl(photo.storageKey, "thumb")}
        alt={photo.caption ?? ""}
        loading="lazy"
        draggable={false}
        className={`h-full w-full object-contain transition ${selected ? "opacity-80" : ""}`}
      />

      {/* Video-Badge (oben links) — kennzeichnet Videos (Poster wird angezeigt). */}
      {photo.mediaType === "VIDEO" && (
        <span className="pointer-events-none absolute left-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-black/55 text-[10px] text-white">
          ▶
        </span>
      )}

      {/* Auswahl-Häkchen (oben rechts) — stoppt Klick/Drag der Kachel */}
      <button
        type="button"
        aria-label={selected ? "Auswahl aufheben" : "Auswählen"}
        aria-pressed={selected}
        onPointerDown={(e) => {
          e.stopPropagation();
          e.preventDefault();
          onPaintStart(e.shiftKey);
        }}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
        }}
        className={`absolute right-1 top-1 grid h-5 w-5 cursor-pointer place-items-center rounded-full border text-[11px] transition ${
          selected
            ? "border-white bg-ink text-canvas"
            : "border-white/80 bg-black/30 text-transparent opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
        }`}
      >
        ✓
      </button>

      {/* Favoriten-Stern (Portfolio) — unten rechts; markiert = immer sichtbar,
          sonst erst bei Hover. Stoppt Klick/Drag der Kachel. */}
      <button
        type="button"
        aria-label={photo.isFavorite ? "Favorit entfernen" : "Als Favorit markieren"}
        aria-pressed={photo.isFavorite}
        onPointerDown={(e) => {
          e.stopPropagation();
          e.preventDefault();
          onToggleFavorite();
        }}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
        }}
        className={`absolute bottom-1 right-1 z-10 grid h-6 w-6 cursor-pointer place-items-center rounded-full bg-black/35 backdrop-blur transition ${
          photo.isFavorite
            ? "text-amber-400 opacity-100"
            : "text-white/90 opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
        }`}
      >
        <StarIcon filled={photo.isFavorite} className="h-3.5 w-3.5" />
      </button>

      {isCover && (
        <span className="absolute left-1 top-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
          Cover
        </span>
      )}
      {photo.category && (
        <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/70 to-transparent px-1.5 pb-1 pt-3 text-[10px] font-medium text-white">
          {photo.category}
        </span>
      )}
    </li>
  );
}

function PhotoEditor({
  albumId,
  photo,
  index,
  total,
  isCover,
  categories,
  portfolioCategories,
  onClose,
  onPrev,
  onNext,
  onSaved,
  onDeleted,
  onCover,
}: {
  albumId: string;
  photo: ManagedPhoto;
  index: number;
  total: number;
  isCover: boolean;
  categories: string[];
  portfolioCategories: string[];
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  onSaved: (p: ManagedPhoto) => void;
  onDeleted: (id: string) => void;
  onCover: (id: string) => void;
}) {
  const [caption, setCaption] = useState(photo.caption ?? "");
  const [category, setCategory] = useState(photo.category ?? "");
  const [portfolioCategory, setPortfolioCategory] = useState(photo.portfolioCategory ?? "");
  const [pending, setPending] = useState<null | "save" | "delete" | "cover">(
    null,
  );
  const [rawName, setRawName] = useState(photo.rawName);
  const [rawSize, setRawSize] = useState(photo.rawSizeBytes);
  const [rawBusy, setRawBusy] = useState(false);
  const [rawError, setRawError] = useState<string | null>(null);
  const [zoomed, setZoomed] = useState(false);
  const rawInputRef = useRef<HTMLInputElement>(null);

  // Beim Wechsel zum Nachbarbild: Formularzustand auf das neue Bild angleichen.
  useEffect(() => {
    setCaption(photo.caption ?? "");
    setCategory(photo.category ?? "");
    setPortfolioCategory(photo.portfolioCategory ?? "");
    setRawName(photo.rawName);
    setRawSize(photo.rawSizeBytes);
    setRawError(null);
    setPending(null);
    setZoomed(false);
  }, [photo.id, photo.caption, photo.category, photo.portfolioCategory, photo.rawName, photo.rawSizeBytes]);

  // Tastatur: Pfeile blättern, Escape schließt (Zoom zuerst). Nicht im Textfeld.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName;
      const typing = tag === "INPUT" || tag === "TEXTAREA";
      if (e.key === "Escape") {
        if (zoomed) setZoomed(false);
        else onClose();
        return;
      }
      if (typing) return;
      if (e.key === "ArrowLeft" && onPrev) {
        e.preventDefault();
        onPrev();
      } else if (e.key === "ArrowRight" && onNext) {
        e.preventDefault();
        onNext();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoomed, onPrev, onNext, onClose]);

  async function attachRaw(file: File) {
    setRawBusy(true);
    setRawError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/admin/photos/${photo.id}/raw`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Fehler ${res.status}`);
      }
      const data = await res.json();
      setRawName(data.rawName);
      setRawSize(data.rawSizeBytes);
      onSaved({ ...photo, rawName: data.rawName, rawSizeBytes: data.rawSizeBytes });
    } catch (err) {
      setRawError(err instanceof Error ? err.message : "Upload fehlgeschlagen.");
    } finally {
      setRawBusy(false);
    }
  }

  async function detachRaw() {
    setRawBusy(true);
    await removeRaw(photo.id);
    setRawName(null);
    setRawSize(null);
    onSaved({ ...photo, rawName: null, rawSizeBytes: null });
    setRawBusy(false);
  }

  async function save() {
    setPending("save");
    await updatePhoto({ photoId: photo.id, caption, category, portfolioCategory });
    onSaved({
      ...photo,
      caption: caption || null,
      category: category || null,
      portfolioCategory: portfolioCategory || null,
    });
    setPending(null);
    onClose();
  }

  async function remove() {
    if (!confirm("Dieses Bild in den Papierkorb legen? (Rückgängig möglich)"))
      return;
    setPending("delete");
    await deletePhoto(photo.id);
    onDeleted(photo.id);
  }

  async function makeCover() {
    setPending("cover");
    await setCoverPhoto(albumId, photo.id);
    onCover(photo.id);
    setPending(null);
  }

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.96, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.96, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="card flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden shadow-2xl md:h-[86vh] md:flex-row"
      >
        {/* Bild-Bereich (links) mit Blättern + Zoom */}
        <div className="relative flex shrink-0 items-center justify-center bg-black md:min-h-0 md:flex-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={mediaUrl(photo.storageKey, "full")}
            alt={photo.caption ?? ""}
            onClick={() => setZoomed(true)}
            className="max-h-[40vh] w-full cursor-zoom-in object-contain md:h-full md:max-h-full"
          />

          {/* Zähler + Zoom-Hinweis oben */}
          <div className="pointer-events-none absolute left-3 top-3 rounded-full bg-black/55 px-2.5 py-1 text-xs font-medium text-white">
            {index + 1} / {total}
          </div>
          <button
            type="button"
            onClick={() => setZoomed(true)}
            aria-label="Bild vergrößern"
            className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full bg-black/55 text-white transition hover:bg-black/75"
          >
            ⤢
          </button>

          {onPrev && (
            <button
              type="button"
              onClick={onPrev}
              aria-label="Vorheriges Bild"
              className="absolute left-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-black/55 text-lg text-white transition hover:bg-black/75"
            >
              ‹
            </button>
          )}
          {onNext && (
            <button
              type="button"
              onClick={onNext}
              aria-label="Nächstes Bild"
              className="absolute right-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-black/55 text-lg text-white transition hover:bg-black/75"
            >
              ›
            </button>
          )}
        </div>

        {/* Info-Bereich (rechts), scrollbar */}
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5 md:w-[360px] md:flex-none">
          <div className="space-y-1.5">
            <label htmlFor="caption" className="label">
              Bildunterschrift
            </label>
            <textarea
              id="caption"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={2}
              className="input"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="category" className="label">
              Gruppe <span className="text-muted">(optional)</span>
            </label>
            <TagCombobox
              id="category"
              value={category}
              onChange={setCategory}
              options={categories}
              placeholder="z. B. Vorbereitung, Trauung, Feier"
              clearLabel="Ohne Gruppe"
              emptyHint="Noch keine Gruppen in diesem Album — tippe eine neue."
            />
            <p className="text-xs text-muted">
              Gruppiert Bilder in der Kundengalerie (Tab-Filter). Ohne Wirkung aufs Portfolio.
            </p>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="portfolioCategory" className="label">
              Portfolio-Kategorie <span className="text-muted">(optional)</span>
            </label>
            <TagCombobox
              id="portfolioCategory"
              value={portfolioCategory}
              onChange={setPortfolioCategory}
              options={portfolioCategories}
              placeholder="z. B. Portraits, Dokumentation"
              clearLabel="Album-Kategorie verwenden"
              emptyHint="Noch keine Portfolio-Kategorien — tippe eine neue."
            />
            <p className="text-xs text-muted">
              Genre fürs öffentliche Portfolio. Überschreibt für dieses Bild die Album-Kategorie
              (Mischalben). Leer = Album-Kategorie.
            </p>
          </div>

          {/* Metadaten (Abmessungen + verfügbare EXIF-Daten) */}
          <PhotoMeta photo={photo} />

          {/* Dateien: Original-Download + RAW-Begleitdatei */}
          <div className="space-y-2 rounded-xl border p-3">
            <p className="label">Dateien</p>

            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="text-muted">
                Original
                {photo.originalSizeBytes
                  ? ` · ${formatBytes(photo.originalSizeBytes)}`
                  : ""}
              </span>
              {photo.originalSizeBytes ? (
                <a
                  href={`/api/admin/photos/${photo.id}/download?kind=original`}
                  className="font-medium text-accent hover:underline"
                >
                  Herunterladen
                </a>
              ) : (
                <span className="text-xs text-muted">nicht verfügbar</span>
              )}
            </div>

            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="text-muted">
                RAW
                {rawName ? ` · ${rawName}` : ""}
                {rawSize ? ` · ${formatBytes(rawSize)}` : ""}
              </span>
              <div className="flex items-center gap-3">
                {rawName ? (
                  <>
                    <a
                      href={`/api/admin/photos/${photo.id}/download?kind=raw`}
                      className="font-medium text-accent hover:underline"
                    >
                      Herunterladen
                    </a>
                    <button
                      type="button"
                      onClick={detachRaw}
                      disabled={rawBusy}
                      className="text-xs text-red-500 hover:underline disabled:opacity-50"
                    >
                      Entfernen
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => rawInputRef.current?.click()}
                    disabled={rawBusy}
                    className="font-medium text-accent hover:underline disabled:opacity-50"
                  >
                    {rawBusy ? "Lädt…" : "RAW anhängen"}
                  </button>
                )}
                <input
                  ref={rawInputRef}
                  type="file"
                  accept=".cr2,.cr3,.nef,.nrw,.arw,.sr2,.dng,.raf,.orf,.rw2,.rwl,.pef,.srw,.raw,.3fr,.x3f,.erf"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) attachRaw(f);
                    e.target.value = "";
                  }}
                />
              </div>
            </div>
            {rawError && <p className="text-xs text-red-500">{rawError}</p>}
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-2">
            <button onClick={save} disabled={pending !== null} className="btn-primary">
              {pending === "save" ? "Speichern…" : "Speichern"}
            </button>
            {isCover ? (
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-accent bg-accent/10 px-3 py-2 text-sm font-medium text-accent">
                <span aria-hidden>★</span> Cover
              </span>
            ) : (
              <button
                onClick={makeCover}
                disabled={pending !== null}
                className="btn-ghost"
              >
                {pending === "cover" ? "Setze…" : "Als Cover"}
              </button>
            )}
            <button
              onClick={remove}
              disabled={pending !== null}
              className="btn-danger ml-auto"
            >
              {pending === "delete" ? "Löschen…" : "Löschen"}
            </button>
          </div>
        </div>
      </motion.div>

      {/* Vollbild-Zoom: klick schließt */}
      {zoomed && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4"
          onClick={(e) => {
            e.stopPropagation();
            setZoomed(false);
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={mediaUrl(photo.storageKey, "full")}
            alt={photo.caption ?? ""}
            className="max-h-full max-w-full cursor-zoom-out object-contain"
          />
        </div>
      )}
    </motion.div>
  );
}
