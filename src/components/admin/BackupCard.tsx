"use client";

import { useState } from "react";

/** Backup-Export: Einstellungen + Daten (data.json), optional inkl. aller Bilder. */
export function BackupCard() {
  const [withImages, setWithImages] = useState(false);

  return (
    <section className="card p-5">
      <h2 className="font-medium">Datenbank-Export / Backup</h2>
      <p className="mt-1 text-sm text-muted">
        Lädt ein ZIP mit allen Einstellungen, Alben, Foto-Metadaten und Seiten (
        <code className="text-xs">data.json</code>). Optional inklusive aller Bilddateien.
      </p>

      <label className="mt-4 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={withImages}
          onChange={(e) => setWithImages(e.target.checked)}
          className="h-4 w-4"
        />
        Bilddateien einschließen (größer, dauert länger)
      </label>

      <a
        href={`/api/admin/export${withImages ? "?images=1" : ""}`}
        className="btn-accent mt-4 inline-block"
        download
      >
        Backup herunterladen
      </a>
    </section>
  );
}
