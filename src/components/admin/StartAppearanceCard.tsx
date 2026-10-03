"use client";

import { useEffect, useState } from "react";

import { setStartAppearance } from "@/server/actions/pages";
import { InfoHint } from "@/components/admin/InfoHint";
import type { OmniBrandMode as BrandMode } from "@/lib/start-theme";

/** Auto-Schwenk-Presets (Welt-Einheiten/Sek) — Slider-Default 0.08. */
const SPEED_STEPS = [
  { value: 0, label: "Aus" },
  { value: 0.05, label: "Sehr langsam" },
  { value: 0.08, label: "Langsam" },
  { value: 0.15, label: "Mittel" },
  { value: 0.28, label: "Schnell" },
] as const;

function speedLabel(v: number) {
  let best: { value: number; label: string } = SPEED_STEPS[0];
  for (const s of SPEED_STEPS) if (Math.abs(s.value - v) < Math.abs(best.value - v)) best = s;
  return best.label;
}
function sizeLabel(v: number) {
  if (v < 2.4) return "Klein";
  if (v < 3.2) return "Kompakt";
  if (v < 4.2) return "Normal";
  if (v < 5.2) return "Groß";
  return "Sehr groß";
}
function gapLabel(v: number) {
  if (v < 0.08) return "Eng";
  if (v < 0.2) return "Normal";
  if (v < 0.34) return "Luftig";
  return "Sehr luftig";
}

/** Geräte-Viewport (px), das der iframe dem Theme vorgaukelt → 1:1 responsive. */
const DEVICE = {
  desktop: { w: 1280, h: 720 },
  mobile: { w: 360, h: 640 },
} as const;
/** Kleine Anzeigehöhe (px) der verkleinerten Vorschau. */
const DISPLAY_H = 168;

function buildSrc(p: {
  mode: "light" | "dark";
  cellSize: number;
  gap: number;
  gridLines: boolean;
  alwaysColor: boolean;
  subtitle: string;
  autoSpeed: number;
  brandMode: BrandMode;
  headline: string;
}) {
  const q = new URLSearchParams({
    embed: "1",
    theme: "omnigrid",
    mode: p.mode,
    cell: String(p.cellSize),
    gap: String(p.gap),
    grid: p.gridLines ? "1" : "0",
    color: p.alwaysColor ? "1" : "0",
    sub: p.subtitle,
    speed: String(p.autoSpeed),
    brand: p.brandMode,
    head: p.headline,
  });
  return `/admin/start-preview?${q.toString()}`;
}

/** Die zwei Auftritte der Marke — Text erklärt, was der Besucher sieht. */
const BRAND_MODES = [
  {
    key: "swap",
    label: "Name wandert",
    hint: "Der Name steht mittig und weicht beim Ziehen dem Logo oben links. Im Leerlauf tauschen sie zurück.",
  },
  {
    key: "fixed",
    label: "Logo bleibt oben",
    hint: "Das Logo klebt dauerhaft oben links. Die Mitte ist frei für eigenen Text — darf auch leer bleiben.",
  },
] as const;

/**
 * OmniGrid-LAYOUT der Startseite (im Startseite-Editor; nur bei aktivem OmniGrid-
 * Theme gerendert — die Theme-WAHL liegt in den Haupteinstellungen). Zweispaltig:
 * links die Regler, rechts eine KLEINE, 1:1 echte Vorschau — das reale WebGL-Theme
 * in einem verkleinerten iframe (`/admin/start-preview`), das die (auch noch
 * ungespeicherten) Werte per Query bekommt. Umschalter 16:9 (Desktop) ↔ 9:16
 * (Mobil) ändert den Geräte-Viewport → das Theme rendert responsive wie live.
 */
