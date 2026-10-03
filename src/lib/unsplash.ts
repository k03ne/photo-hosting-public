import "server-only";

/**
 * Minimaler Unsplash-Client für die Platzhalter-Bilder ("Demo-Bilder"). Nur so
 * viel API, wie das Befüllen leerer Alben/Startseiten braucht.
 *
 * Der frühere schlüssellose Endpunkt `source.unsplash.com` wurde 2024
 * abgeschaltet — die Themenwahl geht nur noch über die offizielle API mit
 * `UNSPLASH_ACCESS_KEY` (kostenlose Demo-App: 50 Anfragen/Stunde).
 */

const API = "https://api.unsplash.com";

/**
 * Marker in `Photo.demoSource`. Liegt hier statt in den Server Actions, weil
 * `"use server"`-Module ausschließlich async Funktionen exportieren dürfen.
 */
export const DEMO_SOURCE = "unsplash";

/** Ein Bild inkl. der für die Nennung nötigen Angaben. */
export type UnsplashPhoto = {
  id: string;
  /** Direkte Bild-URL (bereits auf eine sinnvolle Kantenlänge begrenzt). */
  url: string;
  /** Fotograf — Unsplash verlangt die Nennung. */
  credit: string;
  /** Bildbeschreibung, falls vorhanden (wird zur Bildunterschrift). */
  description: string | null;
  /** Endpunkt, der laut API-Richtlinien pro Verwendung anzustoßen ist. */
  downloadLocation: string | null;
};

export class UnsplashError extends Error {}

/**
 * Kontingent aufgebraucht. Unsplash schickt KEINEN Reset-Zeitpunkt mit — das
 * Kontingent gilt pro Stunde und läuft zur vollen Stunde neu an. `resetAt` ist
 * deshalb eine Schätzung und wird in der UI auch so benannt.
 */
export class UnsplashRateLimitError extends UnsplashError {
  readonly resetAt: Date;
  constructor(message: string, resetAt: Date) {
    super(message);
    this.resetAt = resetAt;
  }
}

/** Nächste volle Stunde — geschätzter Neustart des Kontingents. */
function nextHour(): Date {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return d;
}

/** Verbleibende Anfragen dieser Stunde, soweit die Antwort sie nennt. */
export type RateInfo = { remaining: number | null; limit: number | null };

function readRate(res: Response): RateInfo {
  const num = (v: string | null) => {
    const n = Number(v);
    return v !== null && Number.isFinite(n) ? n : null;
  };
  return {
    remaining: num(res.headers.get("x-ratelimit-remaining")),
    limit: num(res.headers.get("x-ratelimit-limit")),
  };
}

/**
 * Nur Unsplash-Hosts zulassen. Die Bild-Metadaten laufen zwischen den beiden
 * Import-Schritten über den Client — ohne diese Prüfung könnte ein
 * manipulierter Aufruf den Server beliebige URLs abrufen lassen (SSRF).
 */
function assertUnsplashUrl(raw: string, expectedHost?: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsplashError("Ungültige Bild-Adresse.");
  }
  const okHost = expectedHost
    ? url.hostname === expectedHost
    : url.hostname === "unsplash.com" || url.hostname.endsWith(".unsplash.com");
  if (url.protocol !== "https:" || !okHost) {
    throw new UnsplashError("Adresse gehört nicht zu Unsplash.");
  }
  return url;
}

/** Ist ein Schlüssel hinterlegt? (Die UI blendet die Funktion sonst aus.) */
export function unsplashConfigured(): boolean {
  return Boolean(process.env.UNSPLASH_ACCESS_KEY);
}

function authHeaders(): Record<string, string> {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key) throw new UnsplashError("UNSPLASH_ACCESS_KEY ist nicht gesetzt.");
  return { Authorization: `Client-ID ${key}`, "Accept-Version": "v1" };
}

/** Rohform der Antwort — nur die Felder, die wir tatsächlich lesen. */
type RawPhoto = {
  id?: unknown;
  description?: unknown;
  alt_description?: unknown;
  urls?: { raw?: unknown; regular?: unknown } | null;
  user?: { name?: unknown } | null;
  links?: { download_location?: unknown } | null;
};

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

