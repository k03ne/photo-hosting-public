import "server-only";

/**
 * Zentraler Zugriff auf `AUTH_SECRET` — die gemeinsame Wurzel aller nicht-
 * Session-Geheimnisse: Album-Zugriffs-Cookies ([album-access.ts]), verschlüsselte
 * SMTP-Zugangsdaten ([secret-box.ts]) und der Salt der IP-Hashes.
 *
 * In Produktion ist die Variable PFLICHT. Der frühere Fallback auf einen fest im
 * Code stehenden String machte den HMAC öffentlich berechenbar — Album-Cookies
 * wären fälschbar und der Passwortschutz damit wirkungslos gewesen, ohne dass
 * irgendwo etwas auffällt. Ein lauter Fehler ist die bessere Fehlerrichtung.
 */
export function appSecret(): string {
  const value = process.env.AUTH_SECRET;
  if (value) return value;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "AUTH_SECRET ist nicht gesetzt. Ohne diesen Wert wären Album-Passwortschutz " +
        "und gespeicherte SMTP-Zugangsdaten nicht geschützt.",
    );
  }
  return "insecure-dev-secret";
}