export function StartAppearanceCard({
  initial,
  mode,
}: {
  initial: {
    omniAutoSpeed: number;
    omniShowGridLines: boolean;
    omniAlwaysColor: boolean;
    omniSubtitle: string;
    omniGap: number;
    omniCellSize: number;
    omniBrandMode: BrandMode;
    omniHeadline: string;
  };
  /** Kontrast-Modus (für die Vorschau; global gepflegt). */
  mode: "light" | "dark";
}) {
  const [autoSpeed, setAutoSpeed] = useState(initial.omniAutoSpeed);
  const [gridLines, setGridLines] = useState(initial.omniShowGridLines);
  const [alwaysColor, setAlwaysColor] = useState(initial.omniAlwaysColor);
  const [subtitle, setSubtitle] = useState(initial.omniSubtitle);
  const [gap, setGap] = useState(initial.omniGap);
  const [cellSize, setCellSize] = useState(initial.omniCellSize);
  const [brandMode, setBrandMode] = useState<BrandMode>(initial.omniBrandMode);
  const [headline, setHeadline] = useState(initial.omniHeadline);
  const [view, setView] = useState<"desktop" | "mobile">("desktop");

  // Ziel-URL aus den aktuellen Werten; entprellt in den iframe übernommen (nicht
  // bei jedem Slider-Tick das WebGL neu laden).
  const targetSrc = buildSrc({
    mode,
    cellSize,
    gap,
    gridLines,
    alwaysColor,
    subtitle,
    autoSpeed,
    brandMode,
    headline,
  });
  const [src, setSrc] = useState(targetSrc);
  useEffect(() => {
    const t = setTimeout(() => setSrc(targetSrc), 350);
    return () => clearTimeout(t);
  }, [targetSrc]);

  const dev = DEVICE[view];
  const scale = DISPLAY_H / dev.h;
  const dispW = Math.round(dev.w * scale);

  return (
    <section className="card p-5">
      <div className="flex items-center gap-2">
        <h2 className="font-medium">OmniGrid-Layout</h2>
        <InfoHint text="Layout NUR der OmniGrid-Startseite. Theme, Farbe & Schrift stellst du in den Haupteinstellungen (Seiten-Übersicht) ein." />
      </div>

      <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* ── Links: Regler ─────────────────────────────────────────────── */}
        <div className="order-2 space-y-4 lg:order-1">
          <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2">
            <SliderRow
              id="omniCellSize"
              label="Bildgröße"
              value={cellSize}
              display={sizeLabel(cellSize)}
              min={1.8}
              max={5.6}
              step={0.1}
              onChange={setCellSize}
            />
            <SliderRow
              id="omniGap"
              label="Abstand"
              value={gap}
              display={gapLabel(gap)}
              min={0}
              max={0.4}
              step={0.01}
              onChange={setGap}
            />
            <SliderRow
              id="omniAutoSpeed"
              label="Auto-Schwenk"
              value={autoSpeed}
              display={speedLabel(autoSpeed)}
              min={0}
              max={0.28}
              step={0.01}
              onChange={setAutoSpeed}
            />
            <OnOffRow label="Schneidematte" value={gridLines} onChange={setGridLines} />
            <OnOffRow
              label="Bilder farbig"
              hint="An = die Bilder stehen dauerhaft in Farbe im Raster. Aus = sie liegen in Graustufen und färben sich erst, wenn der Besucher darauf zeigt."
              value={alwaysColor}
              onChange={setAlwaysColor}
            />
          </div>

          {/* Auftritt der Marke — bestimmt zugleich, wem die Mitte gehört. */}
          <div>
            <div className="mb-1.5 flex items-center gap-2">
              <span className="text-sm font-medium">Logo &amp; Name</span>
              <InfoHint text="Das Logo-Bild pflegst du unter Einstellungen → Marke. Ohne Bild-Logo erscheint stattdessen der Name als Wortmarke." />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {BRAND_MODES.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => setBrandMode(m.key)}
                  aria-pressed={brandMode === m.key}
                  className={`flex flex-col items-start rounded-lg border px-3 py-2 text-left transition ${
                    brandMode === m.key ? "border-accent ring-1 ring-accent" : "hover:border-ink"
                  }`}
                >
                  <span className="text-sm font-medium">{m.label}</span>
                  <span className="mt-0.5 text-xs leading-snug text-muted">{m.hint}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Die Headline gehört nur im Fixed-Modus dem Admin — im Swap-Modus
              steht dort zwingend die Wortmarke, ein Feld wäre dort irreführend. */}
          {brandMode === "fixed" && (
            <div>
              <label htmlFor="omniHeadline" className="text-sm font-medium">
                Headline <span className="font-normal text-muted">(optional)</span>
              </label>
              <input
                id="omniHeadline"
                type="text"
                value={headline}
                onChange={(e) => setHeadline(e.target.value)}
                maxLength={120}
                placeholder="z.B. Hochzeiten & Portraits"
                className="input mt-1.5 w-full"
              />
            </div>
          )}

          <div>
            <label htmlFor="omniSubtitle" className="text-sm font-medium">
              {brandMode === "fixed" ? "Untertitel" : "Hero-Untertitel"}{" "}
              <span className="font-normal text-muted">(optional)</span>
            </label>
            <input
              id="omniSubtitle"
              type="text"
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              maxLength={120}
              placeholder="z.B. Fotografie aus Berlin"
              className="input mt-1.5 w-full"
            />
          </div>

          <form action={setStartAppearance} className="flex justify-end">
            <input type="hidden" name="omniAutoSpeed" value={autoSpeed} />
            {gridLines && <input type="hidden" name="omniShowGridLines" value="on" />}
            {alwaysColor && <input type="hidden" name="omniAlwaysColor" value="on" />}
            <input type="hidden" name="omniSubtitle" value={subtitle} />
            <input type="hidden" name="omniGap" value={gap} />
            <input type="hidden" name="omniCellSize" value={cellSize} />
            <input type="hidden" name="omniBrandMode" value={brandMode} />
            <input type="hidden" name="omniHeadline" value={headline} />
            <button type="submit" className="btn-accent">
              Layout speichern
            </button>
          </form>
        </div>

        {/* ── Rechts: 1:1 echte Vorschau (verkleinertes iframe) ─────────── */}
        <div className="order-1 lg:order-2 lg:sticky lg:top-6 lg:self-start">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-[0.15em] text-muted">Vorschau</span>
            <div className="flex gap-0.5 rounded-lg border p-0.5">
              {(
                [
                  ["desktop", "16:9"],
                  ["mobile", "9:16"],
                ] as const
              ).map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setView(v)}
                  aria-pressed={view === v}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                    view === v
                      ? "bg-accent text-[hsl(var(--accent-ink))]"
                      : "text-muted hover:text-ink"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-center">
            {/* Verkleinerter „Bildschirm“: iframe in Gerätegröße, per transform skaliert. */}
            <div
              className="overflow-hidden rounded-xl border bg-black/5 shadow-sm"
              style={{ width: dispW, height: DISPLAY_H }}
            >
              <iframe
                key={view} // Formatwechsel = frischer Viewport
                src={src}
                title="Startseiten-Vorschau"
                className="border-0"
                style={{
                  width: dev.w,
                  height: dev.h,
                  transform: `scale(${scale})`,
                  transformOrigin: "top left",
                }}
              />
            </div>
          </div>
          <p className="mt-2 text-center text-[11px] text-muted">
            Echtes Theme · ziehbar. Änderungen erscheinen kurz verzögert.
          </p>
        </div>
      </div>
    </section>
  );
}

/** An/Aus-Paar im selben Raster wie die Slider. */
function OnOffRow({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-1.5 text-sm font-medium">
        {label}
        {hint && <InfoHint text={hint} />}
      </span>
      <div className="flex shrink-0 gap-1.5">
        {([true, false] as const).map((on) => (
          <button
            key={String(on)}
            type="button"
            onClick={() => onChange(on)}
            aria-pressed={value === on}
            className={`chip px-3 py-1 text-sm transition ${
              value === on ? "bg-accent text-[hsl(var(--accent-ink))]" : "border hover:border-ink"
            }`}
          >
            {on ? "An" : "Aus"}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Kompakter Slider mit Live-Wert-Label. */
function SliderRow({
  id,
  label,
  value,
  display,
  min,
  max,
  step,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        <span className="text-xs text-muted">{display}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[hsl(var(--accent))]"
      />
    </div>
  );
}
