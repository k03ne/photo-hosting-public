import type { CSSProperties } from "react";

/**
 * Platzhalterseite, solange die Website im Backend nicht freigeschaltet ist —
 * für die Startseite UND jede Unterseite dieselbe.
 *
 * Bewusst neutral gehalten: kein Name, kein Wortmark, keine Links. Wer hier
 * landet, sucht in aller Regel seine Galerie — die liegt aber unter einem
 * eigenen Freigabe-Link (`/a/<token>`) und ist von der öffentlichen Website
 * unabhängig. Genau darauf weist der Text hin, statt nur „nicht öffentlich" zu
 * melden. Einzige Anleihe an die Website sind ihre Design-Tokens (Grundfarbe,
 * Kontrast, Schrift) — sonst stünde der Platzhalter in fremden Farben da.
 */
export function SitePlaceholder({ tokens }: { tokens: Record<string, string> }) {
  return (
    <main
      style={tokens as CSSProperties}
      className="grid min-h-screen place-items-center bg-canvas px-6 text-center"
    >
      <div className="max-w-md">
        <span aria-hidden className="mx-auto mb-8 block h-px w-10 bg-ink/25" />
        <h1 className="font-display text-sm font-light uppercase tracking-[0.32em] text-ink">
          Nicht öffentlich
        </h1>
        <p className="mt-5 text-sm leading-relaxed text-muted">
          Diese Website ist derzeit nicht freigeschaltet.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Fotogalerien sind nur über den persönlichen Link erreichbar, den du von
          deinem Fotografen erhalten hast.
        </p>
      </div>
    </main>
  );
}
