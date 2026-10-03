# photo-hosting

Selbstgehostete Foto-Plattform für Fotograf:innen: ein geschützter Admin-Bereich
zum Verwalten von Alben und pro Album eine öffentliche, optional
passwortgeschützte Gäste-Galerie. Oberfläche und Code-Kommentare sind auf
Deutsch.

Next.js 15 (App Router) · React 19 · TypeScript · Prisma · PostgreSQL · sharp

---

## Reifegrad — bitte zuerst lesen

Das Projekt ist aus einem konkreten Eigenbedarf entstanden und besteht aus zwei
sehr unterschiedlich weit gediehenen Hälften:

| Bereich | Stand |
|---|---|
| **Alben & Gäste-Galerien** (Upload, Sortierung, Passwortschutz, Downloads, Likes/Kommentare, Papierkorb) | **Ausgereift.** Im Dauerbetrieb, der Teil, für den die Plattform gebaut wurde. |
| **Site-Builder & Portfolio-Seite** (Startseite mit WebGL-Themes, Unterseiten-Baukasten, Menü-Editor, SEO-Kachel) | **Beta.** Funktioniert, ist aber unfertig. |

Was „Beta" hier konkret heißt:

- Die **Startseiten-Themes** (`reel`, `omnigrid`) sind WebGL/R3F-Experimente.
  `reel` ist im Backend ausdrücklich als Beta markiert. Erwarte Rauheiten bei
  Performance, mobilen Geräten und Reduced-Motion.
- Der **Unterseiten-Baukasten** hat genau ein registriertes Theme
  (`immersive`). Unterseiten leiten Farben und Schrift von der Startseite ab;
  einen eigenen Theme-Wähler gibt es bewusst nicht.
- Die **Datenmodelle für Seiten, Menü und Site-Settings** sind noch in Bewegung.
  Künftige Änderungen dort können Migrationen erfordern, die nicht jede
  bestehende Konfiguration verlustfrei übernehmen.
- Benennungen hinken der Umbauhistorie nach (z. B. heißt die Spalte für den
  globalen Menü-Schalter weiterhin `startMenuEnabled`, aus der Zeit, als das
  Menü nur zur Startseite gehörte).

Wer die Plattform für Kundengalerien einsetzen will, kann das tun — der
Portfolio-Teil lässt sich über `SiteSettings.portfolioEnabled` komplett
abschalten, dann zeigt die Wurzel-Domain nur einen neutralen Platzhalter.

Es gibt **keine Testsuite.** `npm run build` (Typecheck + Prerender) ist das
einzige Qualitätsgate.

---

## Funktionen

**Alben und Gäste-Galerien**

- Upload mit serverseitiger Bildpipeline: WebP-Anzeigebild, Thumbnail, winziger
  Blur-Platzhalter, ausgewählte EXIF-Daten — **GPS wird entfernt**.
- Manuelle Drag-&-Drop-Sortierung, Mehrfachauswahl per Marquee, Auto-Sortierung,
  Undo-Stack im Admin-Raster.
- Zwei Freigabe-Adressen pro Album: ein kryptischer Zufallslink und optional
  eine lesbare Klartext-URL.
- Optionaler Passwortschutz pro Album (bcrypt), unabhängig von der
  Admin-Session.
- Downloads einzeln oder als ZIP, in wählbarer Qualität; optionale
  RAW-Begleitdatei.
- Likes und Kommentare für Gäste ohne Benutzerkonto, mit Moderation
  (ausblenden/löschen) und Favoriten-Übersicht pro Gast.
- Soft-Delete als Papierkorb: gelöschte Bilder bleiben eine Stunde
  wiederherstellbar, danach räumt ein Purge Dateien und Datensätze ab.
- Speicherkontingent über `STORAGE_LIMIT_GB`, im Backend als Balken sichtbar.

**Öffentliche Website** (Beta, siehe oben)

- Startseite als immersives WebGL-Theme, kuratiert aus eigenen Bildern.
- Unterseiten über einen Block-Baukasten, globales Burger-Menü, Social-Links als
  bloße Handles.
