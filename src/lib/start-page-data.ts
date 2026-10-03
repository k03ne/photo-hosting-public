import { prisma } from "@/lib/prisma";
import { deriveSubpageTokens, SITE_DEFAULT_BG, SITE_DEFAULT_FONT } from "@/lib/color";
import { getSiteOwnerId } from "@/lib/portfolio";
import { mediaUrl } from "@/lib/media";
import { formatDisplayName } from "@/lib/branding";
import { parseStartItems, type StartItem } from "@/lib/start-items";
import { getSiteNavigation } from "@/lib/site-menu";
import type { SocialsMode } from "@/lib/menu-items";
import {
  parseStartTheme,
  parseOmniBrandMode,
  type StartTheme,
  type OmniBrandMode,
} from "@/lib/start-theme";
import type { FilmItem } from "@/store/useThemeStore";

/**
 * Server-seitige Datenbeschaffung für die fixe WebGL-Startseite. Übersetzt die
 * im Startseite-Editor kuratierte Auswahl (`startItems`) sowie Grundeinstellungen
 * (Farbe/Schrift) und Branding (Wortmark/Socials) in die Props des FilmStrip-
 * Themes — mit echten Bildern aus der Mediathek.
 */

// Theme-Typen liegen in `start-theme.ts` (prisma-frei, auch für Client-Code) —
// hier re-exportiert, damit Server-Aufrufer weiter aus einer Datei importieren.
export type { StartTheme, OmniBrandMode };
export { parseStartTheme, parseOmniBrandMode };

export interface StartPageData {
  /** Ist die öffentliche Website aktiv? (`/` blendet sonst aus.) */
  enabled: boolean;
  /** Welches Startseiten-Theme rendern? */
  startTheme: StartTheme;
  title: string;
  background: { mode: "light" | "dark"; color: string };
  font: string;
  items: FilmItem[];
  categories: string[];
  showFilter: boolean;
  social: { label: string; href: string }[];
  menu: { label: string; href: string; external?: boolean }[];
  /** Wo die Social-Links stehen: Ecke, im Menü oder gar nicht. */
  socialsMode: SocialsMode;
  /**
   * Marke der Startseite: Wortmarke (immer vorhanden) und optionales Logo-Bild.
   * `title` ist derselbe Text — hier bewusst getrennt, weil die Themes die Marke
   * an einer anderen Stelle zeigen als die (im Modus „fixed" freie) Headline.
   */
  brand: { name: string; logoSrc: string | null };
  /** OmniGrid-spezifische Optionen (nur relevant, wenn startTheme = "omnigrid"). */
  omni: {
    autoScrollSpeed: number;
    showGridLines: boolean;
    /** Bilder dauerhaft farbig statt erst beim Hover. */
    alwaysColor: boolean;
    subtitle: string | null;
    gap: number;
    cellSize: number;
    /** Auftritt der Marke: "swap" = Mitte ↔ oben links, "fixed" = dauerhaft oben links. */
    brandMode: OmniBrandMode;
    /** Freie Headline der Mitte (nur im Modus "fixed"); null = keine. */
    headline: string | null;
  };
}

const aspectOf = (w: number, h: number) => (h > 0 ? w / h : 0.72);

