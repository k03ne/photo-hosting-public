"use client";

import { useActionState } from "react";

import type { AlbumFormState } from "@/server/actions/albums";

/**
 * Schlanke Album-Erstellung: nur was VOR den Bildern sinnvoll ist — Titel,
 * Beschreibung, Portfolio-Kategorie. Cover, Layout, Kopfbereich & Farbe hängen
 * von den Bildern ab und werden erst danach im Album-Editor gewählt. Layout/
 * Spalten werden als Standard mitgesendet (die Server-Validierung erwartet sie).
 */
export function AlbumCreateForm({
  action,
}: {
  action: (prev: AlbumFormState, formData: FormData) => Promise<AlbumFormState>;
}) {
  const [state, formAction, isPending] = useActionState(action, {});
  const fe = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="mx-auto max-w-xl space-y-5">
      <div className="card space-y-5 p-6">
        <div className="space-y-1.5">
          <label htmlFor="title" className="label">
            Titel
          </label>
          <input id="title" name="title" required autoFocus className="input" />
          {fe.title && <p className="text-sm text-red-600">{fe.title[0]}</p>}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="description" className="label">
            Beschreibung <span className="text-muted">(optional)</span>
          </label>
          <textarea id="description" name="description" rows={3} className="input" />
          {fe.description && <p className="text-sm text-red-600">{fe.description[0]}</p>}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="category" className="label">
            Portfolio-Kategorie <span className="text-muted">(optional)</span>
          </label>
          <input
            id="category"
            name="category"
            placeholder="z. B. Portraits, Dokumentation, Hochzeit"
            className="input"
          />
          <p className="text-xs text-muted">
            Genre fürs öffentliche Portfolio. Ohne Wirkung auf die Kundengalerie.
          </p>
          {fe.category && <p className="text-sm text-red-600">{fe.category[0]}</p>}
        </div>

        {/* Standardwerte — Layout/Design wählst du nach dem Upload im Album. */}
        <input type="hidden" name="layout" value="MASONRY" />
        <input type="hidden" name="columns" value="3" />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted">
          Cover, Layout &amp; Design legst du nach dem Hochladen der Bilder fest.
        </p>
        <button type="submit" disabled={isPending} className="btn-primary shrink-0 px-5 py-2.5">
          {isPending ? "Erstellen…" : "Album erstellen"}
        </button>
      </div>
    </form>
  );
}
