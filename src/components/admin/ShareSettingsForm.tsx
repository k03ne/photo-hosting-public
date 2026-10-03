"use client";

import { useActionState, useEffect, useState } from "react";

import { slugify } from "@/lib/slug";
import type { AlbumFormState } from "@/server/actions/albums";

/**
 * Freigabe-Einstellungen in der Freigabe-Kachel: Veröffentlichung als
 * Hauptschalter; ist das Album nicht veröffentlicht, sind die Link-Optionen
 * deaktiviert. Das anpassbare Slug-Feld erscheint nur, wenn die lesbare
 * Klartext-URL aktiviert ist.
 *
 * Die sichtbaren Bedienelemente steuern nur State; die tatsächlich gesendeten
 * Werte liegen in verborgenen Inputs (damit auch deaktivierte Optionen korrekt
 * gespeichert werden — deaktivierte Felder senden sonst nicht).
 */
export function ShareSettingsForm({
  action,
  albumId,
  appUrl,
  slug,
  isPublished,
  readableUrl,
}: {
  action: (
    prevState: AlbumFormState,
    formData: FormData,
  ) => Promise<AlbumFormState>;
  albumId: string;
  appUrl: string;
  slug: string;
  isPublished: boolean;
  readableUrl: boolean;
}) {
  const [state, formAction, isPending] = useActionState(action, {});
  const [published, setPublished] = useState(isPublished);
  const [readable, setReadable] = useState(readableUrl);
  const [slugInput, setSlugInput] = useState(slug);
  const fe = state.fieldErrors ?? {};

  // Die Checkbox-Zustände sind nach dem Mount die Wahrheit für die Bearbeitung:
  // Der Nutzer setzt sie, sie werden gespeichert. Sie NICHT aus den Props
  // nachzuziehen — der automatische Route-Refresh nach der Server-Action liefert
  // sonst kurzzeitig die alten Prop-Werte und würde die eben abgewählten Haken
  // wieder setzen (der gemeldete Bug). Bei echtem Neuladen initialisiert useState
  // ohnehin frisch aus den Props.
  //
  // Der Slug darf nachgezogen werden: der Server kann ihn deduplizieren (…-2),
  // das soll sich im Feld widerspiegeln.
  useEffect(() => setSlugInput(slug), [slug]);

  const previewSlug = slugInput.trim() ? slugify(slugInput) : slug;
  const base = `${appUrl}/a/`;
  const showSlug = published && readable;

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="id" value={albumId} />
      {/* Tatsächlich gesendete Werte. Die lesbare URL wird als eigenständige
          Wahl gespeichert (nicht an „veröffentlicht" gekoppelt) — sonst löscht
          ein Entzug der Veröffentlichung die Einstellung still und sie taucht
          beim erneuten Veröffentlichen scheinbar von selbst wieder auf. Wirksam
          wird sie ohnehin erst bei veröffentlichtem Album. */}
      <input type="hidden" name="isPublished" value={published ? "on" : ""} />
      <input type="hidden" name="readableUrl" value={readable ? "on" : ""} />
      <input type="hidden" name="slug" value={slugInput} />

      {/* Hauptschalter: Veröffentlichung */}
      <label className="flex items-start gap-2 text-sm text-ink">
        <input
          type="checkbox"
          checked={published}
          onChange={(e) => setPublished(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded accent-ink"
        />
        <span>
          Veröffentlicht
          <span className="mt-0.5 block text-xs text-muted">
            Über den Freigabelink erreichbar. Als Entwurf liefert der Link 404.
          </span>
        </span>
      </label>

      {/* Link-Optionen — nur aktiv, wenn veröffentlicht */}
      <div
        className={`space-y-3 border-t pt-4 transition ${
          published ? "" : "opacity-45"
        }`}
      >
        <label className="flex items-start gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={readable}
            disabled={!published}
            onChange={(e) => setReadable(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded accent-ink disabled:cursor-not-allowed"
          />
          <span>
            Lesbare Klartext-URL zusätzlich erlauben
            <span className="mt-0.5 block text-xs text-muted">
              Der kryptische Link funktioniert weiterhin; die lesbare Adresse ist
              aber leichter zu erraten.
            </span>
          </span>
        </label>

        {/* Slug-Feld nur zeigen, wenn veröffentlicht UND Klartext-URL aktiv */}
        {showSlug && (
          <div className="space-y-1.5 pl-6">
            <label htmlFor="slug-input" className="label text-xs">
              Lesbarer Link (anpassbar)
            </label>
            <input
              id="slug-input"
              value={slugInput}
              onChange={(e) => setSlugInput(e.target.value)}
              placeholder={slug}
              className="w-full rounded-xl border bg-surface px-3 py-2.5 text-sm text-ink outline-none focus:border-ink"
            />
            <p className="break-all text-xs text-muted">
              Adresse:{" "}
              <span className="text-ink">
                {base}
                <span className="font-medium">{previewSlug}</span>
              </span>
            </p>
            {fe.slug && <p className="text-xs text-red-600">{fe.slug[0]}</p>}
          </div>
        )}
      </div>

      {state.error && <p className="text-sm text-red-500">{state.error}</p>}
      {state.success && <p className="text-sm text-green-600">Gespeichert.</p>}

      <button type="submit" disabled={isPending} className="btn-primary">
        {isPending ? "Speichern…" : "Freigabe speichern"}
      </button>
    </form>
  );
}