export async function getStartPageData(): Promise<StartPageData | null> {
  const ownerId = await getSiteOwnerId();
  if (!ownerId) return null;

  const settings = await prisma.siteSettings.findUnique({
    where: { ownerId },
    select: {
      portfolioEnabled: true,
      startTheme: true,
      omniAutoSpeed: true,
      omniShowGridLines: true,
      omniAlwaysColor: true,
      omniSubtitle: true,
      omniGap: true,
      omniCellSize: true,
      omniBrandMode: true,
      omniHeadline: true,
      logoType: true,
      logoImageKey: true,
      startBgMode: true,
      startBgColor: true,
      siteFont: true,
      startTitle: true,
      startItems: true,
      startShowFilter: true,
      ownerName: true,
      nameDisplayStyle: true,
    },
  });

  // Fallbacks aus der gemeinsamen Quelle — die Unterseiten leiten aus genau
  // denselben Werten ab (`deriveSubpageTokens`), sonst driften beide auseinander.
  const background = {
    mode: (settings?.startBgMode === "light" ? "light" : "dark") as "light" | "dark",
    color: settings?.startBgColor ?? SITE_DEFAULT_BG,
  };
  const font = settings?.siteFont ?? SITE_DEFAULT_FONT;

  // Wortmark: optionaler Override, sonst Name aus dem Branding (Einstellungen).
  const branded = formatDisplayName(settings?.ownerName, settings?.nameDisplayStyle ?? "FULL");
  const title = (settings?.startTitle?.trim() || branded || "STUDIO").toUpperCase();

  // Kuratierte Auswahl; leer → automatischer Fallback (veröffentlichte Alben),
  // damit die Startseite auch vor dem ersten Kuratieren nicht leer ist.
  const curated = await resolveCuratedItems(ownerId, parseStartItems(settings?.startItems));
  const items = curated.length ? curated : await fallbackPublishedAlbums(ownerId);

  const showFilter = settings?.startShowFilter ?? true;
  const categories = showFilter ? distinct(items.map((it) => it.category)) : [];

  // Menü UND Social-Links gelten global (Startseite + Unterseiten) — gemeinsame
  // Quelle, damit beide dieselben Einträge in derselben Reihenfolge zeigen.
  const nav = await getSiteNavigation(ownerId);
  const menu = nav.enabled ? nav.items : [];

  return {
    enabled: settings?.portfolioEnabled ?? false,
    startTheme: parseStartTheme(settings?.startTheme),
    title,
    background,
    font,
    items,
    categories,
    showFilter,
    social: nav.socials,
    menu,
    socialsMode: nav.socialsMode,
    brand: {
      name: title,
      // Logo nur, wenn der Admin es unter Branding auch als Bild-Logo führt —
      // ein hochgeladenes, aber auf „Text" gestelltes Logo bleibt ungenutzt.
      logoSrc:
        settings?.logoType === "IMAGE" && settings.logoImageKey
          ? `/api/media/${settings.logoImageKey}`
          : null,
    },
    omni: {
      autoScrollSpeed: settings?.omniAutoSpeed ?? 0.08,
      showGridLines: settings?.omniShowGridLines ?? true,
      alwaysColor: settings?.omniAlwaysColor ?? false,
      subtitle: settings?.omniSubtitle?.trim() || null,
      gap: settings?.omniGap ?? 0.16,
      cellSize: settings?.omniCellSize ?? 3.4,
      brandMode: parseOmniBrandMode(settings?.omniBrandMode),
      headline: settings?.omniHeadline?.trim() || null,
    },
  };
}

/**
 * Design-Tokens für die Platzhalterseite (Website nicht freigeschaltet). Die
 * Seite selbst bleibt neutral — sie zeigt weder Name noch Inhalte —, übernimmt
 * aber Grundfarbe, Kontrast und Schrift, damit sie nicht wie ein Fehler wirkt.
 * Ohne Owner (frische Installation) greifen die Standardwerte.
 */
export async function getPlaceholderTokens(): Promise<Record<string, string>> {
  const ownerId = await getSiteOwnerId();
  const settings = ownerId
    ? await prisma.siteSettings.findUnique({
        where: { ownerId },
        select: { startBgColor: true, siteFont: true },
      })
    : null;

  // Dieselbe Ableitung wie bei den Unterseiten — eine eigene Logik hier würde
  // zwangsläufig vom Rest der Website abweichen.
  return deriveSubpageTokens({ color: settings?.startBgColor, font: settings?.siteFont });
}

