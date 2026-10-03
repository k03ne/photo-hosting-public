"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import type { Block, BlockType } from "@/themes/schema";
import { BLOCK_META, BLOCK_ORDER, createBlock } from "@/themes/block-defaults";
import { savePageBlocks, updatePageMeta, deletePage } from "@/server/actions/pages";
import { mediaUrl } from "@/lib/media";
import { LivePreview } from "@/components/admin/LivePreview";

type LibraryPhoto = {
  storageKey: string;
  blurDataUrl: string | null;
  caption: string | null;
  category: string | null;
  isFavorite: boolean;
  width: number;
  height: number;
};
type LibraryAlbum = {
  id: string;
  title: string;
  category: string | null;
  photos: LibraryPhoto[];
};

interface PageEditorProps {
  pageId: string;
  title: string;
  slug: string;
  isPublished: boolean;
  /** Ist dies die Startseite? Dann liegt sie öffentlich unter `/`. */
  isHome: boolean;
  /** Seitenart: CUSTOM | HOME | IMPRINT | PRIVACY | CONTACT. System-Seiten
   *  (≠ CUSTOM) sind nicht löschbar. */
  kind: string;
  /** Aktives Website-Theme — für die Live-Vorschau. */
  theme: string;
  /** Aus den globalen Einstellungen abgeleitete Farb-/Schrift-Tokens. Unterseiten
   *  erben sie immer; die Vorschau muss sie deshalb ebenfalls anlegen. */
  tokenOverrides?: Record<string, string>;
  initialBlocks: Block[];
  library: LibraryAlbum[];
}

/** Ziel einer offenen Bildauswahl. */
type PickerTarget = { blockId: string; mode: "single" | "multi" };

