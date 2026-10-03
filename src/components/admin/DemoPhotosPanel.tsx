"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  deleteDemoPhotos,
  finishDemoImport,
  hideDemoPhotos,
  importDemoPhoto,
  prepareDemoImport,
} from "@/server/actions/demo";

/** Themenvorschläge — Freitext bleibt möglich. */
const TOPICS = [
  "hochzeit",
  "portrait",
  "landschaft",
  "architektur",
  "streetlife",
  "natur",
];

const COUNTS = [6, 12, 24];

type Progress = { done: number; failed: number; total: number };

/** „3 Min." / „unter einer Minute" — für die Sperr-Anzeige. */
function untilLabel(target: Date, now: number): string {
  const min = Math.ceil((target.getTime() - now) / 60000);
  if (min <= 1) return "unter einer Minute";
  return `${min} Minuten`;
}

/**
 * Platzhalter-Bilder von Unsplash laden, um leere oder noch unsortierte Alben,
 * die Startseite und Seiten-Blöcke zu befüllen. Drei Auftritte:
 *  - MIT `albumId`: die Bilder landen in genau diesem Album.
 *  - OHNE: sie sammeln sich im automatisch angelegten Album „Demo-Bilder“.
 *  - Im Startseiten-Editor zusätzlich mit `onImported`, um die frisch geladenen
 *    Bilder direkt in die Auswahl zu übernehmen.
 *
 * Bewusst zugeklappt: Platzhalter sind Beiwerk, kein Hauptweg. Der Import läuft
 * Bild für Bild (`prepareDemoImport` → n× `importDemoPhoto`), damit der
 * Fortschritt echt ist und nicht nur ein „Lädt…“.
 *
 * Die Aufräum-Schalter wirken IMMER global (alle Demo-Bilder des Kontos) — sie
 * sind für den Moment gedacht, in dem echte Bilder da sind und die Platzhalter
 * überall verschwinden sollen.
 */