- Titel, Beschreibung, Favicon, Link-Vorschaubild und ein
  Suchmaschinen-Schalter unter *Einstellungen → Auffindbarkeit*.
- Admin-Bereich und Gäste-Galerien sind **immer** `noindex` und in `robots.txt`
  gesperrt — Gästelinks sollen nicht auffindbar werden.

**Platzhalterbilder (optional)**

Leere Alben und die Startseite lassen sich mit Unsplash-Bildern füllen, um das
Layout zu beurteilen. Erfordert einen `UNSPLASH_ACCESS_KEY`; ohne Schlüssel
blendet das Backend die Funktion aus. Die Bilder sind als Demo markiert und
lassen sich gesammelt entfernen.

---

## Schnellstart

Voraussetzungen: Node.js 22 (20 genügt), Docker für die Datenbank.

```bash
git clone <dein-fork> photo-hosting
cd photo-hosting
npm ci

cp .env.example .env
# .env bearbeiten — mindestens:
#   AUTH_SECRET   (openssl rand -base64 32)
#   ADMIN_EMAIL / ADMIN_PASSWORD
#   DATABASE_URL  (Port muss zu DB_PORT passen)

docker compose up -d db     # PostgreSQL
npm run db:migrate          # Schema anlegen
npm run db:seed             # ersten Admin aus ADMIN_* erzeugen
npm run dev                 # http://localhost:3000
```

Das Backend liegt unter `/admin`, die Anmeldung unter `/admin/login`.

### Befehle

```bash
npm run dev          # Dev-Server
npm run build        # Produktionsbuild (= das Qualitätsgate)
npm run db:migrate   # Migration anlegen + anwenden (braucht laufende DB)
npm run db:generate  # Prisma-Client nach Schema-Änderungen neu erzeugen
npm run db:seed      # ersten Admin anlegen
npm run db:studio    # Prisma Studio
```

Nach `db:generate` oder `db:migrate` den Dev-Server neu starten — ein laufender
`next dev` hält den alten Client im Cache.

---

## Konfiguration

Alle Schalter stecken in der `.env`; `.env.example` ist durchkommentiert und die
maßgebliche Referenz. Die wichtigsten:

| Variable | Bedeutung |
|---|---|
| `DATABASE_URL`, `DB_PORT` | PostgreSQL. `DB_PORT` muss zum Port in der URL passen. |
| `AUTH_SECRET` | **Pflicht in Produktion.** Wurzel aller Nicht-Session-Geheimnisse (siehe Sicherheit). |
| `AUTH_URL` | **Hinter einem Reverse Proxy Pflicht.** Öffentliche Basis-URL; ohne sie leitet die Anmeldung auf `http://localhost:<PORT>` um. |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Erster Admin, wird vom Seed angelegt. |
| `STORAGE_DRIVER` | `local` (Dateisystem) oder `s3` (S3-kompatibel, z. B. MinIO). |
| `STORAGE_LIMIT_GB` | Speicherkontingent. Leer/0 = kein Limit. |
| `NEXT_PUBLIC_APP_URL` | Absolute Basis-URL für Freigabelinks und Sitemap. In Produktion mit `https://`. Wird zur Buildzeit eingebacken — Änderung erfordert einen neuen Build. |
| `UNSPLASH_ACCESS_KEY` | Optional, schaltet die Platzhalterbilder frei. |
| `SMTP_*`, `MAIL_FROM*` | Optionaler Fallback fürs Kontaktformular; Werte aus der Datenbank haben Vorrang. |
| `PM2_APP_NAME`, `PORT` | Nur fürs Deployment mehrerer Instanzen. |

**`ADMIN_EMAIL` von Anfang an setzen.** Ohne die Variable legt der Seed einen
Admin `admin@example.com` an; wird die echte Adresse später nachgetragen,
entsteht ein *zweiter* Konto-Datensatz. Die öffentliche Website wählt ihren
Besitzer deshalb nach Inhaltsmenge, nicht nach Alter — `scripts/admin-cleanup.ts`
listet die Admins auf und löscht ein leeres Geisterkonto.

