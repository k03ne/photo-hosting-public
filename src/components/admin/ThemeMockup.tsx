/**
 * Maßstabsgetreue Vorschau-Grafik der beiden Startseiten-Themes — dieselbe
 * Anordnung wie live (Wortmark, Menü, Hero, Socials, Filter/Raster-Schalter),
 * nur mit Platzhaltern statt echter Bilder.
 *
 * Bewusst als SVG mit festem `viewBox`: so skaliert dieselbe Grafik verlustfrei
 * von der kleinen Zusammenfassungs-Kachel bis zur großen Auswahl im Drawer, ohne
 * Größen-Props oder doppelte Typo-Skalen. Farbe, Kontrast und Schrift kommen aus
 * den Grundeinstellungen — die Vorschau zeigt also die AKTUELLE Wahl, auch wenn
 * sie noch nicht gespeichert ist.
 *
 * Für das echte (WebGL-)Bild gibt es `/admin/start-preview`; hier geht es um eine
 * schnelle, robuste Darstellung ohne drei parallele Canvas-Instanzen im Admin.
 */

import type { StartTheme } from "@/lib/start-theme";

/** Historischer Name; identisch mit dem Theme-Typ der Startseite. */
export type MockTheme = StartTheme;

/** Innenmaße der Grafik — 16:9, alle Koordinaten unten beziehen sich darauf. */
const VB = { w: 320, h: 180 };

export function ThemeMockup({
  theme,
  color,
  mode,
  fontCss,
  title,
  className,
}: {
  theme: MockTheme;
  color: string;
  mode: "light" | "dark";
  fontCss?: string;
  /** Wortmark (wie live: Großbuchstaben). */
  title: string;
  className?: string;
}) {
  const fg = mode === "dark" ? "#ffffff" : "#111111";
  const label = theme === "reel" ? "FilmStrip" : "OmniGrid";

  return (
    <svg
      viewBox={`0 0 ${VB.w} ${VB.h}`}
      className={className}
      role="img"
      aria-label={`Vorschau des ${label}-Themes`}
      style={{ fontFamily: fontCss, display: "block", width: "100%", height: "auto" }}
    >
      <rect width={VB.w} height={VB.h} fill={color} />
      {theme === "reel" ? <ReelMock fg={fg} /> : <OmniMock fg={fg} />}
      <Chrome fg={fg} title={title} theme={theme} />
    </svg>
  );
}

/* ── Gemeinsame Bedienelemente (Positionen wie in den echten Themes) ───────── */

function Chrome({ fg, title, theme }: { fg: string; title: string; theme: MockTheme }) {
  // Reel setzt die Wortmark weit gesperrt und leicht transparent, OmniGrid
  // kompakter und in Versalien — die Vorschau übernimmt beides.
  const reel = theme === "reel";
  return (
    <g fill={fg}>
      <text
        x={reel ? 16 : 14}
        y={reel ? 20 : 18}
        fontSize={reel ? 5.5 : 5}
        letterSpacing={reel ? 1.9 : 1.25}
        fontWeight={reel ? 300 : 500}
        opacity={0.8}
      >
        {title.slice(0, 18).toUpperCase()}
      </text>

      {/* Burger-Menü oben rechts */}
      <g opacity={0.7}>
        {[0, 4, 8].map((dy) => (
          <rect key={dy} x={294} y={13 + dy} width={12} height={1.2} rx={0.6} />
        ))}
      </g>

      {reel ? (
        <>
          {/* Socials: Spalte unten links */}
          <g opacity={0.45}>
            <rect x={16} y={155} width={22} height={1.6} rx={0.8} />
            <rect x={16} y={161} width={16} height={1.6} rx={0.8} />
          </g>
          {/* Kategorie-Filter: Pillen unten mittig */}
          <g>
            <rect x={116} y={152} width={88} height={14} rx={7} opacity={0.09} />
            {[
              { x: 122, w: 22 },
              { x: 148, w: 18 },
              { x: 170, w: 28 },
            ].map((p, i) => (
              <g key={p.x}>
                {i === 0 && <rect x={p.x - 3} y={155} width={p.w + 6} height={8} rx={4} opacity={0.16} />}
                <rect x={p.x} y={158} width={p.w} height={1.6} rx={0.8} opacity={i === 0 ? 0.8 : 0.4} />
              </g>
            ))}
          </g>
        </>
      ) : (
        <>
          {/* Raster-Schalter unten links */}
          <g>
            <rect
              x={14}
              y={155}
              width={34}
              height={11}
              rx={5.5}
              fill="none"
              stroke={fg}
              strokeWidth={0.7}
              opacity={0.35}
            />
            <rect x={20} y={160} width={22} height={1.4} rx={0.7} opacity={0.6} />
          </g>
          {/* Socials: Reihe unten rechts */}
          <g opacity={0.45}>
            <rect x={266} y={160} width={16} height={1.6} rx={0.8} />
            <rect x={288} y={160} width={18} height={1.6} rx={0.8} />
          </g>
        </>
      )}
    </g>
  );
}

