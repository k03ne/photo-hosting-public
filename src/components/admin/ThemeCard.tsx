"use client";

import { useEffect, useState, useTransition } from "react";

import { setBaseSettings } from "@/server/actions/pages";
import { Drawer } from "@/components/admin/Drawer";
import { ThemeMockup } from "@/components/admin/ThemeMockup";
import {
  isBetaTheme,
  START_THEMES,
  parseStartTheme,
  startThemeLabel,
  type StartTheme,
} from "@/lib/start-theme";

/** Vorschläge je Modus (dunkle bzw. helle Grundtöne). */
const PRESETS: Record<"dark" | "light", string[]> = {
  dark: ["#0b0b0d", "#101418", "#161213", "#0e1512", "#1a1a1a"],
  light: ["#f5f2ec", "#efeeea", "#f0f1f3", "#efeae6", "#ffffff"],
};

/** Schrift-Optionen (Display-Font) → CSS-Variablen aus layout.tsx. */
const FONTS = [
  { key: "editorial", label: "Editorial", css: "var(--font-editorial), Georgia, serif" },
  { key: "serif", label: "Serif", css: "var(--font-serif), Georgia, serif" },
  { key: "display", label: "Grotesk", css: "var(--font-display), system-ui, sans-serif" },
  { key: "sans", label: "Sans", css: "var(--font-sans), system-ui, sans-serif" },
] as const;

// Die Theme-WAHL ist global; das Layout liegt im Startseite-Editor.
// Liste, Typ und Normalisierung kommen aus `@/lib/start-theme`.
type Base = { mode: "light" | "dark"; color: string; font: string; startTheme: StartTheme };

const fontCss = (key: string) => FONTS.find((f) => f.key === key)?.css;

/**
 * GLOBALE Haupteinstellungen der Website (Theme-Wahl, Kontrast, Grundfarbe,
 * Schrift) — gilt für die Startseite UND, abgeleitet, für die Unterseiten.
 *
 * Die Übersicht zeigt nur, WELCHES Theme aktiv ist (als maßstabsgetreue
 * Vorschau); alles Einstellbare liegt hinter „Theme anpassen" in einem Drawer.
 * Vorher stand das komplette Formular dauerhaft in der rechten Spalte und hat
 * die Seitenliste erschlagen.
 *
 * Die theme-spezifischen LAYOUT-Optionen (OmniGrid: Bildgröße, Abstand,
 * Schwenk …) liegen weiterhin im Startseite-Editor. Speichert via
 * `setBaseSettings`.
 */
export function ThemeCard({ initial, siteTitle }: { initial: Base; siteTitle: string }) {
  const [saved, setSaved] = useState<Base>(normalize(initial));
  const [open, setOpen] = useState(false);

  return (
    <section className="card overflow-hidden">
      <div className="p-5 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-medium">Theme &amp; Erscheinungsbild</h2>
            <p className="mt-1 text-sm text-muted">Gilt für die ganze Website.</p>
          </div>
          <span className="flex shrink-0 items-center gap-1.5">
            <span className="chip border">{startThemeLabel(saved.startTheme)}</span>
            {isBetaTheme(saved.startTheme) && (
              <span
                title="Noch in Arbeit — Aussehen und Bedienung können sich ändern."
                className="chip border border-amber-500/60 px-2 py-0.5 text-[10px] uppercase tracking-wider text-amber-600"
              >
                Beta
              </span>
            )}
          </span>
        </div>
      </div>

      {/* Aktive Wahl auf einen Blick — Theme-Layout, Farbe, Kontrast & Schrift. */}
      <div className="border-y">
        <ThemeMockup
          theme={saved.startTheme}
          color={saved.color}
          mode={saved.mode}
          fontCss={fontCss(saved.font)}
          title={siteTitle}
        />
      </div>

      <div className="flex items-center justify-between gap-3 p-5 pt-4">
        <p className="text-sm text-muted">
          {FONTS.find((f) => f.key === saved.font)?.label} ·{" "}
          {saved.mode === "dark" ? "Dunkel" : "Hell"} ·{" "}
          <span className="font-mono text-xs">{saved.color.toUpperCase()}</span>
        </p>
        <button type="button" onClick={() => setOpen(true)} className="btn-accent shrink-0">
          Theme anpassen
        </button>
      </div>

      <ThemeDrawer
        open={open}
        onClose={() => setOpen(false)}
        saved={saved}
        siteTitle={siteTitle}
        onSaved={setSaved}
      />
    </section>
  );
}

/** Fällt auf gültige Werte zurück, falls die DB etwas Unbekanntes enthält. */
function normalize(b: Base): Base {
  return {
    ...b,
    font: FONTS.some((f) => f.key === b.font) ? b.font : "editorial",
    startTheme: parseStartTheme(b.startTheme),
  };
}

/**
 * Der eigentliche Editor. Der Entwurf lebt nur im Drawer — erst „Speichern"
 * schreibt ihn weg; „Abbrechen"/Escape verwirft ihn. Beim Öffnen wird der
 * Entwurf auf den gespeicherten Stand zurückgesetzt, sonst käme ein zuvor
 * verworfener Entwurf beim nächsten Öffnen wieder hoch.
 */