---

## Sicherheitsmodell

Drei getrennte Mechanismen, die bewusst nichts voneinander wissen:

1. **Admin-Anmeldung** — Auth.js Credentials mit bcrypt. Das Edge-Middleware
   schützt `/admin/*`; Server-Komponenten und -Actions prüfen zusätzlich
   `requireAdmin()` und den Besitz des jeweiligen Objekts.
2. **Album-Passwort** — keine Session, sondern ein Cookie pro Album, dessen Wert
   ein HMAC-SHA256 der Album-ID ist (Schlüssel: `AUTH_SECRET`). Die
   Freigabeseite lädt vor der Freischaltung keine Bilder, und die Medien-Route
   prüft den Zugriff **pro Datei** erneut.
3. **Gäste** — anonymes `guest_id`-Cookie, damit Likes und Kommentare einem
   Gast zugeordnet werden können, ohne Konten anzulegen.

Weiteres:

- **`AUTH_SECRET` ist in Produktion Pflicht** und wirft beim Fehlen einen
  Fehler. Daraus abgeleitet werden Album-Cookies, die Verschlüsselung
  gespeicherter SMTP-Zugangsdaten (AES-256-GCM) und der Salt der IP-Hashes.
  **Wird der Wert rotiert, sind in der Datenbank abgelegte SMTP-Passwörter
  nicht mehr lesbar** und müssen einmal neu eingetragen werden. Album-Cookies
  verfallen dabei ebenfalls — Gäste geben das Passwort einfach erneut ein.
- **Freigabe-Tokens** stammen aus dem CSPRNG (128 Bit, `newShareToken()`). Bei
  einem Album ohne Passwort ist die Unerratbarkeit des Links der einzige
  Schutz. Ältere Alben tragen noch einen schwächeren, vorhersagbaren Token aus
  der Anfangszeit; das Backend weist in der Freigabe-Kachel darauf hin und bietet
  dort „Link neu erzeugen" an. Das geschieht absichtlich nicht automatisch, weil
  es alle bereits verschickten Gästelinks auf einen Schlag brechen würde.
- **Alle Medien laufen über `/api/media/<key>`**, nie direkt gegen den Speicher.
  Die Route behandelt Pfad-Traversal, die Unterscheidung Bytes vs.
  S3-Redirect und setzt bei geschützten Alben `Cache-Control: private`.
- **GPS-Daten werden beim Upload entfernt.** Übernommen wird nur eine Auswahl
  technischer EXIF-Felder, und auch die nur, wenn das Album sie anzeigen soll.
- Vom Client gelieferte URLs (Unsplash-Import) gehen durch eine Host-Allowlist
  gegen SSRF.

Einen Sicherheitsfehler bitte nicht als öffentliches Issue melden, sondern
direkt an den Repo-Inhaber.

---

## Deployment

Produktiv läuft die App nativ unter **pm2**; aus Docker kommt nur die
Datenbank. Der Docker-Deploy ist vorhanden, aber stillgelegt
(`deploy.yml` nur noch manuell startbar), weil der Image-Build auf einem
knappen Server nicht durchläuft.

`deploy-native.yml` baut und startet per SSH auf dem Zielserver, als Matrix über
beliebig viele Instanzen mit `max-parallel: 1` — zwei gleichzeitige
`next build` sprengen einen kleinen Server.

Benötigte GitHub-Secrets:

| Secret | Zweck |
|---|---|
| `SSH_HOST`, `SSH_USER`, `SSH_KEY` | Zugang zum Zielserver |
| `GIT_REMOTE` | Repo-Adresse für den Erstklon |
| `GH_PAT` | nur bei privatem Repo |
| `DEPLOY_PATH` | **Pflicht** — absoluter Zielordner der ersten Instanz |
| `DEPLOY_PATH_2` | nur bei einer zweiten Instanz (fehlt es, wird die Instanz übersprungen) |