/* ── FilmStrip: großer Hero-Titel, davor ein horizontaler Bildstreifen ─────── */

/**
 * Kacheln des Streifens: zur Mitte hin größer (Perspektive) und in der Summe
 * breiter als die Grafik — er läuft an beiden Seiten aus dem Bild, genau wie der
 * endlos scrollende Streifen im echten Theme.
 */
const STRIP = [
  { w: 30, h: 40 },
  { w: 38, h: 50 },
  { w: 48, h: 64 },
  { w: 62, h: 82 },
  { w: 48, h: 64 },
  { w: 38, h: 50 },
  { w: 30, h: 40 },
];

function ReelMock({ fg }: { fg: string }) {
  const gap = 12;
  const total = STRIP.reduce((s, t) => s + t.w, 0) + gap * (STRIP.length - 1);
  let x = (VB.w - total) / 2;
  const mid = (STRIP.length - 1) / 2;

  return (
    <>
      {/* Hero-Wortmark: live riesig (15vw) und weit hinter dem Streifen. */}
      <text
        x={VB.w / 2}
        y={102}
        textAnchor="middle"
        fontSize={62}
        fontWeight={200}
        letterSpacing={-2}
        fill={fg}
        opacity={0.12}
      >
        STUDIO
      </text>

      {STRIP.map((tile, i) => {
        const tx = x;
        x += tile.w + gap;
        return (
          <Placeholder
            key={i}
            x={tx}
            y={92 - tile.h / 2}
            w={tile.w}
            h={tile.h}
            fg={fg}
            opacity={i === mid ? 0.24 : 0.16}
          />
        );
      })}
    </>
  );
}

/* ── OmniGrid: unendliches Raster, Hero-Text darüber ───────────────────────── */

const CELL = 62;
const OMNI_GAP = 6;

function OmniMock({ fg }: { fg: string }) {
  const cells: { x: number; y: number }[] = [];
  // Bewusst über den Rand hinaus, damit das Raster wie live „unendlich" wirkt.
  for (let row = -1; row < 4; row++) {
    for (let col = -1; col < 6; col++) {
      cells.push({ x: col * (CELL + OMNI_GAP) - 18, y: row * (CELL + OMNI_GAP) - 24 });
    }
  }

  return (
    <>
      {/* Schneidematte: feine Hilfslinien im Raster-Takt */}
      <g stroke={fg} strokeWidth={0.4} opacity={0.18}>
        {cells
          .filter((c) => c.y === -24)
          .map((c) => (
            <line key={`v${c.x}`} x1={c.x - OMNI_GAP / 2} y1={0} x2={c.x - OMNI_GAP / 2} y2={VB.h} />
          ))}
        {cells
          .filter((c) => c.x === -18)
          .map((c) => (
            <line key={`h${c.y}`} x1={0} y1={c.y - OMNI_GAP / 2} x2={VB.w} y2={c.y - OMNI_GAP / 2} />
          ))}
      </g>

      <clipPath id="omni-clip">
        <rect width={VB.w} height={VB.h} />
      </clipPath>
      <g clipPath="url(#omni-clip)">
        {cells.map((c) => (
          <Placeholder key={`${c.x}:${c.y}`} x={c.x} y={c.y} w={CELL} h={CELL} fg={fg} opacity={0.13} />
        ))}
      </g>

      {/* Hero über dem Raster (live mit weichem Abdunkeln dahinter). */}
      <rect width={VB.w} height={VB.h} fill={fg === "#ffffff" ? "#000" : "#fff"} opacity={0.28} />
      <text
        x={VB.w / 2}
        y={88}
        textAnchor="middle"
        fontSize={17}
        fontWeight={200}
        letterSpacing={3.4}
        fill={fg}
      >
        STUDIO
      </text>
      <text
        x={VB.w / 2}
        y={104}
        textAnchor="middle"
        fontSize={6}
        fontWeight={300}
        letterSpacing={1.5}
        fill={fg}
        opacity={0.7}
      >
        UNTERTITEL
      </text>
    </>
  );
}

/* ── Bild-Platzhalter: Fläche + angedeutetes Motiv ─────────────────────────── */

function Placeholder({
  x,
  y,
  w,
  h,
  fg,
  opacity,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  fg: string;
  opacity: number;
}) {
  const s = Math.min(w, h) * 0.24;
  const cx = x + w / 2;
  const cy = y + h * 0.62;
  return (
    <g fill={fg}>
      <rect x={x} y={y} width={w} height={h} rx={1.5} opacity={opacity} />
      <path
        d={`M ${cx - s} ${cy} L ${cx - s * 0.3} ${cy - s * 0.75} L ${cx + s * 0.15} ${cy - s * 0.2} L ${cx + s * 0.5} ${cy - s * 0.55} L ${cx + s} ${cy} Z`}
        opacity={opacity * 1.5}
      />
      <circle cx={cx + s * 0.5} cy={cy - s * 0.95} r={s * 0.18} opacity={opacity * 1.5} />
    </g>
  );
}