/** Wählt Cover/Fotos je Album (nur passwortfreie) für die Auflösung. */
const albumSelect = {
  id: true,
  title: true,
  category: true,
  coverPhoto: { select: { storageKey: true, width: true, height: true } },
  photos: {
    where: { deletedAt: null, mediaType: "IMAGE" },
    orderBy: { sortOrder: "asc" },
    take: 48,
    select: { storageKey: true, width: true, height: true },
  },
} as const;

type AlbumRow = {
  id: string;
  title: string;
  category: string | null;
  coverPhoto: { storageKey: string; width: number; height: number } | null;
  photos: { storageKey: string; width: number; height: number }[];
};

function albumToItem(a: AlbumRow): FilmItem | null {
  const cover = a.coverPhoto ?? a.photos[0];
  if (!cover) return null;
  return {
    id: `album-${a.id}`,
    kind: "album",
    title: a.title,
    category: a.category ?? "",
    aspect: aspectOf(cover.width, cover.height),
    src: mediaUrl(cover.storageKey, "thumb"),
    full: mediaUrl(cover.storageKey, "full"),
    albumId: a.id,
    albumPhotos: a.photos.map((p) => ({
      src: mediaUrl(p.storageKey, "full"),
      aspect: aspectOf(p.width, p.height),
    })),
  };
}

/** Löst die kuratierten Einträge (Reihenfolge erhalten) zu FilmItems auf. */
async function resolveCuratedItems(ownerId: string, curated: StartItem[]): Promise<FilmItem[]> {
  if (curated.length === 0) return [];

  const albumIds = curated.filter((i) => i.t === "album").map((i) => i.id);
  const photoKeys = curated.filter((i) => i.t === "photo").map((i) => i.k);

  const [albums, photos] = await Promise.all([
    albumIds.length
      ? prisma.album.findMany({
          where: { id: { in: albumIds }, ownerId, passwordHash: null },
          select: albumSelect,
        })
      : Promise.resolve([]),
    photoKeys.length
      ? prisma.photo.findMany({
          where: { storageKey: { in: photoKeys }, deletedAt: null, album: { ownerId } },
          select: {
            storageKey: true,
            width: true,
            height: true,
            caption: true,
            portfolioCategory: true,
            album: { select: { title: true, category: true } },
          },
        })
      : Promise.resolve([]),
  ]);

  const albumById = new Map(albums.map((a) => [a.id, a]));
  const photoByKey = new Map(photos.map((p) => [p.storageKey, p]));

  const out: FilmItem[] = [];
  for (const it of curated) {
    if (it.t === "album") {
      const a = albumById.get(it.id);
      const item = a && albumToItem(a);
      if (item) out.push(item);
    } else {
      const p = photoByKey.get(it.k);
      if (!p) continue;
      out.push({
        id: `photo-${p.storageKey}`,
        kind: "photo",
        title: p.caption ?? p.album.title,
        category: p.portfolioCategory ?? p.album.category ?? "",
        aspect: aspectOf(p.width, p.height),
        src: mediaUrl(p.storageKey, "thumb"),
        full: mediaUrl(p.storageKey, "full"),
      });
    }
  }
  return out;
}

/** Fallback ohne Kuratierung: veröffentlichte, passwortfreie Alben als Kacheln. */
async function fallbackPublishedAlbums(ownerId: string): Promise<FilmItem[]> {
  const albums = await prisma.album.findMany({
    where: { ownerId, isPublished: true, passwordHash: null },
    orderBy: { createdAt: "desc" },
    take: 24,
    select: albumSelect,
  });
  return albums.map(albumToItem).filter((x): x is FilmItem => x !== null);
}

/** Eindeutige, nicht-leere Werte in Erst-Vorkommens-Reihenfolge. */
function distinct(values: string[]): string[] {
  const out: string[] = [];
  for (const v of values) if (v && !out.includes(v)) out.push(v);
  return out;
}
