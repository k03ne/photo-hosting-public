import type { Block } from "@/themes/schema";
import { uid } from "@/lib/uid";

/**
 * Vorbefüllte, DSGVO-orientierte Dummy-Inhalte für die festen Rechtsseiten.
 * Platzhalter werden aus der Identität (SiteSettings) gefüllt; fehlende Angaben
 * erscheinen als deutlich sichtbarer Hinweis. Jeder Abschnitt ist ein Textblock,
 * damit er im normalen Seiten-Editor bearbeitbar bleibt.
 *
 * WICHTIG: Dies ist KEINE Rechtsberatung. Die Texte decken die real genutzten
 * Funktionen dieser Plattform ab, müssen aber vor Veröffentlichung geprüft
 * (und ggf. angepasst) werden.
 */

export type Identity = {
  ownerName?: string | null;
  addressStreet?: string | null;
  addressZip?: string | null;
  addressCity?: string | null;
  addressCountry?: string | null;
  phone?: string | null;
  vatId?: string | null;
  contactEmail?: string | null;
};

const MISSING = "[bitte in den Einstellungen → Identität ergänzen]";

function v(value: string | null | undefined): string {
  return value && value.trim() ? value.trim() : MISSING;
}

/** Baut den Anschrift-Block (Name + Straße + PLZ/Ort + Land). */
function addressLines(id: Identity): string {
  const cityLine = [id.addressZip, id.addressCity].filter(Boolean).join(" ").trim();
  return [
    v(id.ownerName),
    id.addressStreet?.trim() || MISSING,
    cityLine || MISSING,
    id.addressCountry?.trim() || null,
  ]
    .filter(Boolean)
    .join("\n");
}

function text(heading: string, body: string): Block {
  return { id: uid(), type: "text", data: { heading, body, align: "left" } };
}

const DISCLAIMER =
  "Hinweis: Dieser Text wurde automatisch aus deinen Angaben erzeugt und ist eine unverbindliche Vorlage — keine Rechtsberatung. Bitte prüfe ihn vor der Veröffentlichung und passe ihn an deine Situation an (ggf. anwaltlich prüfen lassen).";

// ---------------------------------------------------------------------------
// Impressum
// ---------------------------------------------------------------------------

export function buildImprintBlocks(id: Identity): Block[] {
  const blocks: Block[] = [
    text("Impressum", `Angaben gemäß § 5 DDG (Digitale-Dienste-Gesetz):\n\n${addressLines(id)}`),
    text("Kontakt", `Telefon: ${v(id.phone)}\nE-Mail: ${v(id.contactEmail)}`),
  ];

  if (id.vatId?.trim()) {
    blocks.push(
      text(
        "Umsatzsteuer-Identifikationsnummer",
        `Umsatzsteuer-ID gemäß § 27 a Umsatzsteuergesetz:\n${id.vatId.trim()}`,
      ),
    );
  }

  blocks.push(
    text(
      "Verantwortlich für den Inhalt",
      `Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV:\n\n${addressLines(id)}`,
    ),
    text(
      "Haftung für Inhalte & Links",
      "Als Diensteanbieter sind wir für eigene Inhalte auf diesen Seiten nach den allgemeinen Gesetzen verantwortlich. Für Inhalte externer Links ist stets der jeweilige Anbieter oder Betreiber verantwortlich. Zum Zeitpunkt der Verlinkung waren keine Rechtsverstöße erkennbar. Bei Bekanntwerden von Rechtsverletzungen entfernen wir solche Inhalte umgehend.",
    ),
    text(
      "Urheberrecht",
      "Die auf dieser Website veröffentlichten Fotografien und Inhalte unterliegen dem Urheberrecht. Jede Verwertung außerhalb der Grenzen des Urheberrechts bedarf der vorherigen schriftlichen Zustimmung des Urhebers.",
    ),
    text("Hinweis", DISCLAIMER),
  );

  return blocks;
}

// ---------------------------------------------------------------------------
// Datenschutzerklärung
// ---------------------------------------------------------------------------