export function DemoPhotosPanel({
  albumId,
  existing,
  onImported,
  variant = "card",
}: {
  albumId?: string;
  /** Vorhandene Demo-Bilder im Konto — steuert die Aufräum-Schalter. */
  existing: number;
  /** Wird nach dem Import mit den neuen `storageKey`s aufgerufen. */
  onImported?: (storageKeys: string[]) => void;
  /** `plain` lässt die Karten-Optik weg (eingebettet in einen anderen Editor). */
  variant?: "card" | "plain";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(12);
  const [topic, setTopic] = useState("");
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const [progress, setProgress] = useState<Progress | null>(null);
  const [importing, setImporting] = useState(false);
  /** Verbleibende Unsplash-Anfragen dieser Stunde, soweit die API sie nennt. */
  const [quota, setQuota] = useState<{ remaining: number | null; limit: number | null } | null>(
    null,
  );
  /** Geschätzte Freigabe des Kontingents; solange gesetzt, ist Laden gesperrt. */
  const [blockedUntil, setBlockedUntil] = useState<Date | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // Ticker nur, solange die Sperre läuft — danach gibt er sich selbst frei.
  useEffect(() => {
    if (!blockedUntil) return;
    const tick = () => {
      const t = Date.now();
      setNow(t);
      if (t >= blockedUntil.getTime()) setBlockedUntil(null);
    };
    tick();
    const id = setInterval(tick, 10_000);
    return () => clearInterval(id);
  }, [blockedUntil]);

  // Nach dem Verlassen der Seite dürfen keine State-Updates mehr kommen.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const busy = pending || importing;

  const load = useCallback(async () => {
    setMessage(null);
    setImporting(true);
    setProgress(null);

    try {
      const prep = await prepareDemoImport({ albumId, count, topic: topic || undefined });
      if (!prep.ok) {
        if (prep.retryAt) setBlockedUntil(new Date(prep.retryAt));
        setMessage({ kind: "error", text: prep.error });
        return;
      }

      setQuota({ remaining: prep.remaining, limit: prep.limit });
      const total = prep.photos.length;
      setProgress({ done: 0, failed: 0, total });

      const keys: string[] = [];
      let stopped: string | null = null;

      for (const photo of prep.photos) {
        const res = await importDemoPhoto({ albumId: prep.albumId, photo });
        if (!alive.current) return;

        if (res.ok) {
          keys.push(res.storageKey);
          setProgress((p) => (p ? { ...p, done: p.done + 1 } : p));
        } else {
          setProgress((p) => (p ? { ...p, failed: p.failed + 1 } : p));
          if (res.stop) {
            stopped = res.error;
            break;
          }
        }
      }

      if (keys.length > 0) {
        await finishDemoImport(prep.albumId);
        onImported?.(keys);
        router.refresh();
      }

      // Unsplash liefert bei engen Themen weniger als angefragt — sonst wirkt
      // die Meldung wie ein Fehler.
      const where = albumId ? "in dieses Album" : "ins Album „Demo-Bilder“";
      const short = !stopped && total < count ? " (mehr gab das Thema nicht her)" : "";
      setMessage(
        keys.length === 0
          ? { kind: "error", text: stopped ?? "Kein Bild konnte geladen werden." }
          : {
              kind: "ok",
              text: `${keys.length} ${keys.length === 1 ? "Bild" : "Bilder"} ${where} geladen${short}.${
                stopped ? ` Abgebrochen: ${stopped}` : ""
              }`,
            },
      );
    } catch {
      setMessage({ kind: "error", text: "Import abgebrochen — bitte erneut versuchen." });
    } finally {
      if (alive.current) setImporting(false);
    }
  }, [albumId, count, topic, onImported, router]);

  function run(task: () => Promise<{ kind: "ok" | "error"; text: string }>) {
    setMessage(null);
    startTransition(async () => {
      setMessage(await task());
      router.refresh();
    });
  }

  const hide = () =>
    run(async () => {
      const res = await hideDemoPhotos();
      return {
        kind: "ok" as const,
        text: `${res.hidden} Demo-Bilder aus Startseite und Seiten-Blöcken genommen.`,
      };
    });

  const remove = () =>
    run(async () => {
      const res = await deleteDemoPhotos();
      return { kind: "ok" as const, text: `${res.deleted} Demo-Bilder in den Papierkorb gelegt.` };
    });

  const pct = progress && progress.total > 0
    ? Math.round(((progress.done + progress.failed) / progress.total) * 100)
    : 0;
  const left = progress ? progress.total - progress.done - progress.failed : 0;

  return (
    <section className={variant === "card" ? "card" : "rounded-xl border"}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center gap-3 px-5 py-4 text-left"
      >
        <span
          aria-hidden
          className={`text-xs text-muted transition-transform ${open ? "rotate-90" : ""}`}
        >
          ▶
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">Demo-Bilder laden</span>
          <span className="block text-xs text-muted">
            Platzhalter von Unsplash — optional, jederzeit gesammelt entfernbar.
          </span>
        </span>
        {existing > 0 && (
          <span className="chip shrink-0 border text-xs">{existing} im Konto</span>
        )}
        {importing && <span className="shrink-0 text-xs text-muted">{pct}%</span>}
      </button>

      {open && (
        <div className="space-y-4 border-t px-5 pb-5 pt-4">
          <p className="text-sm text-muted">
            Damit siehst du {albumId ? "das Album" : "Startseite und Seiten"} schon vor den echten
            Bildern realistisch. Die Bilder sind als Demo markiert.
          </p>

          <div className="flex flex-wrap items-end gap-4">
            <div>
              <span className="mb-1 block text-xs text-muted">Anzahl</span>
              <div className="flex gap-1">
                {COUNTS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCount(c)}
                    className={`chip cursor-pointer border ${count === c ? "bg-ink text-canvas" : ""}`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            <div className="min-w-0 flex-1">
              <label htmlFor="demo-topic" className="mb-1 block text-xs text-muted">
                Thema (optional)
              </label>
              <input
                id="demo-topic"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="z.B. hochzeit"
                className="input w-full"
              />
            </div>

            <button
              type="button"
              onClick={load}
              disabled={busy || blockedUntil !== null}
              className="btn-accent"
            >
              {importing ? `Bild ${Math.min(progress?.done ?? 0, count) + 1}…` : "Bilder laden"}
            </button>
          </div>

          <div className="flex flex-wrap gap-1">
            {TOPICS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTopic(t)}
                className={`chip cursor-pointer border ${topic === t ? "bg-ink text-canvas" : ""}`}
              >
                {t}
              </button>
            ))}
          </div>

          {progress && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs text-muted">
                <span>
                  Bild {Math.min(progress.done + progress.failed + (importing ? 1 : 0), progress.total)} von{" "}
                  {progress.total}
                  {progress.failed > 0 && ` · ${progress.failed} übersprungen`}
                </span>
                <span>{importing ? `noch ${left}` : "fertig"}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-line">
                <div
                  className="h-full bg-accent transition-[width] duration-300"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          )}

          {blockedUntil && (
            <p className="text-sm text-red-600">
              Unsplash-Kontingent aufgebraucht. Es läuft zur vollen Stunde neu an — geschätzt in{" "}
              {untilLabel(blockedUntil, now)}. Solange lassen sich keine Demo-Bilder laden.
            </p>
          )}

          {!blockedUntil && quota?.remaining != null && (
            <p className="text-xs text-muted">
              Noch {quota.remaining}
              {quota.limit ? ` von ${quota.limit}` : ""} Unsplash-Anfragen in dieser Stunde. Ein Bild
              kostet etwa eine Anfrage.
            </p>
          )}

          {message && (
            <p className={`text-sm ${message.kind === "error" ? "text-red-600" : "text-muted"}`}>
              {message.text}
            </p>
          )}

          {existing > 0 && (
            <div className="flex flex-wrap items-center gap-3 border-t pt-4 text-sm">
              <span className="text-muted">
                {existing} Demo-{existing === 1 ? "Bild" : "Bilder"} im Konto
              </span>
              <button type="button" onClick={hide} disabled={busy} className="btn-ghost">
                Aus der Website nehmen
              </button>
              <button type="button" onClick={remove} disabled={busy} className="btn-ghost">
                In den Papierkorb
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
