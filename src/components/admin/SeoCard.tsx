"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { InfoHint } from "@/components/admin/InfoHint";
import { setSeoSettings } from "@/server/actions/pages";

export type SeoInitial = {
  seoTitle: string;
  seoDescription: string;
  seoIndexable: boolean;
  faviconKey: string | null;
  ogImageKey: string | null;
};

/** Google kürzt Titel um ~60 und Beschreibungen um ~160 Zeichen. */
const TITLE_HINT = 60;
const DESC_HINT = 160;

/**
 * Auffindbarkeit: wie die Website im Browser-Tab, in Suchergebnissen und in
 * geteilten Links auftritt — plus der Schalter, sie ganz aus Suchmaschinen
 * herauszuhalten.
 *
 * Der Schalter setzt `noindex, nofollow` und sperrt robots.txt. Beides sind
 * Bitten an brave Bots, keine Zugriffssperre — deshalb steht das auch so in der
 * UI. Wer die Seite wirklich dicht haben will, lässt sie unveröffentlicht.
 */
export function SeoCard({
  initial,
  fallbackTitle,
  portfolioEnabled,
  baseUrl,
}: {
  initial: SeoInitial;
  /** Titel, der ohne eigene Angabe greift (Wortmarke). */
  fallbackTitle: string;
  portfolioEnabled: boolean;
  /** Für die Snippet-Vorschau; leer, wenn NEXT_PUBLIC_APP_URL fehlt. */
  baseUrl: string | null;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(initial.seoTitle);
  const [description, setDescription] = useState(initial.seoDescription);
  const [indexable, setIndexable] = useState(initial.seoIndexable);

  const shownTitle = title.trim() || fallbackTitle;
  const host = baseUrl ? baseUrl.replace(/^https?:\/\//, "").replace(/\/$/, "") : "deine-domain.de";

  return (
    <section className="card p-5">
      <h2 className="flex items-center gap-2 font-medium">
        Auffindbarkeit
        <InfoHint text="Titel und Beschreibung erscheinen im Browser-Tab, in Suchergebnissen und in Link-Vorschauen (WhatsApp, Instagram, …). Galerie-Links (/a/…) bleiben immer außen vor." />
      </h2>
      <p className="mt-1 text-sm text-muted">
        Wie deine Website im Tab, bei Google und in geteilten Links aussieht.
      </p>

      <form action={setSeoSettings} className="mt-4 space-y-4">
        {/* Snippet-Vorschau — zeigt sofort, wofür die Felder gut sind. */}
        <div className="rounded-lg border bg-surface p-3">
          <div className="flex items-center gap-2">
            {initial.faviconKey ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/api/media/${initial.faviconKey}`}
                alt=""
                className="h-4 w-4 shrink-0 rounded-sm object-contain"
              />
            ) : (
              <span className="h-4 w-4 shrink-0 rounded-sm border" aria-hidden />
            )}
            <span className="truncate text-xs text-muted">{host}</span>
          </div>
          <p className="mt-1 truncate text-[15px] text-blue-700 dark:text-blue-400">{shownTitle}</p>
          <p className="line-clamp-2 text-sm text-muted">
            {description.trim() || "Ohne Beschreibung wählt die Suchmaschine selbst einen Textausschnitt."}
          </p>
        </div>

        <div>
          <div className="mb-1 flex items-baseline justify-between gap-2">
            <label htmlFor="seo-title" className="label">
              Titel
            </label>
            <span className={`text-xs ${title.length > TITLE_HINT ? "text-amber-600" : "text-muted"}`}>
              {title.length}/{TITLE_HINT}
            </span>
          </div>
          <input
            id="seo-title"
            name="seoTitle"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            placeholder={fallbackTitle}
            className="input w-full"
          />
          <p className="mt-1 text-xs text-muted">Leer = {fallbackTitle}</p>
        </div>

        <div>
          <div className="mb-1 flex items-baseline justify-between gap-2">
            <label htmlFor="seo-description" className="label">
              Beschreibung
            </label>
            <span
              className={`text-xs ${description.length > DESC_HINT ? "text-amber-600" : "text-muted"}`}
            >
              {description.length}/{DESC_HINT}
            </span>
          </div>
          <textarea
            id="seo-description"
            name="seoDescription"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={300}
            rows={3}
            placeholder="Ein Satz darüber, wen du fotografierst und wo."
            className="input w-full resize-y"
          />
        </div>

        {/* Suchmaschinen-Freigabe */}
        <div className="rounded-lg border p-3">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              name="indexable"
              checked={indexable}
              onChange={(e) => setIndexable(e.target.checked)}
              className="mt-0.5 h-4 w-4"
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium">Von Suchmaschinen finden lassen</span>
              <span className="block text-xs text-muted">
                {indexable
                  ? "Google & Co. dürfen die Website aufnehmen. Galerie-Links und der Admin-Bereich bleiben ausgeschlossen."
                  : "Die Website wird auf „noindex“ gesetzt und robots.txt sperrt alles. Wer den Link kennt, kommt trotzdem hin — es ist eine Bitte an Suchmaschinen, kein Schutz."}
              </span>
            </span>
          </label>
          {indexable && !portfolioEnabled && (
            <p className="mt-2 text-xs text-amber-600">
              Die Website ist noch nicht öffentlich — solange bleibt sie auch für Suchmaschinen
              gesperrt.
            </p>
          )}
        </div>

        <div className="flex justify-end">
          <button type="submit" className="btn-accent">
            Speichern
          </button>
        </div>
      </form>

      {/* Bilder — eigene Uploads, deshalb außerhalb des Formulars. */}
      <div className="mt-5 space-y-4 border-t pt-4">
        <ImageSlot
          kind="favicon"
          label="Favicon"
          hint="Kleines Symbol im Browser-Tab. Quadratisch, wird auf 256 px gebracht."
          storageKey={initial.faviconKey}
          preview="h-10 w-10 rounded border object-contain"
          onDone={() => router.refresh()}
        />
        <ImageSlot
          kind="og"
          label="Vorschaubild"
          hint="Erscheint, wenn jemand deinen Link teilt (WhatsApp, Instagram, …). Wird auf 1200×630 zugeschnitten."
          storageKey={initial.ogImageKey}
          preview="h-16 w-[122px] rounded border object-cover"
          onDone={() => router.refresh()}
        />
      </div>
    </section>
  );
}

/** Ein Bild-Slot: Vorschau, Hochladen/Ersetzen, Entfernen. */
function ImageSlot({
  kind,
  label,
  hint,
  storageKey,
  preview,
  onDone,
}: {
  kind: "favicon" | "og";
  label: string;
  hint: string;
  storageKey: string | null;
  preview: string;
  onDone: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const url = `/api/admin/site-image?kind=${kind}`;

  function upload(file: File) {
    setError(null);
    const body = new FormData();
    body.append("file", file);
    start(async () => {
      const res = await fetch(url, { method: "POST", body });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? "Upload fehlgeschlagen.");
        return;
      }
      onDone();
    });
  }

  function remove() {
    setError(null);
    start(async () => {
      await fetch(url, { method: "DELETE" });
      onDone();
    });
  }

  return (
    <div className="flex items-start gap-3">
      {storageKey ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/media/${storageKey}`} alt="" className={`shrink-0 bg-surface ${preview}`} />
      ) : (
        <span
          className={`grid shrink-0 place-items-center border-dashed text-[10px] text-muted ${preview}`}
          aria-hidden
        >
          leer
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted">{hint}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) upload(f);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="chip border px-3 py-1.5 transition hover:border-ink disabled:opacity-50"
          >
            {busy ? "Lädt …" : storageKey ? "Ersetzen" : "Hochladen"}
          </button>
          {storageKey && (
            <button
              type="button"
              onClick={remove}
              disabled={busy}
              className="chip border px-3 py-1.5 text-muted transition hover:border-ink hover:text-ink disabled:opacity-50"
            >
              Entfernen
            </button>
          )}
        </div>
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </div>
    </div>
  );
}