Die Zielpfade stehen absichtlich **nicht** im Repo — es gibt keinen Fallback auf
einen geratenen Ordner. Wie ein fehlendes Secret gewertet wird, hängt am
`required`-Flag der Instanz: bei einer bestehenden Instanz bricht der Lauf mit
einer Meldung ab, eine als `required: "false"` markierte wird übersprungen.
Dasselbe gilt für eine fehlende `.env` im Zielordner. So blockiert eine noch
unfertige zweite Site die erste nicht.

### Mehrere Instanzen

Mehrere Websites laufen aus demselben Code, ein Ordner pro Domain. **Das Repo
enthält nichts Instanzspezifisches** — getrennt wird allein über die `.env` des
Ordners: `PM2_APP_NAME`, `PORT`, `DB_PORT`, `DATABASE_URL`, `AUTH_SECRET`,
`NEXT_PUBLIC_APP_URL`, `ADMIN_*`. Uploads liegen relativ zum Ordner und trennen
sich dadurch von selbst.

Jede Instanz bekommt **ihren eigenen Postgres-Container samt eigenem Volume**,
kein zweites Schema in einem gemeinsamen. Docker leitet den Projektnamen aus dem
Ordnernamen ab, und da sich die Ordner unterscheiden, ist die Trennung schon da;
verschieden sein muss nur `DB_PORT`. **Setze `COMPOSE_PROJECT_NAME` bei einer
bestehenden Instanz nicht nachträglich**, außer der Wert entspricht genau dem
bereits abgeleiteten (`docker compose ls`) — sonst zeigt Compose auf ein neues,
leeres Volume, die Seite wirkt frisch installiert, und die alten Daten liegen im
verwaisten Volume.

Die Reverse-Proxy-Konfiguration liegt auf dem Server und ist nicht Teil des
Repos. `prisma migrate deploy` wendet ausstehende Migrationen beim Start an.

**Zwei Stolperfallen beim Betrieb hinter einem Proxy**, beide schon erlebt:

- **`AUTH_URL` setzen.** Ohne die Variable baut Next die absolute Request-URL
  in der Middleware aus einem Fallback und leitet auf
  `http://localhost:<PORT>/admin/login` um — die Anmeldung ist von außen
  unerreichbar, obwohl die Seite selbst einwandfrei antwortet. Ein korrekter
  `Host`- oder `X-Forwarded-Host`-Header ändert daran nichts, `trustHost: true`
  allein ebenfalls nicht.
- **Die App lauscht auf `127.0.0.1`** (`ecosystem.config.cjs`, `-H 127.0.0.1`),
  ist also nur über den Proxy erreichbar. Der `proxy_pass` muss deshalb auf die
  wörtliche Adresse `127.0.0.1:<PORT>` zeigen — `localhost` kann auf `::1`
  auflösen, und dann antwortet niemand (502).

---

## Mitwirken

Das Projekt wird in erster Linie für den eigenen Bedarf entwickelt, Zeitpläne
und Richtung sind entsprechend unverbindlich. Fehlerberichte sind willkommen;
bei größeren Umbauten bitte vorher ein Issue öffnen — besonders im
Portfolio-/Site-Builder-Teil, der sich noch bewegt.

Praktisches: Es gibt keine Tests, `npm run build` muss durchlaufen. Ist keine
Datenbank verfügbar, prüft
`DATABASE_URL="postgresql://u:p@localhost:5432/db" npx prisma validate`
wenigstens das Schema; Migrationen lassen sich in diesem Fall von Hand anlegen
(siehe `CLAUDE.md`). UI-Texte und Code-Kommentare bitte auf Deutsch halten.

---

## Lizenz

Copyright © 2026 Andreas König (k03ne)

[GNU AGPL-3.0-only](LICENSE).

Nutzung, Veränderung und Weitergabe sind erlaubt. Wer eine veränderte Fassung
über ein Netzwerk anderen zugänglich macht — also etwa als gehostete Galerie
betreibt —, muss den Quellcode dieser Fassung den Nutzenden verfügbar machen
(§ 13 der Lizenz).
