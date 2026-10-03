"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";

import { uid } from "@/lib/uid";

type UploadItem = {
  id: string;
  name: string;
  progress: number; // 0..100
  size: number; // Bytes gesamt (für Geschwindigkeit/ETA)
  loaded: number; // Bytes bereits übertragen
  status: "queued" | "uploading" | "done" | "error";
  error?: string;
  note?: string; // z.B. RAW-Zuordnung
};

/** Bytes/s menschenlesbar, z.B. "3,2 MB/s". */
function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec >= 1024 * 1024) {
    return `${(bytesPerSec / (1024 * 1024)).toFixed(1).replace(".", ",")} MB/s`;
  }
  return `${Math.round(bytesPerSec / 1024)} kB/s`;
}

/** Restdauer menschenlesbar, z.B. "noch ~12 s" bzw. "noch ~1:20 min". */
function formatEta(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "";
  if (seconds < 60) return `noch ~${Math.ceil(seconds)} s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `noch ~${m}:${String(s).padStart(2, "0")} min`;
}

/** Wie mit einem Bild umgegangen wird, dessen Name schon im Album existiert. */
type Mode = "duplicate" | "replace-keep" | "overwrite-keep" | "overwrite-end";

const MODE_OPTIONS: { value: Mode; label: string }[] = [
  { value: "replace-keep", label: "Ersetzen (Daten behalten)" },
  { value: "duplicate", label: "Als Duplikat hinzufügen" },
  { value: "overwrite-keep", label: "Komplett ersetzen (Position behalten)" },
  { value: "overwrite-end", label: "Komplett ersetzen (ans Ende)" },
];

/** Kurzer Erfolgshinweis in der Liste je nach gewähltem Modus. */
function noteForMode(mode: Mode): string | undefined {
  switch (mode) {
    case "replace-keep":
      return "ersetzt · Daten behalten";
    case "overwrite-keep":
    case "overwrite-end":
      return "komplett ersetzt";
    default:
      return undefined;
  }
}

type MediaKind = "image" | "raw" | "video";
type QueueEntry = { id: string; file: File; kind: MediaKind };

/** Eine Namens-Kollision, über die im Dialog entschieden wird. */
type Conflict = {
  itemId: string; // verweist auf die QueueEntry-ID
  name: string;
  photoId: string; // vorhandenes Foto mit gleichem Namen
  mode: Mode;
};

const RAW_EXTS = [
  "cr2", "cr3", "nef", "nrw", "arw", "sr2", "srf", "dng", "raf", "orf",
  "rw2", "rwl", "pef", "srw", "raw", "3fr", "mef", "iiq", "x3f", "erf",
];

function fileExt(name: string): string {
  return name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";
}
function isRaw(file: File): boolean {
  return RAW_EXTS.includes(fileExt(file.name));
}
function isVideo(file: File): boolean {
  return file.type.startsWith("video/") || ["mp4", "m4v", "webm"].includes(fileExt(file.name));
}
function kindOf(file: File): MediaKind {
  if (isRaw(file)) return "raw";
  if (isVideo(file)) return "video";
  return "image";
}

/**
 * Erzeugt clientseitig ein Poster-Standbild (erstes Frame) eines Videos plus die
 * Dauer. Ohne ffmpeg: der Browser dekodiert das Frame, wir zeichnen es auf ein
 * Canvas und exportieren WebP. Liefert null, wenn das Frame nicht lesbar ist.
 */
function makePoster(file: File): Promise<{ blob: Blob; duration: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "metadata";
    video.src = url;
    const done = (v: { blob: Blob; duration: number } | null) => {
      URL.revokeObjectURL(url);
      resolve(v);
    };
    video.onloadeddata = () => {
      // Etwas hineinspringen, um schwarze Anfangsframes zu vermeiden.
      video.currentTime = Math.min(0.1, (video.duration || 1) / 2);
    };
    video.onseeked = () => {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx || !canvas.width || !canvas.height) return done(null);
      ctx.drawImage(video, 0, 0);
      canvas.toBlob(
        (blob) =>
          done(blob ? { blob, duration: Math.round((video.duration || 0) * 1000) } : null),
        "image/webp",
        0.9,
      );
    };
    video.onerror = () => done(null);
  });
}

export function PhotoUploader({
  albumId,
  existingPhotos,
}: {
  albumId: string;
  existingPhotos: { id: string; name: string }[];
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [items, setItems] = useState<UploadItem[]>([]);
  // Ausstehende Upload-Warteschlange, die auf eine Entscheidung im
  // Kollisions-Dialog wartet (null = kein Dialog offen).
  const [pending, setPending] = useState<{
    queue: QueueEntry[];
    conflicts: Conflict[];
  } | null>(null);

  const uploadOne = useCallback(
    (
      itemId: string,
      file: File,
      mode: Mode = "duplicate",
      replacePhotoId?: string,
    ) =>
      new Promise<void>((resolve) => {
        setItems((prev) =>
          prev.map((it) =>
            it.id === itemId ? { ...it, status: "uploading", progress: 0 } : it,
          ),
        );

        const form = new FormData();
        form.append("files", file);
        form.append("mode", mode);
        if (replacePhotoId) form.append("replacePhotoId", replacePhotoId);

        const xhr = new XMLHttpRequest();
        xhr.open("POST", `/api/admin/albums/${albumId}/photos`);

        xhr.upload.onprogress = (e) => {
          if (!e.lengthComputable) return;
          const progress = Math.round((e.loaded / e.total) * 100);
          setItems((prev) =>
            prev.map((it) =>
              it.id === itemId ? { ...it, progress, loaded: e.loaded } : it,
            ),
          );
        };

        xhr.onload = () => {
          const ok = xhr.status >= 200 && xhr.status < 300;
          let error: string | undefined;
          if (!ok) {
            try {
              error = JSON.parse(xhr.responseText)?.error;
            } catch {
              error = `Fehler ${xhr.status}`;
            }
          }
          setItems((prev) =>
            prev.map((it) =>
              it.id === itemId
                ? {
                    ...it,
                    progress: 100,
                    loaded: it.size,
                    status: ok ? "done" : "error",
                    error,
                    note: ok ? noteForMode(mode) : undefined,
                  }
                : it,
            ),
          );
          resolve();
        };

        xhr.onerror = () => {
          setItems((prev) =>
            prev.map((it) =>
              it.id === itemId
                ? { ...it, status: "error", error: "Netzwerkfehler" }
                : it,
            ),
          );
          resolve();
        };

        xhr.send(form);
      }),
    [albumId],
  );

  // RAW-Datei hochladen; der Server ordnet sie per Dateiname automatisch zu.
  const uploadRaw = useCallback(
    (itemId: string, file: File) =>
      new Promise<void>((resolve) => {
        setItems((prev) =>
          prev.map((it) =>
            it.id === itemId ? { ...it, status: "uploading", progress: 0 } : it,
          ),
        );

        const form = new FormData();
        form.append("file", file);
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `/api/admin/albums/${albumId}/raws`);
        xhr.upload.onprogress = (e) => {
          if (!e.lengthComputable) return;
          const progress = Math.round((e.loaded / e.total) * 100);
          setItems((prev) =>
            prev.map((it) =>
              it.id === itemId ? { ...it, progress, loaded: e.loaded } : it,
            ),
          );
        };
        xhr.onload = () => {
          const ok = xhr.status >= 200 && xhr.status < 300;
          let note: string | undefined;
          let status: UploadItem["status"] = "done";
          let error: string | undefined;
          try {
            const res = JSON.parse(xhr.responseText);
            if (!ok) {
              status = "error";
              error = res?.error ?? `Fehler ${xhr.status}`;
            } else if (res?.matched) {
              note = `RAW → ${res.photoName}`;
            } else {
              status = "error";
              error = res?.message ?? "Kein passendes Bild gefunden.";
            }
          } catch {
            status = "error";
            error = `Fehler ${xhr.status}`;
          }
          setItems((prev) =>
            prev.map((it) =>
              it.id === itemId
                ? { ...it, progress: 100, loaded: it.size, status, error, note }
                : it,
            ),
          );
          resolve();
        };
        xhr.onerror = () => {
          setItems((prev) =>
            prev.map((it) =>
              it.id === itemId
                ? { ...it, status: "error", error: "Netzwerkfehler" }
                : it,
            ),
          );
          resolve();
        };
        xhr.send(form);
      }),
    [albumId],
  );

  // Video hochladen: Poster clientseitig erzeugen, dann Video + Poster senden.
  const uploadVideo = useCallback(
    async (itemId: string, file: File) => {
      setItems((prev) =>
        prev.map((it) => (it.id === itemId ? { ...it, status: "uploading", progress: 0 } : it)),
      );
      const poster = await makePoster(file);
      if (!poster) {
        setItems((prev) =>
          prev.map((it) =>
            it.id === itemId
              ? { ...it, status: "error", error: "Poster konnte nicht erzeugt werden." }
              : it,
          ),
        );
        return;
      }
      await new Promise<void>((resolve) => {
        const form = new FormData();
        form.append("file", file);
        form.append("poster", poster.blob, "poster.webp");
        form.append("duration", String(poster.duration));
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `/api/admin/albums/${albumId}/videos`);
        xhr.upload.onprogress = (e) => {
          if (!e.lengthComputable) return;
          const progress = Math.round((e.loaded / e.total) * 100);
          setItems((prev) =>
            prev.map((it) => (it.id === itemId ? { ...it, progress, loaded: e.loaded } : it)),
          );
        };
        xhr.onload = () => {
          const ok = xhr.status >= 200 && xhr.status < 300;
          let error: string | undefined;
          if (!ok) {
            try {
              error = JSON.parse(xhr.responseText)?.error;
            } catch {
              error = `Fehler ${xhr.status}`;
            }
          }
          setItems((prev) =>
            prev.map((it) =>
              it.id === itemId
                ? {
                    ...it,
                    progress: 100,
                    loaded: it.size,
                    status: ok ? "done" : "error",
                    error,
                    note: ok ? "Video" : undefined,
                  }
                : it,
            ),
          );
          resolve();
        };
        xhr.onerror = () => {
          setItems((prev) =>
            prev.map((it) =>
              it.id === itemId ? { ...it, status: "error", error: "Netzwerkfehler" } : it,
            ),
          );
          resolve();
        };
        xhr.send(form);
      });
    },
    [albumId],
  );

  // Startet den Upload einer bereits geprüften Warteschlange. `decisions`
  // ordnet kollidierenden Einträgen (per QueueEntry-ID) Modus + Ziel-Foto zu;
  // alle übrigen Bilder werden als Duplikat (= neu) hochgeladen.
  const startUploads = useCallback(
    async (
      queue: QueueEntry[],
      decisions: Map<string, { mode: Mode; photoId: string }>,
    ) => {
      setItems((prev) => [
        ...prev,
        ...queue.map((q) => ({
          id: q.id,
          name: q.file.name,
          progress: 0,
          size: q.file.size,
          loaded: 0,
          status: "queued" as const,
        })),
      ]);

      for (const q of queue) {
        if (q.kind === "raw") {
          await uploadRaw(q.id, q.file);
        } else if (q.kind === "video") {
          await uploadVideo(q.id, q.file);
        } else {
          const d = decisions.get(q.id);
          await uploadOne(q.id, q.file, d?.mode ?? "duplicate", d?.photoId);
        }
      }
      router.refresh(); // neue Thumbnails / RAW-Badges anzeigen
      // Erfolgreiche Einträge nach kurzer Sichtbarkeit ausblenden; Fehler und
      // evtl. schon laufende Uploads eines neuen Stapels bleiben stehen.
      setTimeout(() => {
        setItems((prev) => prev.filter((it) => it.status !== "done"));
      }, 1500);
    },
    [uploadOne, uploadRaw, uploadVideo, router],
  );

  const handleFiles = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return;
      const all = Array.from(fileList);
      // Erst die Bilder (erzeugen die Fotos), dann die RAWs (Zuordnung per Name).
      const ordered = [
        ...all.filter((f) => !isRaw(f)),
        ...all.filter((f) => isRaw(f)),
      ];
      const queue: QueueEntry[] = ordered.map((file) => ({
        id: uid(),
        file,
        kind: kindOf(file),
      }));

      // Namens-Kollisionen finden (voller Dateiname, case-insensitiv). RAWs
      // werden nicht geprüft — sie haben ihren eigenen Zuordnungs-Flow.
      const nameToId = new Map<string, string>();
      for (const p of existingPhotos) {
        const key = p.name.toLowerCase();
        if (!nameToId.has(key)) nameToId.set(key, p.id);
      }
      const conflicts: Conflict[] = [];
      for (const q of queue) {
        if (q.kind !== "image") continue; // RAW & Video haben eigene Flows
        const photoId = nameToId.get(q.file.name.toLowerCase());
        if (photoId) {
          conflicts.push({
            itemId: q.id,
            name: q.file.name,
            photoId,
            mode: "replace-keep",
          });
        }
      }

      if (conflicts.length > 0) {
        setPending({ queue, conflicts }); // auf Entscheidung im Dialog warten
        return;
      }
      await startUploads(queue, new Map());
    },
    [existingPhotos, startUploads],
  );

  // Dialog bestätigt: Entscheidungen anwenden und Upload starten.
  const confirmPending = useCallback(() => {
    if (!pending) return;
    const decisions = new Map<string, { mode: Mode; photoId: string }>();
    for (const c of pending.conflicts) {
      decisions.set(c.itemId, { mode: c.mode, photoId: c.photoId });
    }
    const { queue } = pending;
    setPending(null);
    void startUploads(queue, decisions);
  }, [pending, startUploads]);

  // Setzt den Modus einer einzelnen Kollision.
  const setConflictMode = useCallback((itemId: string, mode: Mode) => {
    setPending((prev) =>
      prev
        ? {
            ...prev,
            conflicts: prev.conflicts.map((c) =>
              c.itemId === itemId ? { ...c, mode } : c,
            ),
          }
        : prev,
    );
  }, []);

  // Setzt den Modus für alle Kollisionen auf einmal ("Für alle").
  const setAllConflictModes = useCallback((mode: Mode) => {
    setPending((prev) =>
      prev
        ? { ...prev, conflicts: prev.conflicts.map((c) => ({ ...c, mode })) }
        : prev,
    );
  }, []);

  // Gesamt-Fortschritt der aktuellen Warteschlange.
  const total = items.length;
  const finished = items.filter(
    (it) => it.status === "done" || it.status === "error",
  ).length;
  const pendingCount = items.filter(
    (it) => it.status === "queued" || it.status === "uploading",
  ).length;

  // --- Geschwindigkeit & Restdauer ---------------------------------------
  // Aktuelle Items in einem Ref spiegeln, damit das Sampling-Intervall den
  // jeweils neuesten Stand liest, ohne bei jeder Änderung neu zu starten.
  const itemsRef = useRef<UploadItem[]>([]);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const [speed, setSpeed] = useState(0); // Bytes/s, exponentiell geglättet
  const sampleRef = useRef<{ t: number; loaded: number } | null>(null);
  const isUploading = pendingCount > 0;

  useEffect(() => {
    if (!isUploading) {
      sampleRef.current = null;
      setSpeed(0);
      return;
    }
    const id = setInterval(() => {
      const list = itemsRef.current;
      const loaded = list.reduce((s, it) => s + it.loaded, 0);
      const now = performance.now();
      const last = sampleRef.current;
      if (last) {
        const dt = (now - last.t) / 1000;
        if (dt > 0) {
          const inst = Math.max(0, (loaded - last.loaded) / dt);
          setSpeed((prev) => (prev > 0 ? prev * 0.6 + inst * 0.4 : inst));
        }
      }
      sampleRef.current = { t: now, loaded };
    }, 600);
    return () => clearInterval(id);
  }, [isUploading]);

  const totalBytes = items.reduce((s, it) => s + it.size, 0);
  const loadedBytes = items.reduce((s, it) => s + it.loaded, 0);
  const etaSeconds = speed > 0 ? (totalBytes - loadedBytes) / speed : 0;
  // Feiner Balken inkl. Teilfortschritt der gerade laufenden Datei.
  const fractional = items.reduce((sum, it) => {
    if (it.status === "done" || it.status === "error") return sum + 1;
    if (it.status === "uploading") return sum + it.progress / 100;
    return sum;
  }, 0);
  const overallPct = total > 0 ? Math.round((fractional / total) * 100) : 0;

  return (
    <div className="space-y-4">
      <AnimatePresence>
        {pending && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={() => setPending(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.97, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 8 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-lg space-y-4 rounded-xl bg-white p-5 shadow-xl dark:bg-neutral-900"
            >
              <div>
                <h3 className="text-base font-semibold">
                  {pending.conflicts.length === 1
                    ? "Ein Bild existiert bereits"
                    : `${pending.conflicts.length} Bilder existieren bereits`}
                </h3>
                <p className="mt-1 text-sm text-neutral-500">
                  Wähle, wie mit den gleichnamigen Bildern verfahren werden soll.
                </p>
              </div>

              {pending.conflicts.length > 1 && (
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="mr-1 text-neutral-400">Für alle:</span>
                  {MODE_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setAllConflictModes(opt.value)}
                      className="rounded-full border border-neutral-300 px-2.5 py-1 transition hover:border-neutral-900 dark:border-neutral-700 dark:hover:border-neutral-100"
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}

              <ul className="max-h-72 space-y-2 overflow-y-auto">
                {pending.conflicts.map((c) => (
                  <li
                    key={c.itemId}
                    className="flex flex-col gap-2 rounded-lg border border-neutral-200 p-3 text-sm dark:border-neutral-800 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <span className="truncate font-medium">{c.name}</span>
                    <select
                      value={c.mode}
                      onChange={(e) =>
                        setConflictMode(c.itemId, e.target.value as Mode)
                      }
                      className="rounded-md border border-neutral-300 bg-transparent px-2 py-1 text-sm dark:border-neutral-700"
                    >
                      {MODE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </li>
                ))}
              </ul>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setPending(null)}
                  className="rounded-lg px-3 py-1.5 text-sm text-neutral-500 transition hover:text-neutral-900 dark:hover:text-neutral-100"
                >
                  Abbrechen
                </button>
                <button
                  type="button"
                  onClick={confirmPending}
                  className="rounded-lg bg-neutral-900 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
                >
                  Hochladen
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-10 text-center transition ${
          dragging
            ? "border-neutral-900 bg-neutral-50 dark:border-neutral-100 dark:bg-neutral-900"
            : "border-neutral-300 hover:border-neutral-400 dark:border-neutral-700 dark:hover:border-neutral-600"
        }`}
      >
        <p className="text-sm font-medium">
          Bilder, Videos & RAWs hierher ziehen oder klicken
        </p>
        <p className="text-xs text-neutral-400">
          JPEG, PNG, WebP (max. 64&nbsp;MB) · MP4/WebM (max. 100&nbsp;MB) · RAW wird per
          Dateiname automatisch zugeordnet
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="image/*,video/mp4,video/webm,.mp4,.m4v,.webm,.cr2,.cr3,.nef,.nrw,.arw,.sr2,.srf,.dng,.raf,.orf,.rw2,.rwl,.pef,.srw,.raw,.3fr,.mef,.iiq,.x3f,.erf"
          multiple
          hidden
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {total > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium">
              {pendingCount > 0
                ? `Lädt hoch … ${finished}/${total}`
                : `Fertig · ${finished}/${total}`}
            </span>
            <span className="text-neutral-400">
              {pendingCount > 0
                ? `noch ${pendingCount} in der Warteschlange`
                : `${overallPct}%`}
            </span>
          </div>
          {pendingCount > 0 && speed > 0 && (
            <div className="flex items-center justify-between text-xs text-neutral-400">
              <span>{formatSpeed(speed)}</span>
              <span>{formatEta(etaSeconds)}</span>
            </div>
          )}
          <div className="h-2 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
            <div
              className="h-full bg-neutral-900 transition-all duration-300 dark:bg-neutral-100"
              style={{ width: `${overallPct}%` }}
            />
          </div>
        </div>
      )}

      <AnimatePresence>
        {items.length > 0 && (
          <motion.ul
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="max-h-64 space-y-2 overflow-y-auto"
          >
            {items.map((it) => (
              <motion.li
                key={it.id}
                layout
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-lg border border-neutral-200 p-3 text-sm dark:border-neutral-800"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate">{it.name}</span>
                  <span
                    className={
                      it.status === "error"
                        ? "text-red-600"
                        : it.status === "done"
                          ? "text-green-600"
                          : "text-neutral-400"
                    }
                  >
                    {it.status === "error"
                      ? (it.error ?? "Fehler")
                      : it.status === "done"
                        ? (it.note ?? "✓")
                        : it.status === "queued"
                          ? "wartet …"
                          : `${it.progress}%`}
                  </span>
                </div>
                {it.status === "uploading" && (
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
                    <div
                      className="h-full bg-neutral-900 transition-all dark:bg-neutral-100"
                      style={{ width: `${it.progress}%` }}
                    />
                  </div>
                )}
              </motion.li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
