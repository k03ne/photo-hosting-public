"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
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

import { setStartItems, setStartSelectionCategory } from "@/server/actions/pages";
import { DemoPhotosPanel } from "@/components/admin/DemoPhotosPanel";
import { InfoHint } from "@/components/admin/InfoHint";
import { StartAppearanceCard } from "@/components/admin/StartAppearanceCard";
import { mediaUrl } from "@/lib/media";
import type { StartItem } from "@/lib/start-items";
import type { StartTheme, OmniBrandMode } from "@/lib/start-theme";

export type StartAppearance = {
  startTheme: StartTheme;
  omniAutoSpeed: number;
  omniShowGridLines: boolean;
  omniAlwaysColor: boolean;
  omniSubtitle: string;
  omniGap: number;
  omniCellSize: number;
  omniBrandMode: OmniBrandMode;
  omniHeadline: string;
};

// Bibliotheks-Form (vom [id]-Route geladen).
export type EditorPhoto = {
  storageKey: string;
  isFavorite: boolean;
  category: string | null;
  caption: string | null;
  width: number;
  height: number;
};
export type EditorAlbum = {
  id: string;
  title: string;
  category: string | null;
  hasPassword: boolean;
  photos: EditorPhoto[];
};

/** Filterwert im Bild-Dialog für „Bilder ohne Kategorie". */
const NO_CATEGORY = "__none";

/** Stabiler Schlüssel eines Eintrags — zugleich Drag- und Auswahl-Schlüssel. */
const uidOf = (it: StartItem) => (it.t === "album" ? `a-${it.id}` : `p-${it.k}`);

/**
 * Editor der festen Seite „Startseite" — KEIN Block-Builder. Der Nutzer stellt
 * den Inhalt zusammen (Einzelbilder und/oder ganze Alben) und ordnet ihn.
 *
 * Bewusst NICHT hier: Wortmark, Social-Links, Farbe/Schrift und das Menü — das
 * gilt für die ganze Website und wird eine Ebene höher gepflegt. Nur die
 * Filterleiste gehört hierher, weil sie sich aus genau dieser Auswahl speist.
 */
