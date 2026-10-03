/**
 * Branding-Hilfen: Namensdarstellung für das Schrift-Logo und die Liste der
 * unterstützten Social-Plattformen. Reine Funktionen/Konstanten (kein
 * `server-only`) — nutzbar in Admin-Vorschau UND öffentlichem Frontend.
 */

/** Schreibweisen des Schrift-Logos. */
export const NAME_DISPLAY_STYLES = ["FULL", "INITIAL_LAST", "LAST_ONLY", "INITIALS"] as const;
export type NameDisplayStyle = (typeof NAME_DISPLAY_STYLES)[number];

/**
 * Formatiert einen vollständigen Namen gemäß der gewählten Schreibweise.
 *  - FULL          → "Andreas König"
 *  - INITIAL_LAST  → "A. König"
 *  - LAST_ONLY     → "König"
 *  - INITIALS      → "AK"
 */
export function formatDisplayName(name: string | null | undefined, style: string): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  const first = parts[0];
  const last = parts[parts.length - 1];

  switch (style) {
    case "INITIAL_LAST":
      return parts.length > 1 ? `${first[0].toUpperCase()}. ${last}` : first;
    case "LAST_ONLY":
      return last;
    case "INITIALS":
      return parts.map((p) => p[0]?.toUpperCase() ?? "").join("");
    case "FULL":
    default:
      return parts.join(" ");
  }
}

/**
 * Unterstützte Social-Plattformen (Reihenfolge = Anzeige-Reihenfolge).
 *
 * Gespeichert wird nur das **Handle** — die vollständige Adresse baut
 * `socialUrl()` daraus. Vollständige URLs bleiben aber gültige Eingaben und
 * werden unverändert durchgereicht: gepflegte Altbestände dürfen nicht kaputt
 * gehen, und Sonderfälle (Firmen-Profile, eigene Domains) brauchen den Ausweg.
 *
 * `host` = Wurzel inklusive Schrägstrich, `path` = Zusatz, den ein reines Handle
 * bekommt (LinkedIn: `in/`). Enthält die Eingabe selbst einen Schrägstrich, gilt
 * sie als vollständiger Pfad und `path` entfällt — sonst würde aus
 * „company/studio" das falsche „/in/company/studio".
 */
export const SOCIAL_PLATFORMS = [
  { key: "instagram", label: "Instagram", host: "https://instagram.com/", at: true, placeholder: "deinname" },
  { key: "x", label: "X / Twitter", host: "https://x.com/", at: true, placeholder: "deinname" },
  { key: "facebook", label: "Facebook", host: "https://facebook.com/", at: false, placeholder: "deine.seite" },
  { key: "linkedin", label: "LinkedIn", host: "https://linkedin.com/", path: "in/", at: false, placeholder: "dein-name" },
  { key: "youtube", label: "YouTube", host: "https://youtube.com/", at: true, placeholder: "deinkanal" },
  { key: "tiktok", label: "TikTok", host: "https://tiktok.com/", at: true, placeholder: "deinname" },
  { key: "pinterest", label: "Pinterest", host: "https://pinterest.com/", at: false, placeholder: "deinname" },
  { key: "behance", label: "Behance", host: "https://behance.net/", at: false, placeholder: "deinname" },
  { key: "vimeo", label: "Vimeo", host: "https://vimeo.com/", at: false, placeholder: "deinname" },
  // Kein Handle-Schema — hier ist die vollständige Adresse die einzige Angabe.
  { key: "website", label: "Website", host: null, at: false, placeholder: "https://deine-domain.de" },
] as const;

export type SocialKey = (typeof SOCIAL_PLATFORMS)[number]["key"];
type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

/** `path` haben nur einzelne Plattformen — Zugriff über den Union-Typ absichern. */
function platformPath(p: SocialPlatform): string {
  return "path" in p ? p.path : "";
}

/** Plattform-Definition zu einem Schlüssel. */
export function socialPlatform(key: string): SocialPlatform | undefined {
  return SOCIAL_PLATFORMS.find((p) => p.key === key);
}

/** Normalisiert das rohe JSON aus der DB zu einem sauberen key→Wert-Objekt. */
export function parseSocials(json: unknown): Partial<Record<SocialKey, string>> {
  if (!json || typeof json !== "object") return {};
  const raw = json as Record<string, unknown>;
  const out: Partial<Record<SocialKey, string>> = {};
  for (const { key } of SOCIAL_PLATFORMS) {
    const v = raw[key];
    if (typeof v === "string" && v.trim()) out[key] = v.trim();
  }
  return out;
}

/**
 * Gespeicherter Wert → aufrufbare Adresse. Nimmt Handles („name", „@name"),
 * Pfade („company/studio") und vollständige URLs entgegen.
 */
export function socialUrl(key: string, value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) return v;

  const p = socialPlatform(key);
  // Ohne Handle-Schema (Website) kann nur eine Adresse gemeint sein.
  if (!p?.host) return `https://${v.replace(/^\/+/, "")}`;

  const handle = v.replace(/^@+/, "").replace(/^\/+/, "");
  if (!handle) return null;
  const path = handle.includes("/") ? "" : platformPath(p);
  return `${p.host}${path}${handle}`;
}

/**
 * Eingabe → Speicherform. Eine vollständige URL der EIGENEN Plattform wird auf
 * das nackte Handle zurückgeschnitten, damit im Feld künftig „deinname" steht.
 * Fremde Adressen bleiben unangetastet.
 */
export function normalizeSocialInput(key: string, raw: string): string {
  const v = raw.trim().replace(/\s+/g, "");
  if (!v) return "";

  const p = socialPlatform(key);
  if (!p?.host) return v;

  if (!/^https?:\/\//i.test(v)) return v.replace(/^@+/, "").replace(/^\/+/, "");

  let url: URL;
  try {
    url = new URL(v);
  } catch {
    return v;
  }
  const ownHost = new URL(p.host).hostname.replace(/^www\./, "");
  const gotHost = url.hostname.replace(/^www\./, "");
  if (gotHost !== ownHost) return v;

  // Pfad ohne führenden Schrägstrich, ohne den plattformeigenen Zusatz.
  let rest = url.pathname.replace(/^\/+/, "").replace(/\/+$/, "");
  const own = platformPath(p);
  if (own && rest.toLowerCase().startsWith(own.toLowerCase())) {
    rest = rest.slice(own.length);
  }
  return rest ? rest.replace(/^@+/, "") : v;
}
