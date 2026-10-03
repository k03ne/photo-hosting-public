import { parseSocials, SOCIAL_PLATFORMS, socialUrl } from "@/lib/branding";
import {
  isExternalHref,
  parseMenuItems,
  parseSocialKeys,
  parseSocialsMode,
  type MenuItem,
  type SocialsMode,
} from "@/lib/menu-items";
import { prisma } from "@/lib/prisma";

/**
 * Das Menü der öffentlichen Website — eine einzige Quelle für alle drei Orte,
 * an denen es auftaucht: Startseite (WebGL-Themes), Unterseiten und die
 * Menü-Kachel im Backend. Vorher baute jede Stelle ihre eigene Liste; die
 * Reihenfolgen wichen bereits voneinander ab.
 *
 * Der Inhalt ist kuratierbar (`SiteSettings.menuItems`): eigene Seiten in
 * frei wählbarer Reihenfolge plus freie/externe Links. Solange nichts kuratiert
 * ist, greift die automatische Ableitung aus den veröffentlichten Seiten —
 * eine frische Installation hat damit sofort ein sinnvolles Menü.
 */

export type SiteMenuItem = {
  label: string;
  href: string;
  /** In neuem Tab öffnen (externe Ziele). */
  external?: boolean;
};

/** Menü + Social-Gruppe in einem Rutsch — beide hängen an denselben Einstellungen. */
export type SiteNavigation = {
  enabled: boolean;
  items: SiteMenuItem[];
  /** Ausgewählte, aufgelöste Social-Links (leer, wenn Modus „off"). */
  socials: SiteMenuItem[];
  socialsMode: SocialsMode;
};

/** Reihenfolge im automatisch abgeleiteten Menü. */
const KIND_ORDER: Record<string, number> = {
  HOME: 0,
  CUSTOM: 1,
  CONTACT: 2,
  IMPRINT: 3,
  PRIVACY: 4,
};

type PageRow = { id: string; title: string; slug: string; kind: string; isHome: boolean };

async function publishedPages(ownerId: string): Promise<PageRow[]> {
  return prisma.page.findMany({
    where: {
      ownerId,
      isPublished: true,
      isEnabled: true,
      kind: { in: Object.keys(KIND_ORDER) },
    },
    select: { id: true, title: true, slug: true, kind: true, isHome: true },
    orderBy: { createdAt: "asc" },
  });
}

const hrefOf = (p: PageRow) => (p.isHome ? "/" : `/${p.slug}`);

/** Automatische Ableitung: Startseite, eigene Seiten, Kontakt, dann Rechtsseiten. */
function derive(pages: PageRow[]): SiteMenuItem[] {
  return [...pages]
    .sort((a, b) => (KIND_ORDER[a.kind] ?? 9) - (KIND_ORDER[b.kind] ?? 9))
    .map((p) => ({ label: p.title, href: hrefOf(p) }));
}

/** Kuratierte Liste auflösen; verwaiste Seiten-Verweise fallen still heraus. */
function resolve(curated: MenuItem[], pages: PageRow[]): SiteMenuItem[] {
  const byId = new Map(pages.map((p) => [p.id, p]));
  const out: SiteMenuItem[] = [];
  for (const it of curated) {
    if (it.t === "page") {
      // Eine zurückgezogene Seite verschwindet aus dem Menü, statt ins Leere zu
      // führen — der Eintrag bleibt aber gespeichert und kehrt zurück, sobald
      // die Seite wieder veröffentlicht ist.
      const p = byId.get(it.id);
      if (p) out.push({ label: p.title, href: hrefOf(p) });
    } else {
      out.push({
        label: it.label,
        href: it.href,
        external: it.blank ?? isExternalHref(it.href),
      });
    }
  }
  return out;
}

/** Eine wählbare Seite im Menü-Editor. */
export type MenuPageOption = { id: string; title: string; href: string };

/**
 * Bausteine für den Menü-Editor im Backend: alle veröffentlichten Seiten (für
 * die Auswahlliste) und die automatische Reihenfolge als kuratierbare Einträge —
 * damit „Automatisch aufbauen" im Editor exakt das ergibt, was die Website ohne
 * Kuratierung zeigen würde.
 */
export async function getMenuEditorPages(
  ownerId: string,
): Promise<{ pages: MenuPageOption[]; auto: MenuItem[] }> {
  const sorted = [...(await publishedPages(ownerId))].sort(
    (a, b) => (KIND_ORDER[a.kind] ?? 9) - (KIND_ORDER[b.kind] ?? 9),
  );
  return {
    pages: sorted.map((p) => ({ id: p.id, title: p.title, href: hrefOf(p) })),
    auto: sorted.map((p) => ({ t: "page" as const, id: p.id })),
  };
}

export async function buildSiteMenu(ownerId: string): Promise<SiteMenuItem[]> {
  const [settings, pages] = await Promise.all([
    prisma.siteSettings.findUnique({ where: { ownerId }, select: { menuItems: true } }),
    publishedPages(ownerId),
  ]);
  const curated = parseMenuItems(settings?.menuItems);
  return curated.length > 0 ? resolve(curated, pages) : derive(pages);
}

/** Menü, Social-Gruppe und Sichtbarkeit in einer Abfrage. */
export async function getSiteNavigation(ownerId: string): Promise<SiteNavigation> {
  const [settings, pages] = await Promise.all([
    prisma.siteSettings.findUnique({
      where: { ownerId },
      select: {
        startMenuEnabled: true,
        menuItems: true,
        menuSocialsMode: true,
        menuSocialKeys: true,
        socials: true,
      },
    }),
    publishedPages(ownerId),
  ]);

  const curated = parseMenuItems(settings?.menuItems);
  const socialsMode = parseSocialsMode(settings?.menuSocialsMode);

  return {
    enabled: settings?.startMenuEnabled ?? true,
    items: curated.length > 0 ? resolve(curated, pages) : derive(pages),
    socials: socialsMode === "off" ? [] : resolveSocials(settings?.socials, settings?.menuSocialKeys),
    socialsMode,
  };
}

/**
 * Gepflegte Kanäle → anzeigbare Links. Gespeichert ist nur das Handle, die
 * Adresse baut `socialUrl()`. `menuSocialKeys` schränkt die Auswahl ein;
 * `null` bedeutet „alle gepflegten" (Verhalten vor der Auswahlmöglichkeit).
 */
function resolveSocials(socialsJson: unknown, keysJson: unknown): SiteMenuItem[] {
  const map = parseSocials(socialsJson);
  const allowed = parseSocialKeys(keysJson);
  const out: SiteMenuItem[] = [];
  for (const p of SOCIAL_PLATFORMS) {
    const raw = map[p.key];
    if (!raw) continue;
    if (allowed && !allowed.includes(p.key)) continue;
    const href = socialUrl(p.key, raw);
    if (href) out.push({ label: p.label, href, external: true });
  }
  return out;
}

/**
 * Ist das Menü sichtbar? Gilt global (nicht nur für die Startseite) — die
 * Spalte heißt aus historischen Gründen weiter `startMenuEnabled`.
 */
export async function isSiteMenuEnabled(ownerId: string): Promise<boolean> {
  const settings = await prisma.siteSettings.findUnique({
    where: { ownerId },
    select: { startMenuEnabled: true },
  });
  return settings?.startMenuEnabled ?? true;
}
