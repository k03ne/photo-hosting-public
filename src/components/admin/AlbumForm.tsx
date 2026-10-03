"use client";

import { useActionState, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { LayoutPicker } from "@/components/admin/LayoutPicker";
import { ALBUM_FONTS, headerFontClass, headerLayout } from "@/lib/header-style";
import type { AlbumFormState } from "@/server/actions/albums";
import { setCoverFocus } from "@/server/actions/photos";

type AlbumDefaults = {
  id?: string;
  title?: string;
  description?: string | null;
  category?: string | null;
  layout?: "MASONRY" | "GRID" | "JUSTIFIED";
  columns?: number;
  gridSpacing?: string;
  coverUrl?: string | null;
  coverBlurPx?: number;
  coverOverlay?: number;
  coverFocusX?: number;
  coverFocusY?: number;
  showExif?: boolean;
  headerTitlePos?: string;
  headerAlign?: string;
  headerFont?: string;
  headerButton?: string;
  headerTextColor?: string | null;
  themeMode?: string;
  bgColor?: string | null;
  /** Bilder für die Raster-Vorschau — mit Seitenverhältnis für Masonry/Justified. */
  previewPhotos?: PreviewPhoto[];
};

export type PreviewPhoto = { url: string; ratio: number };

type Props = {
  action: (
    prevState: AlbumFormState,
    formData: FormData,
  ) => Promise<AlbumFormState>;
  album?: AlbumDefaults;
  submitLabel: string;
};

const inputClass = "input";

/**
 * Album-Einstellungen als moderner Live-Preview-Editor: links aufgeräumte
 * Akkordeon-Sektionen mit den Kontrollen, rechts EINE große, klebende Vorschau
 * (echter Galerie-Kopf + Raster + Kundenlogin), die alle Änderungen sofort
 * spiegelt. Auf Mobil klappt das Layout zu einer Spalte — Vorschau oben,
 * Kontrollen darunter. Feldnamen bleiben unverändert (Server-Action-kompatibel).
 */
export function AlbumForm({ action, album, submitLabel }: Props) {
  const [state, formAction, isPending] = useActionState(action, {});
  const [title, setTitle] = useState(album?.title ?? "");
  const [description, setDescription] = useState(album?.description ?? "");
  const [category, setCategory] = useState(album?.category ?? "");
  const [layout, setLayout] = useState(album?.layout ?? "MASONRY");
  const [columns, setColumns] = useState(album?.columns ?? 3);
  const [spacing, setSpacing] = useState(album?.gridSpacing ?? "REGULAR");
  const [coverBlurPx, setCoverBlurPx] = useState(album?.coverBlurPx ?? 0);
  const [coverOverlay, setCoverOverlay] = useState(album?.coverOverlay ?? 25);
  // Fokuspunkt des Covers (in %); wird SOFORT per eigener Action gespeichert
  // (nicht Teil des Formular-Snapshots/Dirty-Checks).
  const [focusX, setFocusX] = useState(album?.coverFocusX ?? 50);
  const [focusY, setFocusY] = useState(album?.coverFocusY ?? 50);
  const [titlePos, setTitlePos] = useState(album?.headerTitlePos ?? "CENTER");
  const [align, setAlign] = useState(album?.headerAlign ?? "CENTER");
  // Legacy „DISPLAY" auf das neue Preset „MODERN" abbilden.
  const [font, setFont] = useState(
    !album?.headerFont || album.headerFont === "DISPLAY" ? "MODERN" : album.headerFont,
  );
  const [button, setButton] = useState(album?.headerButton ?? "UNDER");
  const [textColor, setTextColor] = useState(album?.headerTextColor ?? "");
  const [themeMode, setThemeMode] = useState(album?.themeMode ?? "AUTO");
  const [bgColor, setBgColor] = useState(album?.bgColor ?? "");
  const [showExif, setShowExif] = useState(album?.showExif ?? false);
  const fe = state.fieldErrors ?? {};

  const isNew = !album?.id;
  const hasCover = !!album?.coverUrl;
  const [toast, setToast] = useState<{ type: "ok" | "err"; msg: string } | null>(
    null,
  );

  // „Dirty" per Momentaufnahme-Vergleich (robust auch für Segment-/Button-Felder,
  // die keine nativen change-Events feuern). `baseline` wird nach dem Speichern
  // aktualisiert, damit der Button dann wieder verschwindet.
  const snapshot = JSON.stringify([
    title,
    description,
    category,
    layout,
    columns,
    spacing,
    coverBlurPx,
    coverOverlay,
    titlePos,
    align,
    font,
    button,
    textColor,
    themeMode,
    bgColor,
    showExif,
  ]);
  const [baseline, setBaseline] = useState(snapshot);
  const dirty = snapshot !== baseline;
  const showSave = dirty || isNew;

  // Nach dem Speichern: Erfolg/Fehler als kurze Notification; bei Erfolg die
  // Basis aktualisieren (Button verschwindet).
  useEffect(() => {
    if (state.success) {
      setBaseline(snapshot);
      setToast({ type: "ok", msg: "Änderungen gespeichert." });
    } else if (state.error) {
      setToast({ type: "err", msg: state.error });
    } else {
      return;
    }
    const t = setTimeout(() => setToast(null), 2800);
    return () => clearTimeout(t);
    // Nur auf neue Server-Antworten reagieren, nicht auf jede Snapshot-Änderung.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form action={formAction}>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(300px,400px)]">
        {/* ── Live-Vorschau: mobil oben, Desktop rechts & klebend ────────────── */}
        <aside className="lg:order-2">
          <div className="lg:sticky lg:top-6">
            <UnifiedPreview
              title={title || "Albumtitel"}
              coverUrl={album?.coverUrl ?? null}
              coverBlurPx={coverBlurPx}
              coverOverlay={coverOverlay}
              focusX={focusX}
              focusY={focusY}
              titlePos={titlePos}
              align={align}
              font={font}
              button={button}
              textColor={textColor}
              themeMode={themeMode}
              bgColor={bgColor}
              layout={layout}
              columns={columns}
              spacing={spacing}
              previewPhotos={album?.previewPhotos ?? []}
            />
          </div>
        </aside>

        {/* ── Kontrollen als Akkordeon ───────────────────────────────────────── */}
        <div className="space-y-3 lg:order-1">
          <Section title="Allgemein" info="Titel, Beschreibung & Portfolio-Kategorie." defaultOpen>
            <div className="space-y-1.5">
              <label htmlFor="title" className="label">
                Titel
              </label>
              <input
                id="title"
                name="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                className={inputClass}
              />
              {fe.title && <p className="text-sm text-red-600">{fe.title[0]}</p>}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="description" className="label">
                Beschreibung <span className="text-muted">(optional)</span>
              </label>
              <textarea
                id="description"
                name="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className={inputClass}
              />
              {fe.description && (
                <p className="text-sm text-red-600">{fe.description[0]}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="category" className="label">
                Portfolio-Kategorie <span className="text-muted">(optional)</span>
              </label>
              <input
                id="category"
                name="category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="z. B. Portraits, Dokumentation, Hochzeit"
                className={inputClass}
              />
              <p className="text-xs text-muted">
                Genre des Albums fürs öffentliche Portfolio. Für Mischalben pro Bild
                überschreibbar. Ohne Wirkung auf die Kundengalerie.
              </p>
              {fe.category && <p className="text-sm text-red-600">{fe.category[0]}</p>}
            </div>
          </Section>

          <Section
            title="Cover & Kopfbereich"
            info="Cover-Bild, Bildausschnitt, Titel-Platzierung und Typografie des großen Kopfs über der Galerie."
            defaultOpen
          >
            {!hasCover && (
              <p className="rounded-lg border border-dashed px-3 py-2 text-xs text-muted">
                Noch kein Cover gewählt — lege in „Bilder" mit „Als Cover" ein
                Titelbild fest. Titel-Position & Schrift kannst du hier schon einstellen.
              </p>
            )}

            {/* Cover-Bildwirkung — nur wenn ein Cover vorhanden ist. Steht bewusst
                VOR dem Fokuspunkt: die Wirkung dieser Regler zeigt die Vorschau. */}
            {album?.coverUrl && (
              <div className="grid gap-4 sm:grid-cols-2">
                <SliderField
                  label="Weichzeichnen"
                  info="Zeichnet das Cover im Hintergrund weich — lenkt den Blick auf den Titel."
                  name="coverBlurPx"
                  min={0}
                  max={40}
                  value={coverBlurPx}
                  display={coverBlurPx === 0 ? "Aus" : `${coverBlurPx} px`}
                  onChange={setCoverBlurPx}
                />
                <SliderField
                  label="Abdunkelung"
                  info="Dunkler Schleier über dem Cover für besseren Kontrast des Titels."
                  name="coverOverlay"
                  min={0}
                  max={70}
                  value={coverOverlay}
                  display={`${coverOverlay} %`}
                  onChange={setCoverOverlay}
                />
              </div>
            )}

            {/* Fokuspunkt — nur bei vorhandenem Cover & gespeichertem Album.
                Bewusst als schmale Zeile mit Dialog: das große Cover-Bild hier
                wurde sonst für die Vorschau der Regler oben gehalten. */}
            {album?.coverUrl && album?.id && (
              <CoverFocusField
                albumId={album.id}
                coverUrl={album.coverUrl}
                x={focusX}
                y={focusY}
                onChange={(nx, ny) => {
                  setFocusX(nx);
                  setFocusY(ny);
                }}
              />
            )}

            <PositionPicker
              pos={titlePos}
              align={align}
              onChange={(p, a) => {
                setTitlePos(p);
                setAlign(a);
              }}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField
                label="Schriftart"
                name="headerFont"
                value={font}
                onChange={setFont}
                options={ALBUM_FONTS}
              />
              <SelectField
                label="„Zur Galerie“-Button"
                info="Sprungmarke vom Kopfbereich hinunter zur Galerie."
                name="headerButton"
                value={button}
                onChange={setButton}
                options={[
                  ["UNDER", "Unter dem Titel"],
                  ["BOTTOM", "Am unteren Rand"],
                  ["HIDDEN", "Ausblenden"],
                ]}
              />
            </div>
            <ColorField
              label="Textfarbe"
              name="headerTextColor"
              value={textColor}
              onChange={setTextColor}
              fallback={album?.coverUrl ? "#ffffff" : "#111111"}
              placeholder="Automatisch"
              info="Leer = automatisch: weiß auf dem Cover, dunkel ohne Cover."
              presets={["#ffffff", "#f5f5f4", "#111111", "#1f2937"]}
            />
          </Section>

          <Section
            title="Galerie-Layout"
            info="Anordnung der Bilder, Spaltenzahl und Abstand im Raster."
          >
            <div className="space-y-2">
              <span className="label flex items-center gap-1.5">
                Layout
                <InfoTip text="Mauerwerk: unterschiedliche Höhen. Raster: gleich große Kacheln. Ausgerichtet: volle Zeilen ohne Lücken." />
              </span>
              <LayoutPicker
                value={layout}
                columns={columns}
                spacing={spacing}
                onChange={setLayout}
              />
              <input type="hidden" name="layout" value={layout} />
            </div>

            <Stepper
              label="Spalten (Desktop)"
              info="Spaltenzahl am Desktop. Schmale Bildschirme zeigen automatisch weniger."
              name="columns"
              value={columns}
              min={1}
              max={6}
              onChange={setColumns}
              disabled={layout === "JUSTIFIED"}
              disabledHint="Bei „Ausgerichtet“ ohne Wirkung."
            />

            <SelectField
              label="Bild-Abstand"
              info="Abstand zwischen den Bildern in der Galerie."
              name="gridSpacing"
              value={spacing}
              onChange={setSpacing}
              options={[
                ["REGULAR", "Normal"],
                ["LARGE", "Großzügig"],
              ]}
            />
          </Section>

          <Section
            title="Hintergrund"
            info="Die Fläche rund um die Bilder in der Galerie — hell, dunkel oder eine eigene Farbe."
          >
            <BackgroundPicker
              themeMode={themeMode}
              bgColor={bgColor}
              onThemeMode={setThemeMode}
              onBgColor={setBgColor}
            />
          </Section>

          <Section title="Optionen" info="Zusätzliche Anzeigeoptionen der Galerie.">
            <Toggle
              label="Aufnahme-Metadaten in der Lightbox"
              info="Zeigt beim geöffneten Bild Kamera, Objektiv, ISO, Blende, Brennweite und Aufnahmezeit."
              name="showExif"
              checked={showExif}
              onChange={setShowExif}
            />
          </Section>
        </div>
      </div>

      {/* Verstecktes ID-Feld. */}
      {album?.id && <input type="hidden" name="id" value={album.id} />}

      {/* Schwebender Speichern-Button: erscheint erst bei Änderungen (neue Alben
          immer). Pille mit weichem Schatten. */}
      {showSave && (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center px-4">
          <button
            type="submit"
            disabled={isPending}
            className="btn-primary pointer-events-auto flex items-center gap-2 rounded-full px-5 py-3 shadow-[0_10px_30px_-6px_rgba(0,0,0,0.35)] ring-1 ring-black/10 transition hover:-translate-y-0.5 hover:shadow-[0_14px_34px_-6px_rgba(0,0,0,0.45)] disabled:translate-y-0"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M20 6 9 17l-5-5" />
            </svg>
            {isPending ? "Speichern…" : submitLabel}
          </button>
        </div>
      )}

      {/* Notification pro Speichervorgang. */}
      {toast && (
        <div
          role="status"
          className={`fixed bottom-20 left-1/2 z-50 -translate-x-1/2 rounded-full px-4 py-2 text-sm font-medium shadow-xl ${
            toast.type === "ok" ? "bg-ink text-canvas" : "bg-red-600 text-white"
          }`}
        >
          {toast.msg}
        </div>
      )}
    </form>
  );
}

/**
 * Kleines i-Icon mit Tooltip (Hover/Fokus/Tap). Die Blase wird per Portal an
 * `document.body` gehängt und `fixed` positioniert — sonst würde sie vom
 * `overflow-hidden` der Sektions-Karte abgeschnitten. Die x-Position wird am
 * Viewport geklemmt, damit nichts seitlich aus dem Bild läuft.
 */
function InfoTip({ text }: { text: string }) {
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const [tip, setTip] = useState<{ x: number; y: number; above: boolean } | null>(
    null,
  );

  const hide = () => setTip(null);
  const show = () => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    // Oberhalb anzeigen, wenn Platz ist — sonst darunter.
    const above = r.top > 110;
    const half = 116; // halbe Blasenbreite + Rand
    const x = Math.min(
      Math.max(r.left + r.width / 2, half),
      window.innerWidth - half,
    );
    setTip({ x, y: above ? r.top - 8 : r.bottom + 8, above });
  };

  // Scrollen/Resize verschiebt den Anker — Blase dann schließen statt verrutschen.
  useEffect(() => {
    if (!tip) return;
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => {
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
    };
  }, [tip]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label={text}
        onPointerEnter={show}
        onPointerLeave={hide}
        onFocus={show}
        onBlur={hide}
        onClick={(e) => {
          // Auf Touch gibt es kein Hover: Tippen schaltet die Blase um.
          e.preventDefault();
          if (tip) hide();
          else show();
        }}
        className="inline-flex shrink-0 text-muted transition hover:text-ink"
      >
        <svg
          viewBox="0 0 24 24"
          className="h-3.5 w-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.7}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M12 16v-4" />
          <path d="M12 8h.01" />
        </svg>
      </button>
      {tip &&
        createPortal(
          <span
            role="tooltip"
            style={{
              left: tip.x,
              top: tip.y,
              transform: `translate(-50%, ${tip.above ? "-100%" : "0"})`,
            }}
            className="pointer-events-none fixed z-[120] w-56 max-w-[calc(100vw-1.5rem)] rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[11px] font-normal normal-case leading-snug tracking-normal text-ink shadow-lg"
          >
            {text}
          </span>,
          document.body,
        )}
    </>
  );
}

/**
 * Aufklappbare Einstellungs-Sektion (Akkordeon, natives <details> — robust & a11y).
 * Ersetzt die früheren einzelnen Karten und hält die lange Liste aufgeräumt.
 */
function Section({
  title,
  info,
  defaultOpen = false,
  children,
}: {
  title: string;
  info?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details
      open={defaultOpen}
      className="group card overflow-hidden p-0 [&_summary::-webkit-details-marker]:hidden"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-5 py-4 transition hover:bg-surface">
        <span className="flex items-center gap-2 text-sm font-medium">
          {title}
          {info && <InfoTip text={info} />}
        </span>
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4 shrink-0 text-muted transition group-open:rotate-180"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </summary>
      <div className="space-y-4 border-t border-line px-5 pb-5 pt-4">{children}</div>
    </details>
  );
}

/** Slider mit Label, Tooltip und Live-Wert. */
function SliderField({
  label,
  info,
  name,
  min,
  max,
  value,
  display,
  onChange,
}: {
  label: string;
  info?: string;
  name: string;
  min: number;
  max: number;
  value: number;
  display: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm text-ink">
        <span className="flex items-center gap-1.5">
          {label}
          {info && <InfoTip text={info} />}
        </span>
        <span className="text-muted">{display}</span>
      </div>
      <input
        type="range"
        name={name}
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-ink"
      />
    </div>
  );
}

/**
 * Moderner An/Aus-Schalter (ersetzt die nackte Checkbox).
 *
 * WICHTIG: Das Label ist per `htmlFor` explizit mit der Checkbox verbunden. Ein
 * umschließendes <label> würde sich sonst auf das ERSTE bedienbare Element im
 * Inneren beziehen — das wäre der Info-Button, und der Schalter ließe sich gar
 * nicht mehr umlegen (die Checkbox selbst ist `sr-only`).
 */
function Toggle({
  label,
  info,
  name,
  checked,
  onChange,
}: {
  label: string;
  info?: string;
  name: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-1.5 text-sm text-ink">
        <label htmlFor={id} className="cursor-pointer">
          {label}
        </label>
        {info && <InfoTip text={info} />}
      </span>
      <label htmlFor={id} className="relative inline-flex shrink-0 cursor-pointer">
        <input
          id={id}
          type="checkbox"
          name={name}
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="peer sr-only"
        />
        <span className="h-6 w-11 rounded-full bg-neutral-300 transition peer-checked:bg-ink peer-focus-visible:ring-2 peer-focus-visible:ring-accent dark:bg-neutral-600" />
        <span className="pointer-events-none absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition peer-checked:translate-x-5" />
      </label>
    </div>
  );
}

/** Label-Zeile mit optionalem Tooltip (einheitlich über allen Feldern). */
function FieldLabel({ label, info }: { label: string; info?: string }) {
  return (
    <span className="flex items-center gap-1.5 text-xs font-medium text-muted">
      {label}
      {info && <InfoTip text={info} />}
    </span>
  );
}

/** Aufgeräumtes Dropdown statt Button-Reihe; sendet den Wert per verstecktem Input. */
function SelectField({
  label,
  name,
  value,
  onChange,
  options,
  info,
  disabled = false,
  disabledHint,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
  info?: string;
  disabled?: boolean;
  disabledHint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <FieldLabel label={label} info={info} />
      {/* Wert wird auch bei deaktivierter Auswahl weiter gesendet. */}
      <input type="hidden" name={name} value={value} />
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          aria-label={label}
          className={`input w-full appearance-none pr-9 ${
            disabled ? "cursor-not-allowed opacity-50" : ""
          }`}
        >
          {options.map(([val, lbl]) => (
            <option key={val} value={val}>
              {lbl}
            </option>
          ))}
        </select>
        <svg
          viewBox="0 0 24 24"
          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </div>
      {disabled && disabledHint && <p className="text-xs text-muted">{disabledHint}</p>}
    </div>
  );
}

/**
 * Visueller 3×3-Platzierungs-Wähler: ein Klick setzt Titel-Position (Zeile:
 * TOP/CENTER/BOTTOM) UND Ausrichtung (Spalte: LEFT/CENTER/RIGHT) zugleich —
 * ersetzt zwei Button-Reihen durch EIN sprechendes Bedienelement. Sendet beide
 * Werte über versteckte Inputs (Feldnamen unverändert).
 */
function PositionPicker({
  pos,
  align,
  onChange,
}: {
  pos: string;
  align: string;
  onChange: (pos: string, align: string) => void;
}) {
  const rows = ["TOP", "CENTER", "BOTTOM"];
  const cols = ["LEFT", "CENTER", "RIGHT"];
  return (
    <div className="space-y-1.5">
      <FieldLabel
        label="Titel-Platzierung"
        info="Wo der Titel im Kopfbereich sitzt — Klick wählt Höhe und Ausrichtung zugleich."
      />
      <input type="hidden" name="headerTitlePos" value={pos} />
      <input type="hidden" name="headerAlign" value={align} />
      <div className="grid aspect-[16/7] w-full max-w-[220px] grid-cols-3 grid-rows-3 gap-1 rounded-lg border border-line bg-surface p-1.5">
        {rows.map((r) =>
          cols.map((c) => {
            const activeCell = pos === r && align === c;
            return (
              <button
                key={`${r}-${c}`}
                type="button"
                onClick={() => onChange(r, c)}
                aria-pressed={activeCell}
                aria-label={`Titel ${r.toLowerCase()} / ${c.toLowerCase()}`}
                className="group grid place-items-center rounded transition hover:bg-ink/5"
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full transition ${
                    activeCell
                      ? "scale-150 bg-ink"
                      : "bg-muted/40 group-hover:bg-muted"
                  }`}
                />
              </button>
            );
          }),
        )}
      </div>
    </div>
  );
}

/** Kompakter Zahl-Stepper (−/Wert/+) statt einer langen Button-Reihe. */
function Stepper({
  label,
  info,
  name,
  value,
  min,
  max,
  onChange,
  disabled = false,
  disabledHint,
}: {
  label: string;
  info?: string;
  name: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  disabledHint?: string;
}) {
  const clamp = (v: number) => Math.max(min, Math.min(max, v));
  return (
    <div className="space-y-1.5">
      <FieldLabel label={label} info={info} />
      <input type="hidden" name={name} value={value} />
      <div
        className={`inline-flex items-center rounded-lg border border-line ${
          disabled ? "opacity-50" : ""
        }`}
      >
        <button
          type="button"
          onClick={() => onChange(clamp(value - 1))}
          disabled={disabled || value <= min}
          aria-label="Weniger"
          className="grid h-9 w-9 place-items-center text-lg text-muted transition hover:text-ink disabled:opacity-30"
        >
          −
        </button>
        <span className="w-9 text-center text-sm font-medium tabular-nums">{value}</span>
        <button
          type="button"
          onClick={() => onChange(clamp(value + 1))}
          disabled={disabled || value >= max}
          aria-label="Mehr"
          className="grid h-9 w-9 place-items-center text-lg text-muted transition hover:text-ink disabled:opacity-30"
        >
          +
        </button>
      </div>
      {disabled && disabledHint && <p className="text-xs text-muted">{disabledHint}</p>}
    </div>
  );
}

/** Prüft eine 6-stellige Hex-Farbe; leer/ungültig -> null. */
function validHex(value: string): string | null {
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value : null;
}

/**
 * EINE Entscheidung statt zwei sich widersprechender Felder: Der Hintergrund ist
 * entweder „Automatisch/Hell/Dunkel" (= `themeMode`) ODER eine eigene Farbe
 * (= `bgColor`). Vorher standen ein Modus-Dropdown und ein Farbfeld nebeneinander,
 * wobei die Farbe den Modus stillschweigend aushebelte — genau das war verwirrend.
 *
 * Beim Griff zur eigenen Farbe wird `themeMode` auf AUTO zurückgesetzt: dann
 * entscheidet die Helligkeit der Farbe über hellen/dunklen Text (siehe
 * `SharedGallery`), statt dass ein alter Zwangsmodus dagegen arbeitet.
 */
function BackgroundPicker({
  themeMode,
  bgColor,
  onThemeMode,
  onBgColor,
}: {
  themeMode: string;
  bgColor: string;
  onThemeMode: (v: string) => void;
  onBgColor: (v: string) => void;
}) {
  const custom = validHex(bgColor);
  // Eigene Farbe als eigener Zustand statt aus `bgColor` abgeleitet: sonst würde
  // das Farbfeld verschwinden, sobald man den Hex-Wert zum Neutippen leert.
  const [customMode, setCustomMode] = useState(!!custom);
  const choice = customMode ? "CUSTOM" : themeMode;

  // Vorschau-Fläche je Option (die „Automatisch"-Kachel zeigt beide Farben).
  const swatch = (id: string): React.CSSProperties => {
    if (id === "LIGHT") return { backgroundColor: LIGHT_BG };
    if (id === "DARK") return { backgroundColor: DARK_BG };
    if (id === "CUSTOM") return { backgroundColor: custom ?? "transparent" };
    return {
      backgroundImage: `linear-gradient(135deg, ${LIGHT_BG} 0%, ${LIGHT_BG} 50%, ${DARK_BG} 50%, ${DARK_BG} 100%)`,
    };
  };

  const options: [string, string][] = [
    ["AUTO", "Automatisch"],
    ["LIGHT", "Hell"],
    ["DARK", "Dunkel"],
    ["CUSTOM", "Eigene Farbe"],
  ];

  function pick(id: string) {
    if (id === "CUSTOM") {
      setCustomMode(true);
      onThemeMode("AUTO");
      onBgColor(custom ?? (themeMode === "DARK" ? DARK_BG : LIGHT_BG));
    } else {
      setCustomMode(false);
      onBgColor("");
      onThemeMode(id);
    }
  }

  return (
    <div className="space-y-3">
      {/* `themeMode` wird immer gesendet; `bgColor` nur bei eigener Farbe (das
          Feld unten liefert es) — fehlt es, gilt serverseitig „keine Farbe". */}
      <input type="hidden" name="themeMode" value={themeMode} />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {options.map(([id, label]) => {
          const active = choice === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => pick(id)}
              aria-pressed={active}
              className={`card p-2 text-center transition ${
                active ? "border-ink ring-1 ring-ink" : "hover:border-muted/50"
              }`}
            >
              <span
                className="grid h-10 w-full place-items-center rounded-md border border-line"
                style={swatch(id)}
              >
                {id === "CUSTOM" && !custom && (
                  <svg
                    viewBox="0 0 24 24"
                    className="h-4 w-4 text-muted"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.8}
                    strokeLinecap="round"
                    aria-hidden="true"
                  >
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                )}
              </span>
              <span
                className={`mt-1.5 block text-xs font-medium ${
                  active ? "text-ink" : "text-muted"
                }`}
              >
                {label}
              </span>
            </button>
          );
        })}
      </div>

      <p className="text-xs text-muted">
        {choice === "AUTO"
          ? "Folgt dem Gerät des Gasts — mit Hell/Dunkel-Umschalter in der Galerie."
          : choice === "LIGHT"
            ? "Immer helles Design, unabhängig vom Gerät des Gasts."
            : choice === "DARK"
              ? "Immer dunkles Design, unabhängig vom Gerät des Gasts."
              : "Eigene Farbe rund um die Bilder. Die Textfarbe passt sich automatisch an (hell auf dunklen Farben und umgekehrt)."}
      </p>

      {choice === "CUSTOM" && (
        <ColorField
          label="Farbton"
          name="bgColor"
          value={bgColor}
          onChange={onBgColor}
          fallback={LIGHT_BG}
          placeholder="#f4f1ea"
          presets={["#f4f1ea", "#ffffff", "#e7e5e4", "#1c1917", "#0f0f0f", "#111827"]}
        />
      )}
    </div>
  );
}

/**
 * Fokuspunkt als schmale Zeile: kleine Vorschau + Knopf, der den eigentlichen
 * Wähler als Dialog öffnet. So konkurriert das große Cover-Bild nicht mehr mit
 * den Reglern darüber (Weichzeichnen/Abdunkeln), deren Wirkung in der
 * Live-Vorschau rechts sichtbar wird.
 */
function CoverFocusField({
  albumId,
  coverUrl,
  x,
  y,
  onChange,
}: {
  albumId: string;
  coverUrl: string;
  x: number;
  y: number;
  onChange: (x: number, y: number) => void;
}) {
  const [open, setOpen] = useState(false);

  // Escape schließt den Dialog.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2">
      <span className="flex min-w-0 items-center gap-2.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={coverUrl}
          alt=""
          className="h-8 w-12 shrink-0 rounded object-cover"
          style={{ objectPosition: `${x}% ${y}%` }}
        />
        <span className="flex min-w-0 flex-col">
          <span className="flex items-center gap-1.5 text-sm text-ink">
            Bildausschnitt
            <InfoTip text="Legt fest, welcher Teil des Covers im Kopfbereich und auf der Passwortseite sichtbar bleibt, wenn das Bild beschnitten wird. Wird pro Bild gespeichert." />
          </span>
          <span className="text-[11px] text-muted">
            Fokuspunkt {Math.round(x)} / {Math.round(y)} %
          </span>
        </span>
      </span>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn-ghost shrink-0 px-3 py-1.5 text-sm"
      >
        Festlegen
      </button>

      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4"
            onClick={() => setOpen(false)}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Bildausschnitt festlegen"
              onClick={(e) => e.stopPropagation()}
              className="card w-full max-w-lg space-y-3 p-5 shadow-2xl"
            >
              <CoverFocusPicker
                albumId={albumId}
                coverUrl={coverUrl}
                x={x}
                y={y}
                onChange={onChange}
              />
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="btn-primary px-4 py-2 text-sm"
                >
                  Fertig
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

/**
 * Fokuspunkt-Wähler: Klick/Ziehen auf dem Cover setzt den Bildausschnitt
 * (object-position). Speichert SOFORT per `setCoverFocus` am aktuellen Cover-Bild
 * — jedes Cover behält so seinen eigenen Fokus. Wirkt auf Galerie-Header & Login.
 */
function CoverFocusPicker({
  albumId,
  coverUrl,
  x,
  y,
  onChange,
}: {
  albumId: string;
  coverUrl: string;
  x: number;
  y: number;
  onChange: (x: number, y: number) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const dragging = useRef(false);
  const [saved, setSaved] = useState(false);

  const posFromEvent = (clientX: number, clientY: number) => {
    const el = ref.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const nx = Math.max(0, Math.min(100, ((clientX - r.left) / r.width) * 100));
    const ny = Math.max(0, Math.min(100, ((clientY - r.top) / r.height) * 100));
    return { nx: Math.round(nx), ny: Math.round(ny) };
  };

  const persist = async (nx: number, ny: number) => {
    try {
      await setCoverFocus(albumId, nx, ny);
      setSaved(true);
      setTimeout(() => setSaved(false), 1400);
    } catch {
      /* stilles Scheitern — Vorschau bleibt, nächster Klick versucht erneut */
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm text-ink">
        <span className="flex items-center gap-1.5">
          Fokuspunkt
          <InfoTip text="Klicke oder ziehe auf dem Cover, um den sichtbaren Bildausschnitt für Header & Kundenlogin festzulegen. Wird pro Bild gespeichert." />
        </span>
        <span className="text-xs text-muted">
          {saved ? "Gespeichert ✓" : `${Math.round(x)} / ${Math.round(y)} %`}
        </span>
      </div>
      <div
        ref={ref}
        role="slider"
        aria-label="Fokuspunkt des Covers"
        aria-valuetext={`${Math.round(x)}% horizontal, ${Math.round(y)}% vertikal`}
        tabIndex={0}
        onPointerDown={(e) => {
          dragging.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          const p = posFromEvent(e.clientX, e.clientY);
          if (p) onChange(p.nx, p.ny);
        }}
        onPointerMove={(e) => {
          if (!dragging.current) return;
          const p = posFromEvent(e.clientX, e.clientY);
          if (p) onChange(p.nx, p.ny);
        }}
        onPointerUp={(e) => {
          dragging.current = false;
          const p = posFromEvent(e.clientX, e.clientY);
          if (p) void persist(p.nx, p.ny);
        }}
        className="relative aspect-[16/7] w-full cursor-crosshair touch-none overflow-hidden rounded-lg bg-neutral-800"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={coverUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          style={{ objectPosition: `${x}% ${y}%` }}
          draggable={false}
        />
        <span
          aria-hidden
          className="pointer-events-none absolute z-10 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_2px_rgba(0,0,0,0.4)]"
          style={{ left: `${x}%`, top: `${y}%` }}
        />
      </div>
      <p className="text-[11px] text-muted">
        Klicken oder ziehen — der Ausschnitt wird sofort gespeichert.
      </p>
    </div>
  );
}

// Standard-Hintergrundfarben der Themes.
const LIGHT_BG = "#f4f1ea";
const DARK_BG = "#0f0f0f";

/**
 * Vereinte Live-Vorschau: ein Fenster-Rahmen mit umschaltbarer Ansicht
 * „Galerie" (Kopf + Raster auf Theme-Hintergrund) und „Login" (Passwortseite).
 * Spiegelt ALLE Einstellungen sofort — die zentrale Feedback-Fläche des Editors.
 */
function UnifiedPreview({
  title,
  coverUrl,
  coverBlurPx,
  coverOverlay,
  focusX,
  focusY,
  titlePos,
  align,
  font,
  button,
  textColor,
  themeMode,
  bgColor,
  layout,
  columns,
  spacing,
  previewPhotos,
}: {
  title: string;
  coverUrl: string | null;
  coverBlurPx: number;
  coverOverlay: number;
  focusX: number;
  focusY: number;
  titlePos: string;
  align: string;
  font: string;
  button: string;
  textColor: string;
  themeMode: string;
  bgColor: string;
  layout: string;
  columns: number;
  spacing: string;
  previewPhotos: PreviewPhoto[];
}) {
  const [view, setView] = useState<"gallery" | "login">("gallery");
  const showLogin = view === "login" && !!coverUrl;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-[0.15em] text-muted">
          Live-Vorschau
        </span>
        {coverUrl && (
          <div className="inline-flex rounded-lg border border-line p-0.5 text-[11px]">
            {(["gallery", "login"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                aria-pressed={view === v}
                className={`rounded-md px-2.5 py-1 transition ${
                  view === v ? "bg-ink text-canvas" : "text-muted hover:text-ink"
                }`}
              >
                {v === "gallery" ? "Galerie" : "Login"}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-line bg-canvas shadow-sm">
        {/* Fenster-Leiste (nur Deko) */}
        <div className="flex items-center gap-1.5 border-b border-line bg-surface px-3 py-2">
          <span className="h-2.5 w-2.5 rounded-full bg-red-400/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-green-400/70" />
          <span className="ml-auto text-[10px] uppercase tracking-[0.15em] text-muted">
            {showLogin ? "Kundenlogin" : "Kundengalerie"}
          </span>
        </div>

        <div className="space-y-3 p-3">
          {showLogin ? (
            <LoginPreview coverUrl={coverUrl!} focusX={focusX} focusY={focusY} />
          ) : (
            <>
              <HeaderPreview
                title={title}
                coverUrl={coverUrl}
                coverBlurPx={coverBlurPx}
                coverOverlay={coverOverlay}
                focusX={focusX}
                focusY={focusY}
                titlePos={titlePos}
                align={align}
                font={font}
                button={button}
                textColor={textColor}
              />
              <ThemeGrid
                themeMode={themeMode}
                bgColor={bgColor}
                layout={layout}
                columns={columns}
                spacing={spacing}
                previewPhotos={previewPhotos}
                coverUrl={coverUrl}
              />
            </>
          )}
        </div>
      </div>

      <p className="text-[11px] text-muted">
        {showLogin
          ? "Passwortseite, die Gäste vor der Galerie sehen."
          : "Kopfbereich und der Rahmen um die Bilder in der Galerie."}
      </p>
    </div>
  );
}

/** Vorschau der Passwort-/Login-Seite (geblurtes Cover + Karte). */
function LoginPreview({
  coverUrl,
  focusX,
  focusY,
}: {
  coverUrl: string;
  focusX: number;
  focusY: number;
}) {
  return (
    <div className="relative aspect-[16/9] overflow-hidden rounded-lg bg-neutral-800">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={coverUrl}
        alt=""
        className="absolute inset-0 h-full w-full scale-110 object-cover blur-md"
        style={{ objectPosition: `${focusX}% ${focusY}%` }}
      />
      <div className="absolute inset-0 bg-black/45" />
      <div className="absolute inset-0 grid place-items-center">
        <div className="w-1/2 space-y-1.5 border border-white/25 bg-white/10 p-3 backdrop-blur">
          <div className="mx-auto h-1.5 w-10 bg-white/60" />
          <div className="h-2 bg-white/20" />
          <div className="h-3 bg-white/70" />
        </div>
      </div>
    </div>
  );
}

/** Live-Vorschau des Galerie-Headers mit den gewählten Optionen. */
function HeaderPreview({
  title,
  coverUrl,
  coverBlurPx,
  coverOverlay,
  focusX,
  focusY,
  titlePos,
  align,
  font,
  button,
  textColor,
}: {
  title: string;
  coverUrl: string | null;
  coverBlurPx: number;
  coverOverlay: number;
  focusX: number;
  focusY: number;
  titlePos: string;
  align: string;
  font: string;
  button: string;
  textColor: string;
}) {
  const { items, justify, content } = headerLayout(titlePos, align);
  const fontClass = headerFontClass(font);
  const custom = validHex(textColor);
  const colorStyle = custom ? { color: custom } : undefined;
  // Ohne eigene Farbe: weiß auf Cover, sonst Ink.
  const autoText = coverUrl ? "text-white" : "text-ink";
  // Vorschau ist ~1/3 so breit wie der echte Header -> Blur entsprechend skalieren.
  const previewBlur = coverBlurPx > 0 ? Math.max(1, coverBlurPx * 0.3) : 0;

  return (
    <div
      className={`relative flex aspect-[16/7] overflow-hidden rounded-lg px-4 py-3 ${items} ${justify} ${
        coverUrl ? "bg-neutral-800" : "border border-line bg-surface"
      }`}
    >
      {coverUrl && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={coverUrl}
            alt=""
            className={`absolute inset-0 h-full w-full object-cover ${
              previewBlur ? "scale-110" : ""
            }`}
            style={{
              objectPosition: `${focusX}% ${focusY}%`,
              ...(previewBlur ? { filter: `blur(${previewBlur}px)` } : {}),
            }}
          />
          <div
            className="absolute inset-0 bg-black"
            style={{ opacity: Math.min(coverOverlay, 70) / 100 }}
          />
        </>
      )}
      <div
        className={`relative z-10 flex flex-col ${content} ${custom ? "" : autoText}`}
        style={colorStyle}
      >
        <span className={`${fontClass} text-[10px] uppercase tracking-[0.2em]`}>
          {title}
        </span>
        {button === "UNDER" && (
          <span className="mt-1 border-b border-current pb-0.5 text-[7px] uppercase tracking-[0.15em]">
            Zur Galerie ↓
          </span>
        )}
      </div>
      {button === "BOTTOM" && (
        <span
          className={`absolute bottom-1.5 left-1/2 z-10 -translate-x-1/2 border-b border-current pb-0.5 text-[7px] uppercase tracking-[0.15em] ${
            custom ? "" : autoText
          }`}
          style={colorStyle}
        >
          Zur Galerie ↓
        </span>
      )}
    </div>
  );
}

/**
 * Farbwähler mit Text-Eingabe + Zurücksetzen. Sendet den Wert über ein
 * verstecktes Input mit `name`; leer = automatisch/Standard.
 */
function ColorField({
  label,
  name,
  value,
  onChange,
  fallback,
  placeholder,
  info,
  presets,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (v: string) => void;
  fallback: string;
  placeholder: string;
  info?: string;
  presets?: string[];
}) {
  const current = validHex(value)?.toLowerCase();
  return (
    <div className="space-y-2">
      <FieldLabel label={label} info={info} />

      {/* Schnellauswahl: Vorschau-Swatches. */}
      {presets && presets.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {presets.map((c) => {
            const active = current === c.toLowerCase();
            return (
              <button
                key={c}
                type="button"
                onClick={() => onChange(c)}
                aria-label={c}
                aria-pressed={active}
                className={`h-7 w-7 rounded-full border transition ${
                  active
                    ? "ring-2 ring-accent ring-offset-2 ring-offset-canvas"
                    : "hover:scale-110"
                }`}
                style={{ backgroundColor: c }}
              />
            );
          })}
        </div>
      )}

      {/* Feineingabe (Hex). Die Kachel links ZEIGT die aktuelle Farbe und öffnet
          per Klick den System-Farbwähler; ohne Farbe steht dort ein „+", damit
          erkennbar ist, dass hier eine Farbe hinzugefügt werden kann. */}
      <div className="flex items-center gap-2">
        <label
          title="Farbe wählen"
          className="relative grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-lg border border-line bg-surface text-muted transition hover:text-ink"
          style={current ? { backgroundColor: current } : undefined}
        >
          <input
            type="color"
            value={current ?? fallback}
            onChange={(e) => onChange(e.target.value)}
            aria-label={`${label} wählen`}
            className="sr-only"
          />
          {!current && (
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
          )}
        </label>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="input flex-1 font-mono text-xs"
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="btn-ghost shrink-0 px-3 py-2 text-sm"
          >
            Zurücksetzen
          </button>
        )}
      </div>
      <input type="hidden" name={name} value={value} />
    </div>
  );
}

/**
 * Raster-Ausschnitt auf Theme-Hintergrund. Zeigt nicht nur die Farbe, sondern
 * auch Rasterart (Masonry/Raster/Ausgerichtet), Spaltenzahl und Bild-Abstand —
 * gerendert nach derselben Logik wie die echte Galerie (`Gallery.tsx`), nur in
 * Miniatur. Vorher war das ein starres 3er-Raster, das Layout-Änderungen
 * schluckte.
 */
function ThemeGrid({
  themeMode,
  bgColor,
  layout,
  columns,
  spacing,
  previewPhotos,
  coverUrl,
}: {
  themeMode: string;
  bgColor: string;
  layout: string;
  columns: number;
  spacing: string;
  previewPhotos: PreviewPhoto[];
  coverUrl: string | null;
}) {
  const custom = validHex(bgColor);
  // Abstand im Miniaturmaßstab (die Galerie nutzt gap-2.5/gap-5).
  const gap = spacing === "LARGE" ? "gap-2" : "gap-[3px]";
  // In der schmalen Vorschau bleiben mehr als 4 Spalten unlesbar.
  const cols = Math.max(1, Math.min(columns, 4));
  const count = layout === "JUSTIFIED" ? 6 : cols * 2;

  // Bilderpool; erst nach dem Mounten mischen (sonst Hydration-Mismatch).
  const pool = useMemo<PreviewPhoto[]>(() => {
    if (previewPhotos.length > 0) return previewPhotos;
    return coverUrl ? [{ url: coverUrl, ratio: 3 / 2 }] : [];
  }, [previewPhotos, coverUrl]);
  const [tiles, setTiles] = useState<PreviewPhoto[]>(() => pool.slice(0, count));
  useEffect(() => {
    const shuffled = [...pool].sort(() => Math.random() - 0.5).slice(0, count);
    setTiles(shuffled);
  }, [pool, count]);

  const bgStyle: React.CSSProperties = custom
    ? { backgroundColor: custom }
    : themeMode === "DARK"
      ? { backgroundColor: DARK_BG }
      : themeMode === "LIGHT"
        ? { backgroundColor: LIGHT_BG }
        : {
            // Auto (OS): beide Farben zeigen, diagonal getrennt.
            backgroundImage: `linear-gradient(135deg, ${LIGHT_BG} 0%, ${LIGHT_BG} 50%, ${DARK_BG} 50%, ${DARK_BG} 100%)`,
          };

  const cells = Array.from({ length: count }, (_, i) => tiles[i] ?? null);

  /** Eine Kachel: echtes Bild oder Platzhalter, in gewünschtem Seitenverhältnis. */
  const cell = (p: PreviewPhoto | null, i: number, aspect?: string) =>
    p ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        key={i}
        src={p.url}
        alt=""
        style={aspect ? { aspectRatio: aspect } : undefined}
        className="w-full rounded-[3px] object-cover shadow-sm"
      />
    ) : (
      <div
        key={i}
        style={aspect ? { aspectRatio: aspect } : undefined}
        className="w-full rounded-[3px] bg-neutral-500/20"
      />
    );

  return (
    <div className="overflow-hidden rounded-lg border border-line p-3" style={bgStyle}>
      {layout === "GRID" && (
        <div
          className={`grid ${gap}`}
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
        >
          {cells.map((p, i) => cell(p, i, "1 / 1"))}
        </div>
      )}

      {layout === "MASONRY" && (
        // Spalten per Round-Robin befüllen — wie in der echten Galerie.
        <div className={`flex ${gap}`}>
          {Array.from({ length: cols }).map((_, colIdx) => (
            <div key={colIdx} className={`flex flex-1 flex-col ${gap}`}>
              {cells
                .filter((_, i) => i % cols === colIdx)
                .map((p, j) =>
                  cell(p, colIdx * 100 + j, p ? `${p.ratio}` : j % 2 ? "1 / 1" : "3 / 4"),
                )}
            </div>
          ))}
        </div>
      )}

      {layout === "JUSTIFIED" && (
        <div className={`flex flex-wrap ${gap}`}>
          {cells.map((p, i) => {
            const ratio = p?.ratio ?? 1.5;
            return (
              <div
                key={i}
                style={{ flexGrow: ratio, flexBasis: `${ratio * 40}px` }}
                className="h-12 overflow-hidden rounded-[3px]"
              >
                {p ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="h-full w-full bg-neutral-500/20" />
                )}
              </div>
            );
          })}
          <div className="grow-[999]" />
        </div>
      )}
    </div>
  );
}
