import "server-only";

import crypto from "node:crypto";

/**
 * Erzeugt den `shareToken` eines Albums — den kryptischen Teil der Gästelink-
 * Adresse `/a/<token>`.
 *
 * Bei einem Album OHNE Passwort ist die Unerratbarkeit dieses Tokens der
 * EINZIGE Schutz. Früher lieferte `@default(cuid())` den Wert: cuid v1 besteht
 * aber im Wesentlichen aus Zeitstempel, laufendem Zähler und Host-Fingerprint —
 * nur ein kleiner Teil ist Zufall. Wer ein paar Links kennt (oder, bei offenem
 * Quellcode, einfach das Verfahren), kann benachbarte Tokens stark eingrenzen.
 *
 * 16 Bytes aus dem CSPRNG → 128 Bit Entropie, base64url-kodiert (22 Zeichen,
 * URL-sicher ohne Escaping). Der Default im Prisma-Schema ist bewusst ENTFERNT:
 * so erzwingt der Typechecker, dass jeder neue Create-Pfad hier vorbeikommt,
 * statt still einen schwachen Token zu bekommen.
 */
export function newShareToken(): string {
  return crypto.randomBytes(16).toString("base64url");
}

/**
 * Erkennt Tokens aus der cuid-Zeit (vor der Umstellung), damit das Backend bei
 * den betroffenen Alben zum Neuerzeugen raten kann. cuid v1 ist ein kleines „c"
 * plus 24 Zeichen base36; die neuen Tokens sind 22 Zeichen base64url. Die
 * Prüfung ist absichtlich eng — im Zweifel gilt ein Token als in Ordnung, ein
 * falscher Alarm wäre hier schlimmer als ein verpasster Hinweis.
 */
export function isLegacyShareToken(token: string): boolean {
  return /^c[a-z0-9]{24}$/.test(token);
}