export function buildPrivacyBlocks(id: Identity): Block[] {
  return [
    text(
      "Datenschutzerklärung",
      "Der Schutz deiner persönlichen Daten ist uns wichtig. Nachfolgend informieren wir dich darüber, welche Daten beim Besuch dieser Website verarbeitet werden. Grundlage ist die Datenschutz-Grundverordnung (DSGVO).",
    ),
    text("Verantwortlicher", `${addressLines(id)}\n\nE-Mail: ${v(id.contactEmail)}`),
    text(
      "Server-Logfiles & Hosting",
      "Beim Aufruf der Website werden technisch notwendige Zugriffsdaten verarbeitet (u.a. angefragte Adresse, Zeitpunkt, Browsertyp). Zum Schutz vor Missbrauch (z.B. wiederholte Fehlversuche bei passwortgeschützten Alben) speichern wir IP-Adressen ausschließlich in gehashter (pseudonymisierter) Form. Rechtsgrundlage ist unser berechtigtes Interesse an einem sicheren, störungsfreien Betrieb (Art. 6 Abs. 1 lit. f DSGVO).",
    ),
    text(
      "Kontaktformular",
      "Wenn du uns über das Kontaktformular schreibst, werden die von dir angegebenen Daten (z.B. Name, E-Mail-Adresse, Telefon, Nachricht) ausschließlich zur Bearbeitung deiner Anfrage per E-Mail an unser Postfach übermittelt. Eine darüber hinausgehende Speicherung in einer Datenbank findet nicht statt. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b bzw. f DSGVO.",
    ),
    text(
      "Cookies",
      "Wir verwenden nur technisch notwendige Cookies, keine Tracking- oder Marketing-Cookies:\n\n• Album-Zugang: Bei passwortgeschützten Alben wird nach korrekter Eingabe ein Cookie gesetzt, das lediglich einen kryptografischen Nachweis (keine personenbezogenen Daten) enthält, damit du das Album ohne erneute Eingabe ansehen kannst.\n• Gast-Kennung: Eine anonyme, zufällige Kennung ermöglicht es, deine „Gefällt mir\"-Angaben und Kommentare demselben Besuch zuzuordnen — ohne Benutzerkonto und ohne Identifizierung deiner Person.\n• Anmeldung (nur Betreiber): Für den geschützten Verwaltungsbereich wird eine Sitzung gesetzt.",
    ),
    text(
      "Fotografien & Metadaten (EXIF)",
      "Hochgeladene Bilder werden für die Anzeige aufbereitet. Dabei werden Standortdaten (GPS) aus den Metadaten entfernt. Einzelne technische Aufnahmedaten (z.B. Kamera, Brennweite) können angezeigt werden, sofern dies aktiviert ist.",
    ),
    text(
      "„Gefällt mir\" & Kommentare",
      "Reaktionen und Kommentare in Gäste-Galerien sind anonym über eine zufällige Gast-Kennung möglich; ein Benutzerkonto ist nicht erforderlich. Ein optional angegebener Name wird mit dem Kommentar gespeichert. Der Betreiber kann Kommentare moderieren und löschen.",
    ),
    text(
      "Externe Dienste",
      "Zur Zustellung der Kontaktformular-Nachrichten wird ein E-Mail-Versanddienst (SMTP) genutzt. Je nach Konfiguration können Bilddateien bei einem externen Speicheranbieter (S3-kompatibel) abgelegt sein. Es werden keine Analyse- oder Social-Media-Tracker eingebunden.",
    ),
    text(
      "Deine Rechte",
      "Du hast das Recht auf Auskunft, Berichtigung, Löschung und Einschränkung der Verarbeitung deiner Daten, auf Datenübertragbarkeit sowie ein Widerspruchsrecht. Zudem kannst du dich bei einer Datenschutz-Aufsichtsbehörde beschweren. Wende dich dazu an die oben genannten Kontaktdaten.",
    ),
    text("Hinweis", DISCLAIMER),
  ];
}

// ---------------------------------------------------------------------------
// Kontaktseite
// ---------------------------------------------------------------------------

export function buildContactBlocks(): Block[] {
  return [
    {
      id: uid(),
      type: "contactForm",
      data: { heading: "Kontakt", fields: ["name", "email", "message"] },
    },
  ];
}