export function PageEditor({
  pageId,
  title,
  slug,
  isPublished,
  isHome,
  kind,
  theme,
  tokenOverrides,
  initialBlocks,
  library,
}: PageEditorProps) {
  const [blocks, setBlocks] = useState<Block[]>(initialBlocks);
  const [baseline, setBaseline] = useState(() => JSON.stringify(initialBlocks));
  const [picker, setPicker] = useState<PickerTarget | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isSaving, startSave] = useTransition();

  // Karten-Refs, um bei Auswahl aus der Vorschau die passende Karte einzublenden.
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  useEffect(() => {
    if (!activeId) return;
    cardRefs.current[activeId]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeId]);

  const snapshot = useMemo(() => JSON.stringify(blocks), [blocks]);
  const dirty = snapshot !== baseline;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  // --- Blockoperationen -----------------------------------------------------

  function addBlock(type: BlockType) {
    setBlocks((prev) => [...prev, createBlock(type)]);
  }

  function removeBlock(id: string) {
    setBlocks((prev) => prev.filter((b) => b.id !== id));
  }

  /** Merge in `block.data`. Union-Typ → hier bewusst locker typisiert. */
  function patchData(id: string, patch: Record<string, unknown>) {
    setBlocks((prev) =>
      prev.map((b) => (b.id === id ? ({ ...b, data: { ...b.data, ...patch } } as Block) : b)),
    );
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setBlocks((prev) => {
      const from = prev.findIndex((b) => b.id === active.id);
      const to = prev.findIndex((b) => b.id === over.id);
      if (from === -1 || to === -1) return prev;
      return arrayMove(prev, from, to);
    });
  }

  function handleSave() {
    setError(null);
    const toPersist = snapshot;
    startSave(async () => {
      try {
        await savePageBlocks(pageId, blocks);
        setBaseline(toPersist);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Speichern fehlgeschlagen.");
      }
    });
  }

  // --- Bildauswahl ----------------------------------------------------------

  function applyPick(storageKey: string) {
    if (!picker) return;
    const target = blocks.find((b) => b.id === picker.blockId);
    if (!target) return;

    if (picker.mode === "single") {
      patchData(picker.blockId, { imageKey: storageKey });
      setPicker(null);
      return;
    }
    // multi: togglen (Galerie-, Portfolio-Raster- und Hero-Scatter-Blöcke halten `photoKeys`)
    if (
      target.type === "gallery" ||
      target.type === "portfolioGrid" ||
      target.type === "heroScatter"
    ) {
      const current = target.data.photoKeys;
      const next = current.includes(storageKey)
        ? current.filter((k) => k !== storageKey)
        : [...current, storageKey];
      patchData(picker.blockId, { photoKeys: next });
    }
  }

  const bindMeta = updatePageMeta.bind(null, pageId);
  const bindDelete = deletePage.bind(null, pageId);

  return (
    <div className="space-y-8">
      {/* Kopf: Meta + Aktionen */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/admin/pages" className="text-sm text-muted transition hover:text-ink">
            ← Seiten
          </Link>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-1 text-sm text-muted">
            Öffentlich unter{" "}
            <Link href={isHome ? "/" : `/${slug}`} className="underline" target="_blank">
              {isHome ? "/ (Startseite)" : `/${slug}`}
            </Link>
          </p>
        </div>

        <form action={bindMeta} className="card flex flex-wrap items-end gap-3 p-4">
          <label className="block text-sm">
            <span className="mb-1 block text-muted">Titel</span>
            <input name="title" defaultValue={title} className="input" />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="isPublished"
              defaultChecked={isPublished}
              className="h-4 w-4"
            />
            Veröffentlicht
          </label>
          <button type="submit" className="btn-ghost">
            Übernehmen
          </button>
        </form>
      </div>

      {/* Split-View: links Steuerung, rechts Live-Vorschau */}
      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        {/* LINKS: Palette + Blockliste */}
        <div className="space-y-6">
          {/* Block-Palette */}
          <section className="card p-4">
            <h2 className="mb-3 text-sm font-medium text-muted">Block hinzufügen</h2>
            <div className="flex flex-wrap gap-2">
              {BLOCK_ORDER.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => addBlock(type)}
                  className="chip border px-3 py-2 transition hover:border-ink"
                  title={BLOCK_META[type].hint}
                >
                  <span className="mr-1.5">{BLOCK_META[type].icon}</span>
                  {BLOCK_META[type].label}
                </button>
              ))}
            </div>
          </section>

          {/* Blockliste (sortierbar) */}
          {blocks.length === 0 ? (
            <div className="card grid place-items-center border-dashed p-16 text-center text-sm text-muted">
              Noch keine Blöcke. Füge oben deinen ersten Block hinzu.
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={blocks.map((b) => b.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-4">
                  {blocks.map((block) => (
                    <SortableBlock
                      key={block.id}
                      block={block}
                      library={library}
                      isActive={block.id === activeId}
                      onActivate={() => setActiveId(block.id)}
                      registerRef={(el) => {
                        cardRefs.current[block.id] = el;
                      }}
                      onPatch={patchData}
                      onRemove={removeBlock}
                      onOpenPicker={setPicker}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>

        {/* RECHTS: Live-Vorschau (klebt, füllt die Höhe) */}
        <div className="h-[70vh] lg:sticky lg:top-6 lg:h-[calc(100vh-7rem)]">
          <LivePreview
            blocks={blocks}
            theme={theme}
            tokenOverrides={tokenOverrides}
            library={library}
            activeBlockId={activeId}
            onSelectBlock={setActiveId}
          />
        </div>
      </div>

      {/* Speicherleiste (fixiert) */}
      <div className="sticky bottom-4 z-20 flex items-center justify-between gap-4 rounded-xl border bg-surface/90 px-5 py-3 backdrop-blur">
        <div className="text-sm text-muted">
          {error ? (
            <span className="text-red-600">{error}</span>
          ) : dirty ? (
            "Ungespeicherte Änderungen"
          ) : (
            "Alles gespeichert"
          )}
        </div>
        <div className="flex items-center gap-2">
          {kind === "CUSTOM" && (
            <form action={bindDelete}>
              <button
                type="submit"
                className="btn-ghost text-red-600"
                onClick={(e) => {
                  if (!confirm("Diese Seite endgültig löschen?")) e.preventDefault();
                }}
              >
                Löschen
              </button>
            </form>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={!dirty || isSaving}
            className="btn-accent disabled:opacity-40"
          >
            {isSaving ? "Speichert …" : "Speichern"}
          </button>
        </div>
      </div>

      {/* Bildauswahl-Overlay */}
      {picker && (
        <ImagePicker
          library={library}
          mode={picker.mode}
          selected={selectedKeys(blocks, picker)}
          onPick={applyPick}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  );
}

/** Aktuell gewählte Keys für die Hervorhebung im Picker. */
function selectedKeys(blocks: Block[], picker: PickerTarget): string[] {
  const b = blocks.find((x) => x.id === picker.blockId);
  if (!b) return [];
  if (b.type === "hero") return b.data.imageKey ? [b.data.imageKey] : [];
  if (b.type === "gallery") return b.data.photoKeys;
  if (b.type === "portfolioGrid") return b.data.photoKeys;
  if (b.type === "heroScatter") return b.data.photoKeys;
  return [];
}

// ---------------------------------------------------------------------------
// Sortierbare Blockkarte
// ---------------------------------------------------------------------------

interface SortableBlockProps {
  block: Block;
  library: LibraryAlbum[];
  isActive: boolean;
  onActivate: () => void;
  registerRef: (el: HTMLDivElement | null) => void;
  onPatch: (id: string, patch: Record<string, unknown>) => void;
  onRemove: (id: string) => void;
  onOpenPicker: (target: PickerTarget) => void;
}

function SortableBlock({
  block,
  library,
  isActive,
  onActivate,
  registerRef,
  onPatch,
  onRemove,
  onOpenPicker,
}: SortableBlockProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: block.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  return (
    <div
      ref={(el) => {
        setNodeRef(el);
        registerRef(el);
      }}
      style={style}
      onFocusCapture={onActivate}
      onMouseDown={onActivate}
      className={`card p-4 transition ${
        isActive ? "ring-2 ring-blue-500" : "ring-0"
      }`}
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="cursor-grab text-muted active:cursor-grabbing"
            aria-label="Verschieben"
            {...attributes}
            {...listeners}
          >
            ⠿
          </button>
          <span className="text-sm font-medium">
            {BLOCK_META[block.type].icon} {BLOCK_META[block.type].label}
          </span>
        </div>
        <button
          type="button"
          onClick={() => onRemove(block.id)}
          className="text-sm text-muted transition hover:text-red-600"
        >
          Entfernen
        </button>
      </div>

      <BlockFields
        block={block}
        library={library}
        onPatch={onPatch}
        onOpenPicker={onOpenPicker}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Feld-Editoren je Blocktyp
// ---------------------------------------------------------------------------

interface FieldsProps {
  block: Block;
  library: LibraryAlbum[];
  onPatch: (id: string, patch: Record<string, unknown>) => void;
  onOpenPicker: (target: PickerTarget) => void;
}

function BlockFields({ block, library, onPatch, onOpenPicker }: FieldsProps) {
  switch (block.type) {
    case "hero":
      return (
        <div className="grid gap-3">
          <Field label="Überschrift">
            <input
              className="input"
              value={block.data.headline}
              onChange={(e) => onPatch(block.id, { headline: e.target.value })}
            />
          </Field>
          <Field label="Unterzeile">
            <input
              className="input"
              value={block.data.subline ?? ""}
              onChange={(e) => onPatch(block.id, { subline: e.target.value })}
            />
          </Field>
          <Segmented
            label="Ausrichtung"
            value={block.data.align}
            options={[
              ["left", "Links"],
              ["center", "Mitte"],
              ["right", "Rechts"],
            ]}
            onChange={(v) => onPatch(block.id, { align: v })}
          />
          <ImageField
            label="Hintergrundbild"
            keys={block.data.imageKey ? [block.data.imageKey] : []}
            onPick={() => onOpenPicker({ blockId: block.id, mode: "single" })}
            onClear={() => onPatch(block.id, { imageKey: undefined })}
          />
        </div>
      );

    case "heroScatter": {
      const manual = block.data.source === "manual";
      return (
        <div className="grid gap-3">
          <Field label="Titel / Name">
            <input
              className="input"
              value={block.data.title}
              onChange={(e) => onPatch(block.id, { title: e.target.value })}
            />
          </Field>
          <Field label="Unterzeile (optional)">
            <input
              className="input"
              value={block.data.subtitle ?? ""}
              onChange={(e) => onPatch(block.id, { subtitle: e.target.value || undefined })}
            />
          </Field>
          <Segmented
            label="Bildquelle"
            value={block.data.source}
            options={[
              ["categories", "Alle Kategorien"],
              ["albums", "Öffentliche Alben"],
              ["manual", "Manuelle Auswahl"],
            ]}
            onChange={(v) => onPatch(block.id, { source: v })}
          />

          {manual ? (
            <ImageField
              label="Bilder"
              keys={block.data.photoKeys}
              multi
              onPick={() => onOpenPicker({ blockId: block.id, mode: "multi" })}
              onClear={() => onPatch(block.id, { photoKeys: [] })}
            />
          ) : (
            <Field label="Anzahl Bilder">
              <input
                type="number"
                min={3}
                max={40}
                className="input"
                value={block.data.count}
                onChange={(e) =>
                  onPatch(block.id, {
                    count: Math.min(40, Math.max(3, Number(e.target.value) || 3)),
                  })
                }
              />
            </Field>
          )}

          <Field label={`Reveal-Staffelung (${Math.round(block.data.intensity * 100)}%)`}>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(block.data.intensity * 100)}
              onChange={(e) => onPatch(block.id, { intensity: Number(e.target.value) / 100 })}
              className="w-full"
            />
          </Field>
          <p className="text-xs text-muted">
            Der Wortmark-Hero deckt sein Bilderraster beim Scrollen auf; die Staffelung steuert,
            wie stark die äußeren Spalten nachziehen. Bei reduzierter Bewegung wird das Raster
            statisch voll angezeigt. Für automatische Quellen zählen nur veröffentlichte Bilder.
          </p>
        </div>
      );
    }

    case "text":
      return (
        <div className="grid gap-3">
          <Field label="Überschrift (optional)">
            <input
              className="input"
              value={block.data.heading ?? ""}
              onChange={(e) => onPatch(block.id, { heading: e.target.value })}
            />
          </Field>
          <Field label="Text">
            <textarea
              className="input min-h-28"
              value={block.data.body}
              onChange={(e) => onPatch(block.id, { body: e.target.value })}
            />
          </Field>
          <Segmented
            label="Ausrichtung"
            value={block.data.align}
            options={[
              ["left", "Links"],
              ["center", "Mitte"],
            ]}
            onChange={(v) => onPatch(block.id, { align: v })}
          />
        </div>
      );

    case "gallery": {
      const usingAlbum = Boolean(block.data.albumId);
      return (
        <div className="grid gap-3">
          <Field label="Quelle">
            <select
              className="input"
              value={block.data.albumId ?? ""}
              onChange={(e) => onPatch(block.id, { albumId: e.target.value || undefined })}
            >
              <option value="">Manuelle Auswahl</option>
              {library.map((album) => (
                <option key={album.id} value={album.id}>
                  Album: {album.title}
                </option>
              ))}
            </select>
          </Field>

          {usingAlbum ? (
            <p className="text-sm text-muted">
              Zeigt automatisch alle Bilder des Albums in dessen Reihenfolge.
            </p>
          ) : (
            <ImageField
              label="Bilder"
              keys={block.data.photoKeys}
              multi
              onPick={() => onOpenPicker({ blockId: block.id, mode: "multi" })}
              onClear={() => onPatch(block.id, { photoKeys: [] })}
            />
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Spalten">
              <input
                type="number"
                min={1}
                max={6}
                className="input"
                value={block.data.columns}
                onChange={(e) =>
                  onPatch(block.id, { columns: Math.min(6, Math.max(1, Number(e.target.value) || 1)) })
                }
              />
            </Field>
            <Segmented
              label="Layout"
              value={block.data.layout}
              options={[
                ["masonry", "Masonry"],
                ["grid", "Raster"],
                ["justified", "Justiert"],
              ]}
              onChange={(v) => onPatch(block.id, { layout: v })}
            />
          </div>
        </div>
      );
    }

    case "portfolioGrid":
      return (
        <div className="grid gap-3">
          <Field label="Titel (optional)">
            <input
              className="input"
              value={block.data.title ?? ""}
              onChange={(e) => onPatch(block.id, { title: e.target.value || undefined })}
            />
          </Field>

          <ImageField
            label="Kuratierte Bilder"
            keys={block.data.photoKeys}
            multi
            onPick={() => onOpenPicker({ blockId: block.id, mode: "multi" })}
            onClear={() => onPatch(block.id, { photoKeys: [] })}
          />
          <p className="text-xs text-muted">
            Kategorie-Tabs entstehen automatisch aus der Kategorie der Bilder (bzw. der
            Album-Kategorie). „Overview“ zeigt alle. Nur die hier gewählten Bilder erscheinen
            öffentlich.
          </p>

          <Segmented
            label="Overview zeigt"
            value={block.data.selection}
            options={[
              ["all", "Alle Bilder"],
              ["random", "Zufallsauswahl"],
            ]}
            onChange={(v) => onPatch(block.id, { selection: v })}
          />
          {block.data.selection === "random" && (
            <Field label="Anzahl (Zufall)">
              <input
                type="number"
                min={1}
                max={60}
                className="input"
                value={block.data.randomCount}
                onChange={(e) =>
                  onPatch(block.id, {
                    randomCount: Math.min(60, Math.max(1, Number(e.target.value) || 1)),
                  })
                }
              />
            </Field>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Spalten">
              <input
                type="number"
                min={1}
                max={6}
                className="input"
                value={block.data.columns}
                onChange={(e) =>
                  onPatch(block.id, { columns: Math.min(6, Math.max(1, Number(e.target.value) || 1)) })
                }
              />
            </Field>
            <Segmented
              label="Layout"
              value={block.data.layout}
              options={[
                ["masonry", "Masonry"],
                ["grid", "Raster"],
                ["justified", "Justiert"],
              ]}
              onChange={(v) => onPatch(block.id, { layout: v })}
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={block.data.showCategories}
              onChange={(e) => onPatch(block.id, { showCategories: e.target.checked })}
            />
            Kategorie-Menü anzeigen
          </label>
        </div>
      );

    case "contactForm":
      return (
        <div className="grid gap-3">
          <Field label="Überschrift (optional)">
            <input
              className="input"
              value={block.data.heading ?? ""}
              onChange={(e) => onPatch(block.id, { heading: e.target.value })}
            />
          </Field>
          <Field label="Ziel-E-Mail">
            <input
              type="email"
              className="input"
              value={block.data.email}
              onChange={(e) => onPatch(block.id, { email: e.target.value })}
            />
          </Field>
          <Field label="Felder">
            <div className="flex flex-wrap gap-3">
              {(["name", "email", "phone", "message"] as const).map((f) => {
                const checked = block.data.fields.includes(f);
                return (
                  <label key={f} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        const next = checked
                          ? block.data.fields.filter((x) => x !== f)
                          : [...block.data.fields, f];
                        onPatch(block.id, { fields: next });
                      }}
                    />
                    {f}
                  </label>
                );
              })}
            </div>
          </Field>
        </div>
      );
  }
}

// ---------------------------------------------------------------------------
// Kleine UI-Bausteine
// ---------------------------------------------------------------------------

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-muted">{label}</span>
      {children}
    </label>
  );
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: [T, string][];
  onChange: (v: T) => void;
}) {
  return (
    <div className="text-sm">
      <span className="mb-1 block text-muted">{label}</span>
      <div className="inline-flex overflow-hidden rounded-lg border">
        {options.map(([val, lbl]) => (
          <button
            key={val}
            type="button"
            onClick={() => onChange(val)}
            className={`px-3 py-1.5 transition ${
              value === val ? "bg-accent text-[hsl(var(--accent-ink))]" : "hover:bg-surface"
            }`}
          >
            {lbl}
          </button>
        ))}
      </div>
    </div>
  );
}

function ImageField({
  label,
  keys,
  multi,
  onPick,
  onClear,
}: {
  label: string;
  keys: string[];
  multi?: boolean;
  onPick: () => void;
  onClear: () => void;
}) {
  return (
    <div className="text-sm">
      <span className="mb-1 block text-muted">{label}</span>
      <div className="flex flex-wrap items-center gap-2">
        {keys.map((key) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={key}
            src={mediaUrl(key, "thumb")}
            alt=""
            className="h-14 w-14 rounded object-cover"
          />
        ))}
        <button type="button" onClick={onPick} className="btn-ghost">
          {multi ? "Bilder wählen" : keys.length ? "Ändern" : "Bild wählen"}
        </button>
        {keys.length > 0 && (
          <button type="button" onClick={onClear} className="text-muted hover:text-red-600">
            Entfernen
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bildauswahl-Overlay
// ---------------------------------------------------------------------------

/**
 * Globaler Kuratierungs-Browser: durchsucht die GESAMTE Mediathek (alle Alben)
 * mit Suche + Filtern (Album, Kategorie, nur Favoriten). Multi-Modus kuratiert
 * `photoKeys`; Single-Modus wählt ein Bild (Hero). Nur die Auswahl wird
 * öffentlich — Browsen ≠ Veröffentlichen.
 */
function ImagePicker({
  library,
  mode,
  selected,
  onPick,
  onClose,
}: {
  library: LibraryAlbum[];
  mode: "single" | "multi";
  selected: string[];
  onPick: (key: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [albumId, setAlbumId] = useState("");
  const [category, setCategory] = useState("");
  const [favsOnly, setFavsOnly] = useState(false);

  // Alle Fotos flach, mit Album-Kontext + effektiver Kategorie.
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
      Array.from(
        new Set(allPhotos.map((p) => p.effCategory).filter((c): c is string => !!c)),
      ).sort((a, b) => a.localeCompare(b, "de")),
    [allPhotos],
  );

  const q = query.trim().toLowerCase();
  const filtered = allPhotos.filter((p) => {
    if (albumId && p.albumId !== albumId) return false;
    if (category && p.effCategory !== category) return false;
    if (favsOnly && !p.isFavorite) return false;
    if (q) {
      const hay = `${p.albumTitle} ${p.caption ?? ""} ${p.effCategory ?? ""} ${p.storageKey}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-canvas"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Kopf */}
        <div className="flex items-center justify-between gap-3 border-b px-5 py-3">
          <h2 className="font-medium">
            {mode === "multi" ? "Bilder auswählen" : "Bild auswählen"}
            <span className="ml-2 text-sm text-muted">
              {mode === "multi" ? `${selected.length} gewählt · ` : ""}
              {filtered.length} Bilder
            </span>
          </h2>
          <button type="button" onClick={onClose} className="btn-accent">
            {mode === "multi" ? "Fertig" : "Schließen"}
          </button>
        </div>

        {/* Filterleiste */}
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
          </select>
          <button
            type="button"
            onClick={() => setFavsOnly((v) => !v)}
            aria-pressed={favsOnly}
            className={`chip flex h-9 items-center gap-1.5 px-3 text-sm transition ${
              favsOnly ? "bg-accent text-[hsl(var(--accent-ink))]" : "border hover:border-ink"
            }`}
          >
            <PickerStar filled className="h-3.5 w-3.5" />
            Favoriten
          </button>
        </div>

        {/* Raster */}
        <div className="flex-1 overflow-y-auto p-5">
          {filtered.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted">Keine Bilder gefunden.</p>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 md:grid-cols-6">
              {filtered.map((photo) => {
                const active = selected.includes(photo.storageKey);
                return (
                  <button
                    key={photo.storageKey}
                    type="button"
                    onClick={() => onPick(photo.storageKey)}
                    title={`${photo.albumTitle}${photo.effCategory ? " · " + photo.effCategory : ""}`}
                    className={`group relative aspect-square overflow-hidden rounded ring-2 transition ${
                      active ? "ring-accent" : "ring-transparent hover:ring-line"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={mediaUrl(photo.storageKey, "thumb")}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                    {photo.isFavorite && (
                      <span className="absolute left-1 top-1 text-amber-400 drop-shadow">
                        <PickerStar filled className="h-3.5 w-3.5" />
                      </span>
                    )}
                    {active && (
                      <span className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-accent text-xs text-[hsl(var(--accent-ink))]">
                        ✓
                      </span>
                    )}
                    <span className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/60 to-transparent px-1.5 pb-1 pt-4 text-[10px] text-white opacity-0 transition group-hover:opacity-100">
                      {photo.albumTitle}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Kleiner Stern (Favoriten-Indikator im Picker). */
function PickerStar({ filled, className }: { filled?: boolean; className?: string }) {
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