function toPhoto(raw: RawPhoto): UnsplashPhoto | null {
  const id = str(raw.id);
  // `raw` erlaubt eigene Größenparameter; sonst die fertige „regular"-Variante.
  const rawUrl = str(raw.urls?.raw);
  const url = rawUrl ? `${rawUrl}&w=2400&q=80&fm=jpg` : str(raw.urls?.regular);
  if (!id || !url) return null;

  return {
    id,
    url,
    credit: str(raw.user?.name) ?? "Unsplash",
    description: str(raw.description) ?? str(raw.alt_description),
    downloadLocation: str(raw.links?.download_location),
  };
}

/**
 * Holt `count` zufällige Bilder, optional zu einem Thema. Unsplash liefert pro
 * Anfrage höchstens 30 Bilder — größere Mengen werden auf mehrere Anfragen
 * verteilt. Doppelte (bei kleinen Themen wahrscheinlich) werden entfernt, die
 * Rückgabe kann daher kürzer als `count` sein.
 *
 * Gibt zusätzlich das verbleibende Kontingent zurück, damit die UI vorwarnen
 * kann, statt den Nutzer in die nächste Sperre laufen zu lassen.
 */
export async function fetchRandomPhotos(
  count: number,
  topic?: string,
): Promise<{ photos: UnsplashPhoto[]; rate: RateInfo }> {
  const wanted = Math.max(1, Math.min(60, Math.trunc(count)));
  const out = new Map<string, UnsplashPhoto>();
  let rate: RateInfo = { remaining: null, limit: null };

  for (let remaining = wanted; remaining > 0 && out.size < wanted; ) {
    const batch = Math.min(30, remaining);
    remaining -= batch;

    const params = new URLSearchParams({ count: String(batch), content_filter: "high" });
    if (topic?.trim()) params.set("query", topic.trim());

    const res = await fetch(`${API}/photos/random?${params}`, {
      headers: authHeaders(),
      cache: "no-store",
    });

    rate = readRate(res);

    // 403 mit aufgebrauchtem Zähler = Kontingent; 403 ohne = fehlende Rechte.
    if (res.status === 403) {
      if (rate.remaining === 0 || rate.remaining === null) {
        throw new UnsplashRateLimitError(
          `Unsplash-Kontingent aufgebraucht${rate.limit ? ` (${rate.limit} Anfragen/Stunde)` : ""}.`,
          nextHour(),
        );
      }
      throw new UnsplashError("Unsplash verweigert den Zugriff (403).");
    }
    if (res.status === 401) {
      throw new UnsplashError("Unsplash-Schlüssel ungültig. Bitte UNSPLASH_ACCESS_KEY prüfen.");
    }
    if (!res.ok) {
      // Bei zu spezifischem Thema antwortet Unsplash mit 404 statt leerer Liste.
      if (res.status === 404) throw new UnsplashError("Zu diesem Thema gibt es keine Bilder.");
      throw new UnsplashError(`Unsplash antwortet mit Status ${res.status}.`);
    }

    const data: unknown = await res.json();
    // Bei count=1 liefert die API ein Objekt statt eines Arrays.
    const list: RawPhoto[] = Array.isArray(data) ? data : [data as RawPhoto];
    if (list.length === 0) break;

    for (const raw of list) {
      const photo = toPhoto(raw);
      if (photo && !out.has(photo.id)) out.set(photo.id, photo);
    }
  }

  return { photos: [...out.values()].slice(0, wanted), rate };
}

/** Lädt die eigentliche Bilddatei. */
export async function downloadPhoto(photo: UnsplashPhoto): Promise<Buffer> {
  const url = assertUnsplashUrl(photo.url);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new UnsplashError(`Bild konnte nicht geladen werden (${res.status}).`);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Meldet die Verwendung an Unsplash. Laut API-Richtlinien verpflichtend, für
 * unsere Funktion aber nicht kritisch — Fehler werden bewusst geschluckt, damit
 * ein Ausfall dieser Meldung den Import nicht abbricht.
 *
 * ACHTUNG fürs Kontingent: auch dieser Aufruf zählt als API-Anfrage. Ein Import
 * von N Bildern kostet also rund N+1 der 50 Anfragen pro Stunde.
 */
export async function trackDownload(photo: UnsplashPhoto): Promise<void> {
  if (!photo.downloadLocation) return;
  try {
    const url = assertUnsplashUrl(photo.downloadLocation, "api.unsplash.com");
    await fetch(url, { headers: authHeaders(), cache: "no-store" });
  } catch {
    // bewusst ignoriert
  }
}
