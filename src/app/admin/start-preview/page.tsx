import Link from "next/link";

import { StartThemeView } from "@/components/themes/StartThemeView";
import { getStartPageData, type StartPageData } from "@/lib/start-page-data";
import { isStartTheme, parseOmniBrandMode } from "@/lib/start-theme";
import { requireAdmin } from "@/server/current-admin";

export const dynamic = "force-dynamic";

/** Ersten String-Wert eines Query-Params holen. */
function str(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}
/** Numerischer Query-Param, geklemmt auf [min,max]; sonst undefined. */
function clampNum(
  v: string | string[] | undefined,
  min: number,
  max: number,
): number | undefined {
  const s = str(v);
  if (s == null || s === "") return undefined;
  const n = Number(s);
  if (!Number.isFinite(n)) return undefined;
  return Math.min(max, Math.max(min, n));
}

/**
 * Admin-Vorschau der Startseite — zeigt exakt das öffentliche WebGL-Theme mit den
 * echten, kuratierten Daten, ignoriert dabei aber den „Website öffentlich"-
 * Schalter.
 *
 * Liegt bewusst NEBEN der Route-Group `(protected)` statt darin: deren Layout
 * legt die Admin-Kopfzeile über die Seite und zerschnitt die Vorschau oben.
 * Geschützt bleibt sie trotzdem — die Middleware greift auf `/admin/:path*`,
 * `requireAdmin()` prüft zusätzlich serverseitig.
 *
 * Zusätzlich akzeptiert die Route Live-Overrides per Query (theme/mode/cell/gap/
 * grid/color/sub/speed/brand/head) — so kann der Startseite-Editor UNGESPEICHERTE Slider-Werte
 * 1:1 im echten Theme (eingebettet als iframe, `embed=1` blendet die Chrome aus)
 * darstellen.
 */
export default async function StartPreview({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const base = await getStartPageData();

  const embed = str(sp.embed) === "1";

  // Overrides anwenden (nur wenn vorhanden), sonst gespeicherte Werte.
  let data: StartPageData | null = base;
  if (base) {
    const themeParam = str(sp.theme);
    const modeParam = str(sp.mode);
    const grid = str(sp.grid);
    const color = str(sp.color);
    const sub = str(sp.sub);
    const brand = str(sp.brand);
    const head = str(sp.head);
    data = {
      ...base,
      // Nur ein bekanntes Theme überschreibt; sonst bleibt der gespeicherte Stand.
      startTheme: isStartTheme(themeParam) ? themeParam : base.startTheme,
      background: {
        ...base.background,
        mode: modeParam === "light" ? "light" : modeParam === "dark" ? "dark" : base.background.mode,
      },
      omni: {
        ...base.omni,
        cellSize: clampNum(sp.cell, 1.5, 6) ?? base.omni.cellSize,
        gap: clampNum(sp.gap, 0, 0.6) ?? base.omni.gap,
        showGridLines: grid == null ? base.omni.showGridLines : grid === "1",
        alwaysColor: color == null ? base.omni.alwaysColor : color === "1",
        subtitle: sub != null ? sub.trim() || null : base.omni.subtitle,
        autoScrollSpeed: clampNum(sp.speed, 0, 1) ?? base.omni.autoScrollSpeed,
        brandMode: brand != null ? parseOmniBrandMode(brand) : base.omni.brandMode,
        headline: head != null ? head.trim() || null : base.omni.headline,
      },
    };
  }

  return (
    <>
      {/* Exakt das öffentliche Theme (FilmStrip/OmniGrid). */}
      {data && <StartThemeView data={data} />}

      {/* Vorschau-Hinweis nur im Vollbild-Modus (nicht im eingebetteten iframe).
          Oben MITTIG, weil beide Themes ihre eigene Bedienung in die vier Ecken
          legen (Wortmark, Menü, Filter, Socials) — die Mitte ist der einzige
          freie Platz. Standardmäßig fast durchsichtig und erst beim Darüberfahren
          voll sichtbar: die Vorschau soll die Seite zeigen, nicht sich selbst. */}
      {!embed && (
        <Link
          href="/admin/pages"
          title="Zurück zum Admin"
          className="fixed left-1/2 top-4 z-[60] -translate-x-1/2 rounded-full border border-white/20 bg-black/50 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-white/90 opacity-30 backdrop-blur transition hover:opacity-100"
        >
          Vorschau{data?.enabled ? "" : " · nicht öffentlich"}
        </Link>
      )}
    </>
  );
}