function ThemeDrawer({
  open,
  onClose,
  saved,
  siteTitle,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  saved: Base;
  siteTitle: string;
  onSaved: (b: Base) => void;
}) {
  const [draft, setDraft] = useState<Base>(saved);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (open) setDraft(saved);
  }, [open, saved]);

  const patch = (p: Partial<Base>) => setDraft((d) => ({ ...d, ...p }));
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

  function save() {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("mode", draft.mode);
      fd.set("color", draft.color);
      fd.set("font", draft.font);
      fd.set("startTheme", draft.startTheme);
      await setBaseSettings(fd);
      onSaved(draft);
      onClose();
    });
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Theme anpassen"
      description="Theme, Kontrast, Farbe und Schrift der ganzen Website."
      footer={
        <>
          <button type="button" onClick={onClose} className="btn-ghost" disabled={pending}>
            Abbrechen
          </button>
          <button type="button" onClick={save} className="btn-accent" disabled={!dirty || pending}>
            {pending ? "Speichert …" : "Speichern"}
          </button>
        </>
      }
    >
      <div className="space-y-7">
        {/* ── Theme-Wahl: jede Option zeigt ihr eigenes Layout mit den
            aktuellen Farben & der aktuellen Schrift ────────────────────── */}
        <Field label="Startseiten-Theme">
          <div className="grid gap-3 sm:grid-cols-2">
            {START_THEMES.map((t) => {
              const active = draft.startTheme === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => patch({ startTheme: t.key })}
                  aria-pressed={active}
                  className={`overflow-hidden rounded-xl border text-left transition ${
                    active
                      ? "border-accent ring-2 ring-accent"
                      : "hover:border-ink hover:shadow-sm"
                  }`}
                >
                  <ThemeMockup
                    theme={t.key}
                    color={draft.color}
                    mode={draft.mode}
                    fontCss={fontCss(draft.font)}
                    title={siteTitle}
                  />
                  <div className="border-t px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{t.label}</span>
                      {t.beta && (
                        <span
                          title="Noch in Arbeit — Aussehen und Bedienung können sich ändern."
                          className="chip border border-amber-500/60 px-2 py-0.5 text-[10px] uppercase tracking-wider text-amber-600"
                        >
                          Beta
                        </span>
                      )}
                      {active && (
                        <span className="chip bg-accent px-2 py-0.5 text-[10px] text-[hsl(var(--accent-ink))]">
                          Aktiv
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs leading-snug text-muted">{t.hint}</p>
                  </div>
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-muted">
            Platzhalter statt echter Bilder — Anordnung, Farbe und Schrift entsprechen der
            Live-Seite.{" "}
            <a
              href="/admin/start-preview"
              target="_blank"
              rel="noopener"
              className="underline hover:text-ink"
            >
              Echte Vorschau öffnen ↗
            </a>
          </p>
        </Field>

        {/* ── Kontrast ──────────────────────────────────────────────────── */}
        <Field label="Kontrast">
          <div className="flex gap-2">
            {(["dark", "light"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() =>
                  patch({
                    mode: m,
                    // Grundton mitziehen, wenn der alte zum anderen Modus gehörte.
                    color: PRESETS[m].includes(draft.color) ? draft.color : PRESETS[m][0],
                  })
                }
                aria-pressed={draft.mode === m}
                className={`chip px-4 py-2 transition ${
                  draft.mode === m
                    ? "bg-accent text-[hsl(var(--accent-ink))]"
                    : "border hover:border-ink"
                }`}
              >
                {m === "dark" ? "Dunkel" : "Hell"}
              </button>
            ))}
          </div>
        </Field>

        {/* ── Farbe ─────────────────────────────────────────────────────── */}
        <Field label="Grundfarbe">
          <div className="flex flex-wrap items-center gap-2">
            {PRESETS[draft.mode].map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => patch({ color: c })}
                aria-label={c}
                aria-pressed={draft.color === c}
                className={`h-8 w-8 rounded-full border transition ${
                  draft.color === c ? "ring-2 ring-accent ring-offset-2 ring-offset-canvas" : ""
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
            <label className="ml-1 inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-sm hover:border-ink">
              <input
                type="color"
                value={draft.color}
                onChange={(e) => patch({ color: e.target.value })}
                className="h-5 w-5 cursor-pointer border-0 bg-transparent p-0"
              />
              <span className="font-mono text-xs">{draft.color.toUpperCase()}</span>
            </label>
          </div>
        </Field>

        {/* ── Schrift ───────────────────────────────────────────────────── */}
        <Field label="Schrift">
          <div className="flex flex-wrap gap-2">
            {FONTS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => patch({ font: f.key })}
                aria-pressed={draft.font === f.key}
                className={`flex min-w-[5.5rem] flex-col items-center gap-0.5 rounded-lg border px-3 py-2 transition ${
                  draft.font === f.key ? "border-accent ring-1 ring-accent" : "hover:border-ink"
                }`}
              >
                <span className="text-xl leading-none" style={{ fontFamily: f.css }}>
                  Aa
                </span>
                <span className="text-[11px] text-muted">{f.label}</span>
              </button>
            ))}
          </div>
        </Field>
      </div>
    </Drawer>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-[11px] uppercase tracking-[0.15em] text-muted">{label}</p>
      {children}
    </div>
  );
}
