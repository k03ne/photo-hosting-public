/**
 * Kurze, eindeutige ID für UI-Zwecke (z.B. Listen-Keys).
 *
 * `crypto.randomUUID()` existiert im Browser nur im Secure Context (HTTPS oder
 * localhost). Über http:// ist die Funktion nicht verfügbar — daher ein
 * Fallback, damit der Uploader auch ohne TLS funktioniert. Kein Bedarf an
 * kryptografischer Stärke.
 */
export function uid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