export function StartPageEditor({
  initial,
  appearance,
  bg,
  library,
  demo,
}: {
  initial: { items: StartItem[]; showFilter: boolean };
  /** Theme + Startseiten-Layout (OmniGrid-Optionen). */
  appearance: StartAppearance;
  /** Globale Grundfarbe/Kontrast (nur für die Vorschau). */
  bg: { color: string; mode: "light" | "dark" };
  library: EditorAlbum[];
  /** Nur gesetzt, wenn ein Unsplash-Schlüssel hinterlegt ist. */
  demo?: { existing: number };
}) {
  const router = useRouter();
  const [items, setItems] = useState<StartItem[]>(initial.items);
  const [showFilter, setShowFilter] = useState(initial.showFilter);
  const [pickerOpen, setPickerOpen] = useState(false);
  /** Wie viele Demo-Bilder gerade automatisch in die Auswahl gerutscht sind. */
  const [demoAdded, setDemoAdded] = useState(0);

  // Mehrfachauswahl (uid-Schlüssel) + Anker für Umschalt-Bereiche.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [anchor, setAnchor] = useState<number | null>(null);
  const [catInput, setCatInput] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [busy, startSaving] = useTransition();

  // Nachschlage-Tabellen: Album per id, Foto per storageKey (mit Album-Kontext).
  const albumById = useMemo(() => new Map(library.map((a) => [a.id, a])), [library]);
  const photoByKey = useMemo(() => {
    const m = new Map<string, { photo: EditorPhoto; album: EditorAlbum }>();
    for (const a of library) for (const p of a.photos) m.set(p.storageKey, { photo: p, album: a });
    return m;
  }, [library]);

  const usedAlbumIds = new Set(items.filter((i) => i.t === "album").map((i) => i.id));
  const usedPhotoKeys = new Set(items.filter((i) => i.t === "photo").map((i) => i.k));

  // Kategorien der Filterleiste + wie viele Einträge gar keine haben. Beides
  // aus derselben Schleife, damit der Hinweis unten nicht auseinanderläuft.
  const { categories, withoutCategory } = useMemo(() => {
    const out: string[] = [];
    let missing = 0;
    for (const it of items) {
      const cat = categoryOf(it, albumById, photoByKey);
      if (!cat) missing++;
      else if (!out.includes(cat)) out.push(cat);
    }
    return { categories: out, withoutCategory: missing };
  }, [items, albumById, photoByKey]);

  // ── Mutationen ────────────────────────────────────────────────────────────
  const addItems = (added: StartItem[]) =>
    setItems((cur) => {
      const haveAlbums = new Set(cur.filter((i) => i.t === "album").map((i) => i.id));
      const havePhotos = new Set(cur.filter((i) => i.t === "photo").map((i) => i.k));
      const fresh = added.filter((i) =>
        i.t === "album" ? !haveAlbums.has(i.id) : !havePhotos.has(i.k),
      );
      return [...cur, ...fresh];
    });
  const removeAt = (idx: number) => {
    const gone = items[idx];
    setItems((cur) => cur.filter((_, i) => i !== idx));
    if (gone) deselect(uidOf(gone));
    setAnchor(null);
  };

  function deselect(uid: string) {
    setSelected((cur) => {
      if (!cur.has(uid)) return cur;
      const next = new Set(cur);
      next.delete(uid);
      return next;
    });
  }

  // ── Auswahl ───────────────────────────────────────────────────────────────
  /** Klick auf eine Kachel: umschalten, mit Umschalt-Taste den Bereich dazu. */
  function pick(index: number, shift: boolean) {
    const it = items[index];
    if (!it) return;
    setNote(null);
    setSelected((cur) => {
      const next = new Set(cur);
      if (shift && anchor !== null) {
        const [from, to] = anchor < index ? [anchor, index] : [index, anchor];
        for (let i = from; i <= to; i++) {
          const other = items[i];
          if (other) next.add(uidOf(other));
        }
        return next;
      }
      const uid = uidOf(it);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
    if (!shift) setAnchor(index);
  }

  const clearSelection = () => {
    setSelected(new Set());
    setAnchor(null);
  };

  function removeSelected() {
    setItems((cur) => cur.filter((it) => !selected.has(uidOf(it))));
    clearSelection();
    setNote(null);
  }

  /** Die gewählten Einträge, aufgeteilt nach Art (für die Sammel-Kategorie). */
  const chosen = items.filter((it) => selected.has(uidOf(it)));

  function applyCategory() {
    const photoKeys = chosen.flatMap((it) => (it.t === "photo" ? [it.k] : []));
    const albumIds = chosen.flatMap((it) => (it.t === "album" ? [it.id] : []));
    const value = catInput.trim();
    const count = photoKeys.length + albumIds.length;
    if (count === 0) return;
    startSaving(async () => {
      await setStartSelectionCategory(photoKeys, albumIds, value);
      setNote(
        value
          ? `Kategorie „${value}“ für ${count} ${count === 1 ? "Eintrag" : "Einträge"} gesetzt.`
          : `Kategorie bei ${count} ${count === 1 ? "Eintrag" : "Einträgen"} entfernt.`,
      );
      setCatInput("");
      clearSelection();
      // Die Kategorie hängt an Bild/Album, nicht an der Auswahl — die Seite muss
      // sie neu laden, damit Filterleiste und Hinweise unten wieder stimmen.
      router.refresh();
    });
  }

  // ── Ziehen ────────────────────────────────────────────────────────────────
  const sensors = useSensors(
    // Erst ab 6 px zählt es als Ziehen — darunter bleibt es ein Klick und
    // schaltet die Auswahl um.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
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
    setItems((cur) => {
      const from = cur.findIndex((it) => uidOf(it) === active.id);
      const to = cur.findIndex((it) => uidOf(it) === over.id);
      if (from < 0 || to < 0) return cur;
      return arrayMove(cur, from, to);
    });
    setAnchor(null);
  }

  const albumCount = usedAlbumIds.size;
  const photoCount = usedPhotoKeys.size;

  // Vorschläge für die Sammel-Kategorie: alles, was in der Mediathek schon
  // vergeben ist — Tippfehler erzeugen sonst stille Zweit-Kategorien.
  const knownCategories = useMemo(() => {
    const out = new Set<string>();
    for (const a of library) {
      if (a.category) out.add(a.category);
      for (const p of a.photos) if (p.category) out.add(p.category);
    }
    return [...out].sort((x, y) => x.localeCompare(y, "de"));
  }, [library]);

  return (
    <div className="space-y-8">
      {/* Kopf */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted">
            <Link href="/admin/pages" className="hover:text-ink">
              Seiten
            </Link>
            <span>/</span>
            <span>Startseite</span>
          </div>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">Startseite</h1>
          <p className="mt-1.5 max-w-xl text-muted">
            Hier legst du fest, welche Bilder die Startseite zeigt. Theme, Farbe, Schrift und das
            Menü gelten für die ganze Website und liegen unter{" "}
            <Link href="/admin/pages" className="underline hover:text-ink">
              Seiten
            </Link>
            ; Wortmark & Social-Links unter{" "}
            <Link href="/admin/settings" className="underline hover:text-ink">
              Einstellungen
            </Link>
            .
          </p>
        </div>
        <Link href="/admin/start-preview" target="_blank" className="btn-ghost shrink-0">
          Vorschau ↗
        </Link>
      </div>

      {/* OmniGrid-Layout — nur wenn dieses Theme aktiv ist (Theme-Wahl liegt in
          den Haupteinstellungen). */}
      {appearance.startTheme === "omnigrid" && (
        <StartAppearanceCard initial={appearance} mode={bg.mode} />
      )}

      {/* ── Inhalt der Startseite ─────────────────────────────────────────── */}
      <section className="card p-5">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 font-medium">
            Inhalt
            <InfoHint text="Die Reihenfolge hier ist die Reihenfolge auf der Startseite. Ein Einzelbild öffnet die Lightbox, ein Album öffnet sein Bild-Grid." />
          </h2>
          <button type="button" onClick={() => setPickerOpen(true)} className="btn-accent">
            + Hinzufügen
          </button>
        </div>
        <p className="mb-4 text-sm text-muted">
          {items.length === 0
            ? "Noch nichts gewählt — die Startseite zeigt solange automatisch deine veröffentlichten Alben."
            : `${items.length} ${items.length === 1 ? "Eintrag" : "Einträge"}: ` +
              `${photoCount} ${photoCount === 1 ? "Einzelbild" : "Einzelbilder"}, ` +
              `${albumCount} ${albumCount === 1 ? "Album" : "Alben"}. ` +
              "Ziehen sortiert, ein Klick wählt aus (mit Umschalt einen Bereich)."}
        </p>

        {/* Sammel-Aktionen — nur sichtbar, solange etwas gewählt ist. */}
        {chosen.length > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border bg-surface p-2.5">
            <span className="text-sm font-medium">
              {chosen.length} gewählt
            </span>
            <span className="mx-1 hidden h-4 w-px bg-line sm:block" />
            <input
              value={catInput}
              onChange={(e) => setCatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  applyCategory();
                }
              }}
              list="start-known-categories"
              placeholder="Kategorie …"
              maxLength={60}
              aria-label="Kategorie für die Auswahl"
              className="input h-9 w-44 py-1 text-sm"
            />
            <datalist id="start-known-categories">
              {knownCategories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            <button
              type="button"
              onClick={applyCategory}
              disabled={busy}
              title="Wirkt sofort — die Kategorie hängt am Bild bzw. Album, nicht an dieser Auswahl."
              className="chip border px-3 py-1.5 transition hover:border-ink disabled:opacity-50"
            >
              {busy ? "Speichert …" : catInput.trim() ? "Zuweisen" : "Kategorie entfernen"}
            </button>
            <button
              type="button"
              onClick={removeSelected}
              className="chip border px-3 py-1.5 text-red-600 transition hover:border-red-600"
            >
              Von der Startseite entfernen
            </button>
            <button
              type="button"
              onClick={clearSelection}
              className="ml-auto text-sm text-muted underline transition hover:text-ink"
            >
              Auswahl aufheben
            </button>
          </div>
        )}
        {note && <p className="mb-3 text-sm text-muted">{note}</p>}

        {items.length === 0 ? (
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="w-full rounded-lg border border-dashed p-8 text-center text-sm text-muted transition hover:border-ink hover:text-ink"
          >
            Einzelbilder oder ganze Alben auswählen
          </button>
        ) : (
          <DndContext
            id="start-item-grid"
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={() => setDragging(true)}
            onDragEnd={handleDragEnd}
            onDragCancel={() => setDragging(false)}
          >
            <SortableContext items={items.map(uidOf)} strategy={rectSortingStrategy}>
              <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
                {items.map((it, idx) => {
                  const info =
                    it.t === "album"
                      ? resolveAlbum(albumById.get(it.id))
                      : resolvePhoto(photoByKey.get(it.k));
                  const uid = uidOf(it);
                  return (
                    <SortableItemTile
                      key={uid}
                      uid={uid}
                      isAlbum={it.t === "album"}
                      info={info}
                      selected={selected.has(uid)}
                      onPick={(shift) => pick(idx, shift)}
                      onRemove={() => removeAt(idx)}
                    />
                  );
                })}
              </ul>
            </SortableContext>
          </DndContext>
        )}

        {/* Platzhalter-Bilder: eingeklappt, weil sie nur beim Einrichten helfen.
            Geladene Bilder wandern direkt in die Auswahl oben. */}
        {demo && (
          <div className="mt-4">
            <DemoPhotosPanel
              existing={demo.existing}
              variant="plain"
              onImported={(keys) => {
                addItems(keys.map((k) => ({ t: "photo", k }) as StartItem));
                setDemoAdded(keys.length);
              }}
            />
            {demoAdded > 0 && (
              <p className="mt-2 text-sm text-muted">
                {demoAdded} Demo-{demoAdded === 1 ? "Bild" : "Bilder"} in den Inhalt übernommen —
                unten speichern, damit die Startseite sie zeigt.
              </p>
            )}
          </div>
        )}
      </section>

      {/* ── Filterleiste + Speichern ──────────────────────────────────────── */}
      <form action={setStartItems} className="card space-y-4 p-5">
        <input type="hidden" name="items" value={JSON.stringify(items)} />
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            name="showFilter"
            defaultChecked={showFilter}
            onChange={(e) => setShowFilter(e.target.checked)}
            className="h-4 w-4"
          />
          <span className="flex items-center gap-2 text-sm font-medium">
            Filterleiste anzeigen
            <InfoHint text="Blendet die Kategorie-Filter unten auf der Startseite ein — in beiden Themes. Die Kategorien ergeben sich aus dem Inhalt oben; Bilder ohne Kategorie erscheinen nur unter „Alle“." />
          </span>
        </label>

        {showFilter && (
          <div className="space-y-1.5 rounded-lg bg-surface p-3 text-sm">
            <div>
              <span className="text-muted">Kategorien: </span>
              {categories.length ? (
                <span className="text-ink">{categories.join(" · ")}</span>
              ) : (
                <span className="text-muted">keine</span>
              )}
            </div>
            {withoutCategory > 0 && (
              <p className="text-muted">
                {withoutCategory} von {items.length}{" "}
                {items.length === 1 ? "Eintrag hat" : "Einträgen haben"} keine Kategorie und
                {categories.length === 0
                  ? " erscheinen deshalb nur unter „Alle“ — die Filterleiste hätte nichts zu filtern."
                  : " erscheinen nur unter „Alle“."}{" "}
                <Link href="/admin/bilder" className="underline hover:text-ink">
                  Kategorien vergeben
                </Link>
              </p>
            )}
          </div>
        )}

        <div className="flex justify-end">
          <button type="submit" className="btn-accent">
            Speichern
          </button>
        </div>
      </form>

      {pickerOpen && (
        <ContentPicker
          library={library}
          usedPhotoKeys={usedPhotoKeys}
          usedAlbumIds={usedAlbumIds}
          onAdd={addItems}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}

// ── Anzeige-Helfer ──────────────────────────────────────────────────────────
/** Effektive Kategorie eines Eintrags (Bild-Override ODER Album-Kategorie). */
function categoryOf(
  it: StartItem,
  albumById: Map<string, EditorAlbum>,
  photoByKey: Map<string, { photo: EditorPhoto; album: EditorAlbum }>,
): string | null {
  if (it.t === "album") return albumById.get(it.id)?.category ?? null;
  const ref = photoByKey.get(it.k);
  return ref ? (ref.photo.category ?? ref.album.category) : null;
}

function resolveAlbum(a: EditorAlbum | undefined) {
  if (!a) return { title: "Album entfernt", thumb: null as string | null };
  return { title: a.title, thumb: a.photos[0] ? mediaUrl(a.photos[0].storageKey, "thumb") : null };
}
function resolvePhoto(ref: { photo: EditorPhoto; album: EditorAlbum } | undefined) {
  if (!ref) return { title: "Bild entfernt", thumb: null as string | null };
  return {
    title: ref.photo.caption ?? ref.album.title,
    thumb: mediaUrl(ref.photo.storageKey, "thumb"),
  };
}

/**
 * Eine Kachel im Inhalts-Raster: ziehbar (Reihenfolge) und klickbar (Auswahl).
 * Beides auf derselben Fläche, weil ein eigener Anfasser bei quadratischen
 * Bild-Kacheln mehr verdeckt als er hilft — dnd-kit trennt das über die
 * Aktivierungs-Distanz (6 px), darunter bleibt es ein Klick.
 */
function SortableItemTile({
  uid,
  isAlbum,
  info,
  selected,
  onPick,
  onRemove,
}: {
  uid: string;
  isAlbum: boolean;
  info: { title: string; thumb: string | null };
  selected: boolean;
  onPick: (shift: boolean) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: uid,
  });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`group relative aspect-square overflow-hidden rounded-lg border bg-surface ${
        isDragging ? "z-10 opacity-80 shadow-lg" : ""
      } ${selected ? "ring-2 ring-accent" : ""}`}
    >
      {/* Die Fläche selbst ist der Anfasser UND die Auswahl. */}
      <button
        type="button"
        {...attributes}
        {...listeners}
        onClick={(e) => onPick(e.shiftKey)}
        aria-pressed={selected}
        title={`${info.title} — ziehen zum Sortieren, klicken zum Auswählen`}
        className="block h-full w-full cursor-grab touch-none text-left active:cursor-grabbing"
      >
        {info.thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={info.thumb} alt="" className="h-full w-full object-cover" draggable={false} />
        ) : (
          <span className="grid h-full place-items-center text-xs text-muted">fehlt</span>
        )}
      </button>

      {isAlbum && (
        <span className="pointer-events-none absolute left-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
          ALBUM
        </span>
      )}
      <span className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/70 to-transparent px-1.5 pb-1 pt-4 text-[10px] text-white">
        {info.title}
      </span>
      {selected && (
        <span className="pointer-events-none absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-accent text-xs text-[hsl(var(--accent-ink))]">
          ✓
        </span>
      )}
      {/* Einzeln entfernen bleibt erhalten — für genau ein Bild ist der Umweg
          über die Auswahl zu lang. */}
      {!selected && (
        <button
          type="button"
          onClick={onRemove}
          aria-label="Entfernen"
          className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded bg-red-600/80 text-xs text-white opacity-0 transition hover:bg-red-600 group-hover:opacity-100"
        >
          ✕
        </button>
      )}
    </li>
  );
}

