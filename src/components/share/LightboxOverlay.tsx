"use client";

import { useEffect, useRef, useState } from "react";

import { DownloadMenu, type Quality } from "@/components/share/DownloadMenu";
import type { GalleryPhoto } from "@/components/share/Gallery";
import {
  ChatIcon,
  CloseIcon,
  HeartIcon,
  PlayIcon,
} from "@/components/share/icons";
import {
  addComment,
  getComments,
  type GuestComment,
} from "@/server/actions/interactions";

/**
 * Interaktions-Ebene über der PhotoSwipe-Lightbox: Like-Button unten und eine
 * einblendbare Kommentar-Spalte rechts. Liegt per z-index über PhotoSwipe
 * (dessen Root nutzt 100000). Der Wrapper ist klick-durchlässig, nur die
 * Bedienelemente fangen Zeiger-Events ab.
 */
export function LightboxOverlay({
  photo,
  showExif,
  buildDownloadUrl,
  onLike,
  commentsOpen,
  onToggleComments,
  onStartAutoplay,
  onCommentAdded,
}: {
  photo: GalleryPhoto;
  showExif: boolean;
  buildDownloadUrl: (q: Quality) => string;
  onLike: (photo: GalleryPhoto) => void;
  commentsOpen: boolean;
  onToggleComments: () => void;
  onStartAutoplay: () => void;
  onCommentAdded: (photoId: string) => void;
}) {
  return (
    <div className="pointer-events-none fixed inset-0 z-[100050]">
      {/* Bildunterschrift oben mittig (immer sichtbar, wenn vorhanden) */}
      {photo.caption && (
        <div className="absolute inset-x-0 top-3 flex justify-center px-16">
          <p className="max-w-2xl truncate rounded-full bg-black/45 px-4 py-1.5 text-sm text-white backdrop-blur">
            {photo.caption}
          </p>
        </div>
      )}

      {/* Bedienleiste unten mittig */}
      <div className="pointer-events-auto absolute bottom-5 left-1/2 flex -translate-x-1/2 items-center gap-2">
        <button
          type="button"
          onClick={() => onLike(photo)}
          aria-label={photo.liked ? "Gefällt mir zurücknehmen" : "Gefällt mir"}
          className="flex items-center gap-2 rounded-full border border-white/20 bg-black/45 px-4 py-2 text-sm text-white backdrop-blur transition hover:bg-black/60"
        >
          <HeartIcon filled={photo.liked} className="h-[18px] w-[18px]" />
          {photo.likeCount > 0 && (
            <span className="tabular-nums">{photo.likeCount}</span>
          )}
        </button>
        <button
          type="button"
          onClick={onToggleComments}
          aria-label="Kommentare ein-/ausblenden"
          aria-pressed={commentsOpen}
          className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm text-white backdrop-blur transition ${
            commentsOpen
              ? "border-white/60 bg-white/20"
              : "border-white/20 bg-black/45 hover:bg-black/60"
          }`}
        >
          <ChatIcon className="h-[18px] w-[18px]" />
          {photo.commentCount > 0 && (
            <span className="tabular-nums">{photo.commentCount}</span>
          )}
        </button>
        <button
          type="button"
          onClick={onStartAutoplay}
          aria-label="Slideshow starten"
          className="flex items-center rounded-full border border-white/20 bg-black/45 px-4 py-2 text-sm text-white backdrop-blur transition hover:bg-black/60"
        >
          <PlayIcon className="h-[18px] w-[18px]" />
        </button>
        <DownloadMenu
          hasRaw={photo.hasRaw}
          label="Dieses Bild"
          buildUrl={buildDownloadUrl}
          variant="lightbox"
          direction="up"
        />
      </div>

      {/* Kommentar-Spalte rechts */}
      {commentsOpen && (
        <CommentColumn
          photo={photo}
          showExif={showExif}
          onLike={onLike}
          onClose={onToggleComments}
          onCommentAdded={onCommentAdded}
        />
      )}
    </div>
  );
}

/** MB-Anzeige aus Bytes. */
function formatSize(bytes: number | null): string | null {
  if (!bytes || bytes <= 0) return null;
  const mb = bytes / (1024 * 1024);
  return mb >= 10 ? `${Math.round(mb)} MB` : `${mb.toFixed(1)} MB`;
}

function MetaBlock({ photo }: { photo: GalleryPhoto }) {
  const rows: { label: string; value: string }[] = [];
  const e = photo.exif;

  if (photo.originalName) rows.push({ label: "Dateiname", value: photo.originalName });
  if (e?.camera) rows.push({ label: "Kamera", value: e.camera });
  if (e?.lens) rows.push({ label: "Objektiv", value: e.lens });
  rows.push({ label: "Abmessungen", value: `${photo.width} × ${photo.height} px` });
  const size = formatSize(photo.sizeBytes);
  if (size) rows.push({ label: "Dateigröße", value: size });
  if (photo.takenAt) {
    rows.push({
      label: "Aufgenommen",
      value: new Date(photo.takenAt).toLocaleString("de-DE", {
        dateStyle: "medium",
        timeStyle: "short",
      }),
    });
  }
  if (e?.focalLength) rows.push({ label: "Brennweite", value: `${e.focalLength} mm` });
  if (e?.aperture) rows.push({ label: "Blende", value: `f/${e.aperture}` });
  if (e?.exposure) rows.push({ label: "Belichtung", value: e.exposure });
  if (e?.iso) rows.push({ label: "ISO", value: String(e.iso) });

  return (
    <div className="border-b border-white/10 px-5 py-4">
      <h3 className="mb-2 text-[10px] uppercase tracking-[0.2em] text-white/40">
        Details
      </h3>
      <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1 text-xs">
        {rows.map((r) => (
          <div key={r.label} className="contents">
            <dt className="text-white/45">{r.label}</dt>
            <dd className="break-words text-right text-white/85">{r.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function CommentColumn({
  photo,
  showExif,
  onLike,
  onClose,
  onCommentAdded,
}: {
  photo: GalleryPhoto;
  showExif: boolean;
  onLike: (photo: GalleryPhoto) => void;
  onClose: () => void;
  onCommentAdded: (photoId: string) => void;
}) {
  const [comments, setComments] = useState<GuestComment[] | null>(null);
  const [body, setBody] = useState("");
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listEndRef = useRef<HTMLDivElement | null>(null);

  // Bei Bildwechsel innerhalb der geöffneten Spalte neu laden.
  useEffect(() => {
    let alive = true;
    setComments(null);
    getComments(photo.id)
      .then((c) => alive && setComments(c))
      .catch(() => alive && setComments([]));
    return () => {
      alive = false;
    };
  }, [photo.id]);

  useEffect(() => {
    const saved = localStorage.getItem("guestName");
    if (saved) setName(saved);
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setPending(true);
    setError(null);
    try {
      const created = await addComment({
        photoId: photo.id,
        body,
        guestName: name || undefined,
      });
      setComments((prev) => [...(prev ?? []), created]);
      setBody("");
      if (name) localStorage.setItem("guestName", name);
      onCommentAdded(photo.id);
      requestAnimationFrame(() =>
        listEndRef.current?.scrollIntoView({ behavior: "smooth" }),
      );
    } catch {
      setError("Kommentar konnte nicht gesendet werden.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="pointer-events-auto absolute inset-y-0 right-0 flex w-full max-w-sm flex-col border-l border-white/10 bg-neutral-900/95 text-white backdrop-blur-md">
      <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
        <h2 className="text-[11px] uppercase tracking-[0.2em] text-white/60">
          Info & Kommentare
        </h2>
        <div className="flex items-center gap-4">
          {/* Auf dem Handy verdeckt die Spalte die Leiste -> Like hier erreichbar */}
          <button
            type="button"
            onClick={() => onLike(photo)}
            aria-label={photo.liked ? "Gefällt mir zurücknehmen" : "Gefällt mir"}
            className="flex items-center gap-1.5 text-sm text-white/80 transition hover:text-white"
          >
            <HeartIcon filled={photo.liked} className="h-[18px] w-[18px]" />
            {photo.likeCount > 0 && (
              <span className="tabular-nums">{photo.likeCount}</span>
            )}
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Spalte schließen"
            className="text-white/60 transition hover:text-white"
          >
            <CloseIcon className="h-[18px] w-[18px]" />
          </button>
        </div>
      </div>

      {photo.caption && (
        <div className="border-b border-white/10 px-5 py-4">
          <p className="text-sm text-white/90">{photo.caption}</p>
        </div>
      )}

      {showExif && <MetaBlock photo={photo} />}

      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
        <h3 className="text-[10px] uppercase tracking-[0.2em] text-white/40">
          Kommentare
        </h3>
        {comments === null ? (
          <div className="space-y-2">
            <div className="h-12 animate-pulse rounded bg-white/5" />
            <div className="h-12 animate-pulse rounded bg-white/5" />
          </div>
        ) : comments.length === 0 ? (
          <p className="text-sm text-white/50">
            Noch keine Kommentare. Sei die/der Erste!
          </p>
        ) : (
          <ul className="space-y-4">
            {comments.map((c) => (
              <li key={c.id} className="text-sm">
                <div className="flex items-baseline gap-2">
                  <span className="font-medium">{c.guestName}</span>
                  <span className="text-xs text-white/40">
                    {new Date(c.createdAt).toLocaleDateString("de-DE")}
                  </span>
                </div>
                <p className="mt-0.5 text-white/80">{c.body}</p>
              </li>
            ))}
          </ul>
        )}
        <div ref={listEndRef} />
      </div>

      <form onSubmit={submit} className="space-y-2 border-t border-white/10 p-4">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Dein Name (optional)"
          maxLength={60}
          className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-sm text-white outline-none placeholder:text-white/40 focus:border-white/50"
        />
        <div className="flex gap-2">
          <input
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Kommentar schreiben…"
            maxLength={1000}
            className="flex-1 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-sm text-white outline-none placeholder:text-white/40 focus:border-white/50"
          />
          <button
            type="submit"
            disabled={pending || !body.trim()}
            className="rounded-lg bg-white px-4 py-1.5 text-sm font-medium text-neutral-900 transition hover:bg-white/90 disabled:opacity-50"
          >
            {pending ? "…" : "Senden"}
          </button>
        </div>
        {error && <p className="text-xs text-red-400">{error}</p>}
      </form>
    </div>
  );
}
