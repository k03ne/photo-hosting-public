"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { createAlbumQuick } from "@/server/actions/albums";
import { PhotoUploader } from "./PhotoUploader";

type AlbumOpt = { id: string; title: string };

/**
 * Upload aus der Mediathek („Bilder"). Fotos gehören immer zu einem Album, daher
 * wird zuerst ein Ziel-Album gewählt (oder schnell neu angelegt); darunter läuft
 * der reguläre {@link PhotoUploader} gegen dieses Album.
 */
export function LibraryUploader({ albums }: { albums: AlbumOpt[] }) {
  const router = useRouter();
  const [list, setList] = useState<AlbumOpt[]>(albums);
  const [target, setTarget] = useState<string>(albums[0]?.id ?? "");
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(albums.length === 0);
  const [newTitle, setNewTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createAlbum() {
    const t = newTitle.trim();
    if (!t) return;
    setBusy(true);
    setError(null);
    try {
      const album = await createAlbumQuick(t);
      setList((l) => [{ id: album.id, title: album.title }, ...l]);
      setTarget(album.id);
      setCreating(false);
      setNewTitle("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Album konnte nicht angelegt werden.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card space-y-3 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium">Hochladen</h2>
          <p className="text-xs text-muted">
            Bilder gehören immer zu einem Album. Ziel wählen oder neu anlegen.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="btn-ghost shrink-0"
          aria-expanded={open}
        >
          {open ? "Schließen" : "Bilder hinzufügen"}
        </button>
      </div>

      {open && (
        <div className="space-y-3 border-t pt-3">
          <div className="flex flex-wrap items-end gap-2">
            {!creating && (
              <label className="block w-full text-sm sm:w-auto">
                <span className="mb-1 block text-muted">Ziel-Album</span>
                <select
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  className="input w-full sm:w-56"
                >
                  {list.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.title}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {creating ? (
              <>
                <label className="block w-full text-sm sm:w-auto">
                  <span className="mb-1 block text-muted">Neues Album</span>
                  <input
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void createAlbum();
                      }
                    }}
                    placeholder="Titel"
                    autoFocus
                    className="input w-full sm:w-56"
                  />
                </label>
                <button
                  type="button"
                  onClick={createAlbum}
                  disabled={busy || !newTitle.trim()}
                  className="btn-accent disabled:opacity-50"
                >
                  {busy ? "Lege an…" : "Anlegen"}
                </button>
                {list.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setCreating(false);
                      setError(null);
                    }}
                    className="btn-ghost"
                  >
                    Abbrechen
                  </button>
                )}
              </>
            ) : (
              <button type="button" onClick={() => setCreating(true)} className="btn-ghost">
                + Neues Album
              </button>
            )}
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          {target && !creating ? (
            // key=target: interner Zustand des Uploaders bei Album-Wechsel zurücksetzen.
            <PhotoUploader key={target} albumId={target} existingPhotos={[]} />
          ) : (
            !creating && (
              <p className="text-sm text-muted">Erst ein Album wählen oder anlegen.</p>
            )
          )}
        </div>
      )}
    </section>
  );
}