// ── Inhalts-Dialog: Einzelbilder ODER ganze Alben ───────────────────────────
/**
 * Ein Dialog für beide Arten von Einträgen. Vorher standen „Auswahl" und
 * „Ganze Alben" als zwei getrennte Abschnitte untereinander — dass beide
 * dieselbe Liste füllen, war daran nicht zu erkennen.
 */
function ContentPicker({
  library,
  usedPhotoKeys,
  usedAlbumIds,
  onAdd,
  onClose,
}: {
  library: EditorAlbum[];
  usedPhotoKeys: Set<string>;
  usedAlbumIds: Set<string>;
  onAdd: (items: StartItem[]) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"photos" | "albums">("photos");
  const [pickedPhotos, setPickedPhotos] = useState<Set<string>>(new Set());
  const [pickedAlbums, setPickedAlbums] = useState<Set<string>>(new Set());

  const [query, setQuery] = useState("");
  const [albumId, setAlbumId] = useState("");
  const [category, setCategory] = useState("");
  const [favsOnly, setFavsOnly] = useState(false);

  const allPhotos = useMemo(
    () =>
      library.flatMap((a) =>
        a.photos.map((p) => ({
          ...p,
          albumId: a.id,
          albumTitle: a.title,
          effCategory: p.category ?? a.category ?? null,
        })),
      ),
    [library],
  );
  const categories = useMemo(
    () =>
      Array.from(new Set(allPhotos.map((p) => p.effCategory).filter((c): c is string => !!c))).sort(
        (a, b) => a.localeCompare(b, "de"),
      ),
    [allPhotos],
  );
  const uncategorized = allPhotos.filter((p) => !p.effCategory).length;

  const q = query.trim().toLowerCase();
  const filtered = allPhotos.filter((p) => {
    if (albumId && p.albumId !== albumId) return false;
    if (category === NO_CATEGORY ? p.effCategory !== null : category && p.effCategory !== category)
      return false;
    if (favsOnly && !p.isFavorite) return false;
    if (q) {
      const hay = `${p.albumTitle} ${p.caption ?? ""} ${p.effCategory ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  // Alben mit Passwort lassen sich nicht öffentlich zeigen — sie bleiben in der
  // Liste, aber gesperrt und mit Grund, statt kommentarlos zu fehlen.
  const albums = library.filter((a) => a.photos.length > 0);

  const toggle = (set: Set<string>, key: string, apply: (s: Set<string>) => void) => {
    const next = new Set(set);
    next.has(key) ? next.delete(key) : next.add(key);
    apply(next);
  };

  const total = pickedPhotos.size + pickedAlbums.size;
  const confirm = () => {
    onAdd([
      ...[...pickedPhotos].map((k) => ({ t: "photo" as const, k })),
      ...[...pickedAlbums].map((id) => ({ t: "album" as const, id })),
    ]);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-canvas"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b px-5 py-3">
          <h2 className="font-medium">
            Zur Startseite hinzufügen
            {total > 0 && <span className="ml-2 text-sm text-muted">{total} gewählt</span>}
          </h2>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="btn-ghost">
              Abbrechen
            </button>
            <button type="button" onClick={confirm} disabled={total === 0} className="btn-accent disabled:opacity-50">
              {total ? `${total} hinzufügen` : "Hinzufügen"}
            </button>
          </div>
        </div>

        {/* Reiter: die beiden Arten von Einträgen */}
        <div className="flex gap-1 border-b px-5 pt-3">
          <TabButton active={tab === "photos"} onClick={() => setTab("photos")}>
            Einzelbilder
            {pickedPhotos.size > 0 && <Badge>{pickedPhotos.size}</Badge>}
          </TabButton>
          <TabButton active={tab === "albums"} onClick={() => setTab("albums")}>
            Ganze Alben
            {pickedAlbums.size > 0 && <Badge>{pickedAlbums.size}</Badge>}
          </TabButton>
        </div>

        {tab === "photos" ? (
          <>
            <div className="flex flex-wrap items-center gap-2 border-b px-5 py-3">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Suche (Album, Bildunterschrift, Kategorie …)"
                className="input h-9 min-w-52 flex-1 py-1 text-sm"
              />
              <select
                value={albumId}
                onChange={(e) => setAlbumId(e.target.value)}
                aria-label="Album-Filter"
                className="input h-9 w-auto py-1 text-sm"
              >
                <option value="">Alle Alben</option>
                {library.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.title}
                  </option>
                ))}
              </select>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                aria-label="Kategorie-Filter"
                className="input h-9 w-auto py-1 text-sm"
              >
                <option value="">Alle Kategorien</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
                {uncategorized > 0 && (
                  <option value={NO_CATEGORY}>ohne Kategorie ({uncategorized})</option>
                )}
              </select>
              <button
                type="button"
                onClick={() => setFavsOnly((v) => !v)}
                aria-pressed={favsOnly}
                className={`chip h-9 px-3 text-sm transition ${
                  favsOnly ? "bg-accent text-[hsl(var(--accent-ink))]" : "border hover:border-ink"
                }`}
              >
                ★ Favoriten
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              {filtered.length === 0 ? (
                <p className="py-12 text-center text-sm text-muted">Keine Bilder gefunden.</p>
              ) : (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 md:grid-cols-6">
                  {filtered.map((photo) => {
                    const already = usedPhotoKeys.has(photo.storageKey);
                    const active = pickedPhotos.has(photo.storageKey);
                    return (
                      <button
                        key={photo.storageKey}
                        type="button"
                        onClick={() =>
                          !already && toggle(pickedPhotos, photo.storageKey, setPickedPhotos)
                        }
                        disabled={already}
                        title={
                          already
                            ? "Schon auf der Startseite"
                            : `${photo.albumTitle} · ${photo.effCategory ?? "ohne Kategorie"}`
                        }
                        className={`group relative aspect-square overflow-hidden rounded ring-2 transition ${
                          already
                            ? "cursor-not-allowed opacity-40 ring-transparent"
                            : active
                              ? "ring-accent"
                              : "ring-transparent hover:ring-line"
                        }`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={mediaUrl(photo.storageKey, "thumb")}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                        {photo.isFavorite && (
                          <span className="absolute left-1 top-1 text-amber-400 drop-shadow">★</span>
                        )}
                        {/* Fehlende Kategorie sichtbar machen — sie entscheidet
                            darüber, ob das Bild in der Filterleiste auftaucht. */}
                        {!photo.effCategory && (
                          <span className="absolute inset-x-0 bottom-0 bg-black/55 py-0.5 text-[9px] uppercase tracking-wide text-white/90">
                            ohne Kategorie
                          </span>
                        )}
                        {(active || already) && (
                          <span className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-accent text-xs text-[hsl(var(--accent-ink))]">
                            ✓
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 overflow-y-auto p-5">
            <p className="mb-3 text-sm text-muted">
              Ein Album erscheint als eine Kachel. Ein Klick darauf öffnet auf der Startseite sein
              Bild-Grid — anders als Einzelbilder, die direkt die Lightbox öffnen.
            </p>
            {albums.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted">Noch keine Alben mit Bildern.</p>
            ) : (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {albums.map((a) => {
                  const already = usedAlbumIds.has(a.id);
                  const active = pickedAlbums.has(a.id);
                  const blocked = a.hasPassword;
                  const disabled = already || blocked;
                  return (
                    <li key={a.id}>
                      <button
                        type="button"
                        onClick={() => !disabled && toggle(pickedAlbums, a.id, setPickedAlbums)}
                        disabled={disabled}
                        title={
                          blocked
                            ? "Passwortgeschützt — kann nicht öffentlich gezeigt werden"
                            : already
                              ? "Schon auf der Startseite"
                              : undefined
                        }
                        className={`w-full overflow-hidden rounded-lg border text-left transition ${
                          disabled
                            ? "cursor-not-allowed opacity-45"
                            : active
                              ? "ring-2 ring-accent"
                              : "hover:border-ink"
                        }`}
                      >
                        <div className="relative aspect-[4/3] bg-surface">
                          {a.photos[0] && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={mediaUrl(a.photos[0].storageKey, "thumb")}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          )}
                          {(active || already) && (
                            <span className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-accent text-xs text-[hsl(var(--accent-ink))]">
                              ✓
                            </span>
                          )}
                          {blocked && (
                            <span className="absolute left-1.5 top-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
                              Passwort
                            </span>
                          )}
                        </div>
                        <div className="px-2.5 py-2">
                          <p className="truncate text-sm font-medium">{a.title}</p>
                          <p className="truncate text-[11px] text-muted">
                            {a.photos.length} Bilder ·{" "}
                            {a.category ?? <span className="italic">ohne Kategorie</span>}
                          </p>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`-mb-px flex items-center gap-2 border-b-2 px-3 py-2 text-sm transition ${
        active ? "border-accent font-medium text-ink" : "border-transparent text-muted hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-accent px-1.5 text-[10px] text-[hsl(var(--accent-ink))]">
      {children}
    </span>
  );
}
