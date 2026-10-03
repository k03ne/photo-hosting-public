"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/slug";
import { requireAdmin } from "@/server/current-admin";
import { blocksSchema } from "@/themes/schema";
import { startItemsSchema } from "@/lib/start-items";
import { menuItemsSchema, normalizeHref, SOCIALS_MODES } from "@/lib/menu-items";
import { themes, DEFAULT_THEME } from "@/themes/registry";
import {
  buildImprintBlocks,
  buildPrivacyBlocks,
  buildContactBlocks,
  type Identity,
} from "@/lib/legal-templates";

// ---------------------------------------------------------------------------
// Hilfen (nicht exportiert → keine Server-Action-Signatur nötig)
// ---------------------------------------------------------------------------

/** Lädt (oder erstellt) die SiteSettings-Zeile des Admins. Genau eine je Admin. */
async function ownedSettings(adminId: string) {
  return prisma.siteSettings.upsert({
    where: { ownerId: adminId },
    update: {},
    create: { ownerId: adminId, activeTheme: DEFAULT_THEME },
  });
}

/** Verifiziert Besitz einer Seite; wirft sonst (existenz wird nicht geleakt). */
async function ownedPage(pageId: string, adminId: string) {
  const page = await prisma.page.findUnique({ where: { id: pageId } });
  if (!page || page.ownerId !== adminId) throw new Error("Seite nicht gefunden.");
  return page;
}

/**
 * Reservierte Top-Level-Pfade: Seiten liegen unter der Root-Domain (`/[slug]`),
 * daher darf ein Slug keine statische Systemroute verdecken. Wird der Slug
 * reserviert, behandeln wir das wie eine Kollision (Suffix -2, …).
 */
const RESERVED_SLUGS = new Set([
  "admin",
  "api",
  "a",
  // Slugs der festen System-Seiten (dürfen von eigenen Seiten nicht belegt werden).
  "start",
  "impressum",
  "datenschutz",
  "kontakt",
]);

/** Eindeutiger Slug je Owner; hängt bei Kollision/Reservierung -2, -3, … an. */
async function uniquePageSlug(ownerId: string, base: string, excludeId?: string) {
  const root = slugify(base) || "seite";
  let slug = root;
  let n = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const existing = await prisma.page.findFirst({ where: { ownerId, slug } });
    const collides = existing && existing.id !== excludeId;
    if (!collides && !RESERVED_SLUGS.has(slug)) return slug;
    n += 1;
    slug = `${root}-${n}`;
  }
}

// ---------------------------------------------------------------------------
// SiteSettings / aktives Theme
// ---------------------------------------------------------------------------

/** Liest das aktive Theme des Admins (für Admin-UI). */
export async function getActiveTheme(): Promise<string> {
  const admin = await requireAdmin();
  const settings = await ownedSettings(admin.id);
  return settings.activeTheme;
}

const themeSchema = z.string().refine((t) => t in themes, "Unbekanntes Theme.");

/** Setzt das aktive Theme. Nur registrierte Themes sind erlaubt. */
export async function setActiveTheme(formData: FormData) {
  const admin = await requireAdmin();
  const parsed = themeSchema.safeParse(formData.get("theme"));
  if (!parsed.success) throw new Error("Ungültiges Theme.");

  await prisma.siteSettings.upsert({
    where: { ownerId: admin.id },
    update: { activeTheme: parsed.data },
    create: { ownerId: admin.id, activeTheme: parsed.data },
  });

  revalidatePath("/admin/settings");
  revalidatePath("/", "layout"); // öffentliche Seiten neu rendern
}

const baseSettingsSchema = z.object({
  mode: z.enum(["light", "dark"]),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Ungültige Farbe (Hex erwartet)."),
  font: z.enum(["editorial", "serif", "display", "sans"]),
  // Startseiten-Theme wird HIER (in den Haupteinstellungen) gewählt.
  startTheme: z.enum(["reel", "omnigrid"]),
});

/**
 * GLOBALE Grundeinstellungen der Website („Farbe & Schrift" unter /admin/pages):
 * Kontrast-Modus + Grundfarbe + Schrift + Wahl des Startseiten-Themes. Wirkt auf
 * die Startseite (`/`) UND — über abgeleitete Tokens — auf die Unterseiten. Die
 * theme-spezifischen LAYOUT-Optionen (OmniGrid: Bildgröße/Abstand/…) liegen
 * dagegen im Startseite-Editor (`setStartAppearance`).
 */
export async function setBaseSettings(formData: FormData) {
  const admin = await requireAdmin();
  const parsed = baseSettingsSchema.safeParse({
    mode: formData.get("mode"),
    color: formData.get("color"),
    font: formData.get("font"),
    startTheme: formData.get("startTheme"),
  });
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Ungültige Eingabe.");

  await prisma.siteSettings.upsert({
    where: { ownerId: admin.id },
    update: {
      startBgMode: parsed.data.mode,
      startBgColor: parsed.data.color,
      siteFont: parsed.data.font,
      startTheme: parsed.data.startTheme,
    },
    create: {
      ownerId: admin.id,
      activeTheme: DEFAULT_THEME,
      startBgMode: parsed.data.mode,
      startBgColor: parsed.data.color,
      siteFont: parsed.data.font,
      startTheme: parsed.data.startTheme,
    },
  });

  revalidatePath("/admin/pages");
  revalidatePath("/", "layout");
}

const startAppearanceSchema = z.object({
  // OmniGrid-spezifisch (nur wirksam bei startTheme = "omnigrid").
  omniAutoSpeed: z.coerce.number().min(0).max(1),
  omniShowGridLines: z.boolean(),
  omniAlwaysColor: z.boolean(),
  omniSubtitle: z.string().trim().max(120),
  omniGap: z.coerce.number().min(0).max(0.6),
  omniCellSize: z.coerce.number().min(1.5).max(6),
  omniBrandMode: z.enum(["swap", "fixed"]),
  omniHeadline: z.string().trim().max(120),
});

/**
 * LAYOUT der OmniGrid-Startseite (im Startseite-Editor): Bildgröße (`omniCellSize`),
 * Abstand (`omniGap`), Auto-Schwenk (`omniAutoSpeed`), Schneidematte
 * (`omniShowGridLines`), Farbigkeit der Bilder (`omniAlwaysColor`), Untertitel sowie der Auftritt der Marke
 * (`omniBrandMode` + die im Modus „fixed" freie `omniHeadline`). Die Theme-WAHL
 * liegt in den Haupteinstellungen (`setBaseSettings`).
 */
export async function setStartAppearance(formData: FormData) {
  const admin = await requireAdmin();
  const parsed = startAppearanceSchema.safeParse({
    omniAutoSpeed: formData.get("omniAutoSpeed"),
    omniShowGridLines: formData.get("omniShowGridLines") === "on",
    omniAlwaysColor: formData.get("omniAlwaysColor") === "on",
    omniSubtitle: formData.get("omniSubtitle") ?? "",
    omniGap: formData.get("omniGap"),
    omniCellSize: formData.get("omniCellSize"),
    omniBrandMode: formData.get("omniBrandMode") ?? "swap",
    omniHeadline: formData.get("omniHeadline") ?? "",
  });
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Ungültige Eingabe.");

  const data = {
    omniAutoSpeed: parsed.data.omniAutoSpeed,
    omniShowGridLines: parsed.data.omniShowGridLines,
    omniAlwaysColor: parsed.data.omniAlwaysColor,
    omniSubtitle: parsed.data.omniSubtitle || null,
    omniGap: parsed.data.omniGap,
    omniCellSize: parsed.data.omniCellSize,
    omniBrandMode: parsed.data.omniBrandMode,
    omniHeadline: parsed.data.omniHeadline || null,
  };

  await prisma.siteSettings.upsert({
    where: { ownerId: admin.id },
    update: data,
    create: { ownerId: admin.id, activeTheme: DEFAULT_THEME, ...data },
  });

  revalidatePath("/admin/pages");
  revalidatePath("/", "layout");
}

/**
 * Kuratierter Inhalt der Startseite (eigener Editor der festen Seite
 * „Startseite"): die explizit gewählten Bilder/Alben des Film-Strips und ob die
 * Filterleiste erscheint. Wortmark & Social-Links kommen aus den Einstellungen
 * (Branding/Socials), das Menü aus den veröffentlichten Seiten — hier NICHT
 * doppelt gepflegt.
 */
export async function setStartItems(formData: FormData) {
  const admin = await requireAdmin();

  let raw: unknown = [];
  try {
    raw = JSON.parse(String(formData.get("items") ?? "[]"));
  } catch {
    throw new Error("Ungültige Auswahl.");
  }
  const parsed = startItemsSchema.safeParse(raw);
  if (!parsed.success) throw new Error("Ungültige Auswahl.");
  const showFilter = formData.get("showFilter") === "on";

  await prisma.siteSettings.upsert({
    where: { ownerId: admin.id },
    update: { startItems: parsed.data, startShowFilter: showFilter },
    create: {
      ownerId: admin.id,
      activeTheme: DEFAULT_THEME,
      startItems: parsed.data,
      startShowFilter: showFilter,
    },
  });

  revalidatePath("/admin/pages");
  revalidatePath("/", "layout");
}

/**
 * Vergibt die Kategorie für mehrere im Startseiten-Editor gewählte Einträge auf
 * einmal — die Filterleiste speist sich aus genau diesen Werten, und sie
 * einzeln über die Mediathek nachzupflegen war der mit Abstand längste Weg.
 *
 * Bilder bekommen das Portfolio-Override (`portfolioCategory`), Alben ihre
 * Album-Kategorie; leer entfernt beides. Bei Bildern greift das Override auch
 * dann, wenn das Album eine andere Kategorie führt — gewollt, denn auf der
 * Startseite steht das einzelne Bild für sich.
 */
export async function setStartSelectionCategory(
  photoKeys: string[],
  albumIds: string[],
  category: string,
): Promise<void> {
  const admin = await requireAdmin();
  if (photoKeys.length === 0 && albumIds.length === 0) return;

  const cat = category.trim().slice(0, 60) || null;

  await prisma.$transaction([
    ...(photoKeys.length
      ? [
          prisma.photo.updateMany({
            // Owner-Scope über die Album-Relation.
            where: { storageKey: { in: photoKeys }, album: { ownerId: admin.id } },
            data: { portfolioCategory: cat },
          }),
        ]
      : []),
    ...(albumIds.length
      ? [
          prisma.album.updateMany({
            where: { id: { in: albumIds }, ownerId: admin.id },
            data: { category: cat },
          }),
        ]
      : []),
  ]);

  revalidatePath("/admin/bilder");
  revalidatePath("/admin/pages");
  revalidatePath("/", "layout");
}

/**
 * Aktiviert/deaktiviert das Burger-Menü der gesamten Website (Startseite UND
 * Unterseiten). Die Spalte heißt aus historischen Gründen `startMenuEnabled` —
 * als das Menü noch auf die Startseite beschränkt war.
 */
export async function setSiteMenu(formData: FormData) {
  const admin = await requireAdmin();
  const enabled = formData.get("enabled") === "on";

  await prisma.siteSettings.upsert({
    where: { ownerId: admin.id },
    update: { startMenuEnabled: enabled },
    create: { ownerId: admin.id, activeTheme: DEFAULT_THEME, startMenuEnabled: enabled },
  });

  revalidatePath("/admin/pages");
  revalidatePath("/", "layout");
}

const menuSettingsSchema = z.object({
  items: menuItemsSchema,
  socialsMode: z.enum(SOCIALS_MODES),
  /** `null` = alle gepflegten Kanäle zeigen. */
  socialKeys: z.array(z.string().trim().max(40)).max(20).nullable(),
});

/**
 * Inhalt des Menüs: Reihenfolge, eigene Seiten, freie/externe Links sowie
 * Platzierung und Auswahl der Social-Links.
 *
 * Kommt als JSON in einem Feld statt als Einzelfelder — eine geordnete Liste
 * mit gemischten Eintragstypen lässt sich über FormData nicht ohne Index-Basteln
 * abbilden. Eine LEERE Liste ist ein gültiger Zustand mit eigener Bedeutung:
 * „nicht kuratieren", also wieder automatisch aus den veröffentlichten Seiten
 * ableiten (siehe `buildSiteMenu`).
 */
export async function setMenuSettings(formData: FormData) {
  const admin = await requireAdmin();

  let json: unknown;
  try {
    json = JSON.parse(String(formData.get("payload") ?? ""));
  } catch {
    throw new Error("Menü konnte nicht gelesen werden.");
  }

  const parsed = menuSettingsSchema.safeParse(json);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Ungültige Eingabe.");

  // Adressen erst hier vereinheitlichen: „example.com" wäre sonst ein relativer
  // Pfad auf der eigenen Domain.
  const items = parsed.data.items.map((it) =>
    it.t === "link" ? { ...it, href: normalizeHref(it.href) } : it,
  );

  const data = {
    menuItems: items,
    menuSocialsMode: parsed.data.socialsMode,
    menuSocialKeys: parsed.data.socialKeys ?? undefined,
  };

  await prisma.siteSettings.upsert({
    where: { ownerId: admin.id },
    update: { ...data, menuSocialKeys: parsed.data.socialKeys ?? Prisma.DbNull },
    create: { ownerId: admin.id, activeTheme: DEFAULT_THEME, ...data },
  });

  revalidatePath("/admin/pages");
  revalidatePath("/", "layout");
}

/**
 * Auffindbarkeit: Titel, Beschreibung und die Freigabe für Suchmaschinen.
 * Favicon und Vorschaubild laufen als Datei-Uploads über
 * `api/admin/site-image` — hier stehen nur die Textfelder.
 */
export async function setSeoSettings(formData: FormData) {
  const admin = await requireAdmin();

  const text = (name: string, max: number) => {
    const v = String(formData.get(name) ?? "").trim();
    return v ? v.slice(0, max) : null;
  };
  const data = {
    seoTitle: text("seoTitle", 120),
    seoDescription: text("seoDescription", 300),
    seoIndexable: formData.get("indexable") === "on",
  };

  await prisma.siteSettings.upsert({
    where: { ownerId: admin.id },
    update: data,
    create: { ownerId: admin.id, activeTheme: DEFAULT_THEME, ...data },
  });

  // Die Kachel lebt unter Einstellungen → Auffindbarkeit.
  revalidatePath("/admin/settings");
  // Titel/Beschreibung/robots hängen im Root-Layout — alles neu bauen.
  revalidatePath("/", "layout");
}

/** Schaltet die öffentliche Portfolio-Website global an/aus. */
export async function setPortfolioEnabled(formData: FormData) {
  const admin = await requireAdmin();
  const enabled = formData.get("enabled") === "on";

  await prisma.siteSettings.upsert({
    where: { ownerId: admin.id },
    update: { portfolioEnabled: enabled },
    create: { ownerId: admin.id, portfolioEnabled: enabled, activeTheme: DEFAULT_THEME },
  });

  // Der Schalter lebt auf /admin/pages — dessen Cache invalidieren, sonst bleibt
  // die angezeigte Sichtbarkeit stehen (Schalter „wirkt nicht"). Plus die
  // öffentliche Route.
  revalidatePath("/admin/pages");
  revalidatePath("/", "layout");
}

// ---------------------------------------------------------------------------
// Page-CRUD
// ---------------------------------------------------------------------------

/** Legt eine neue Seite an und leitet in den Editor weiter. */
export async function createPage(formData: FormData) {
  const admin = await requireAdmin();
  const title = String(formData.get("title") ?? "").trim();
  if (!title) throw new Error("Titel ist erforderlich.");

  const slug = await uniquePageSlug(admin.id, title);
  const page = await prisma.page.create({
    data: { title, slug, ownerId: admin.id, blocks: [] },
  });

  revalidatePath("/admin/pages");
  redirect(`/admin/pages/${page.id}`);
}

/** Speichert die Blockstruktur einer Seite. `blocks` wird hart validiert. */
export async function savePageBlocks(pageId: string, blocks: unknown) {
  const admin = await requireAdmin();
  await ownedPage(pageId, admin.id);

  // Harte Grenze: invalider Input wird abgelehnt (.parse wirft).
  const validated = blocksSchema.parse(blocks);

  const page = await prisma.page.update({
    where: { id: pageId },
    data: { blocks: validated },
  });

  revalidatePath(`/admin/pages/${pageId}`);
  revalidatePath(`/${page.slug}`); // öffentliche Seite
  revalidatePath("/"); // falls es die Startseite ist
  return { ok: true as const };
}

const metaSchema = z.object({
  title: z.string().trim().min(1, "Titel ist erforderlich.").max(160),
  isPublished: z.boolean(),
});

/** Aktualisiert Titel, Slug (aus Titel) und Veröffentlichungsstatus. */
export async function updatePageMeta(pageId: string, formData: FormData) {
  const admin = await requireAdmin();
  const current = await ownedPage(pageId, admin.id);

  const parsed = metaSchema.safeParse({
    title: formData.get("title"),
    isPublished: formData.get("isPublished") === "on",
  });
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Ungültige Eingabe.");

  // Slug nur neu berechnen, wenn sich der Titel geändert hat.
  const slug =
    parsed.data.title === current.title
      ? current.slug
      : await uniquePageSlug(admin.id, parsed.data.title, pageId);

  await prisma.page.update({
    where: { id: pageId },
    data: { title: parsed.data.title, slug, isPublished: parsed.data.isPublished },
  });

  revalidatePath("/admin/pages");
  revalidatePath(`/admin/pages/${pageId}`);
  revalidatePath(`/${slug}`); // öffentliche Seite
  revalidatePath("/"); // falls es die Startseite ist
}

/**
 * Setzt (oder entfernt) die Startseite. Toggle: `makeHome=on` markiert die
 * Zielseite als Startseite und entfernt die Markierung von allen anderen Seiten
 * des Owners (nur EINE je Owner). Ohne `on` wird die Markierung entfernt.
 */
export async function setHomePage(pageId: string, formData: FormData) {
  const admin = await requireAdmin();
  await ownedPage(pageId, admin.id);
  const makeHome = formData.get("makeHome") === "on";

  await prisma.$transaction([
    // Zuerst alle Startseiten des Owners zurücksetzen (Partial-Unique-Index
    // erlaubt nur eine) …
    prisma.page.updateMany({
      where: { ownerId: admin.id, isHome: true },
      data: { isHome: false },
    }),
    // … dann ggf. die Zielseite markieren.
    ...(makeHome
      ? [prisma.page.update({ where: { id: pageId }, data: { isHome: true } })]
      : []),
  ]);

  revalidatePath("/admin/pages");
  revalidatePath(`/admin/pages/${pageId}`);
  revalidatePath("/");
}

/** Löscht eine Seite und kehrt zur Liste zurück. System-Seiten sind geschützt. */
export async function deletePage(pageId: string) {
  const admin = await requireAdmin();
  const page = await ownedPage(pageId, admin.id);
  if (page.kind !== "CUSTOM") {
    throw new Error("Feste Seiten können nicht gelöscht werden.");
  }
  await prisma.page.delete({ where: { id: pageId } });

  revalidatePath("/admin/pages");
  redirect("/admin/pages");
}

// ---------------------------------------------------------------------------
// Feste System-Seiten (Startseite, Impressum, Datenschutz, Kontakt)
// ---------------------------------------------------------------------------

const SYSTEM_DEFS = [
  { kind: "IMPRINT", slug: "impressum", title: "Impressum" },
  { kind: "PRIVACY", slug: "datenschutz", title: "Datenschutz" },
  { kind: "CONTACT", slug: "kontakt", title: "Kontakt" },
] as const;

function legalBlocksFor(kind: string, settings: Identity | null) {
  if (kind === "IMPRINT") return buildImprintBlocks(settings ?? {});
  if (kind === "PRIVACY") return buildPrivacyBlocks(settings ?? {});
  return buildContactBlocks();
}

/**
 * Stellt sicher, dass die vier festen Seiten je Admin existieren. Idempotent:
 * legt fehlende an (mit vorbefülltem Dummy-Inhalt), adoptiert vorhandene Seiten
 * mit reserviertem Slug und markiert eine bestehende Startseite als HOME.
 */
export async function ensureSystemPages(adminId: string) {
  const settings = await prisma.siteSettings.findUnique({ where: { ownerId: adminId } });

  // Startseite: höchstens eine je Owner (Partial-Unique auf isHome).
  const home = await prisma.page.findFirst({
    where: { ownerId: adminId, OR: [{ kind: "HOME" }, { isHome: true }] },
  });
  if (!home) {
    await prisma.page.create({
      data: {
        ownerId: adminId,
        kind: "HOME",
        isHome: true,
        title: "Startseite",
        slug: "start",
        blocks: [],
        isPublished: true,
      },
    });
  } else if (home.kind !== "HOME") {
    await prisma.page.update({ where: { id: home.id }, data: { kind: "HOME" } });
  }

  for (const def of SYSTEM_DEFS) {
    const existing = await prisma.page.findFirst({ where: { ownerId: adminId, kind: def.kind } });
    if (existing) continue;

    // Falls schon eine (eigene) Seite den reservierten Slug belegt: adoptieren.
    const bySlug = await prisma.page.findFirst({ where: { ownerId: adminId, slug: def.slug } });
    if (bySlug) {
      await prisma.page.update({ where: { id: bySlug.id }, data: { kind: def.kind } });
      continue;
    }

    await prisma.page.create({
      data: {
        ownerId: adminId,
        kind: def.kind,
        title: def.title,
        slug: def.slug,
        blocks: legalBlocksFor(def.kind, settings),
        isPublished: true,
        isEnabled: true,
      },
    });
  }
}

/** Baut Impressum/Datenschutz aus der aktuellen Identität neu auf. */
export async function regenerateLegalPage(pageId: string) {
  const admin = await requireAdmin();
  const page = await ownedPage(pageId, admin.id);
  if (page.kind !== "IMPRINT" && page.kind !== "PRIVACY") {
    throw new Error("Nur Impressum/Datenschutz können neu erzeugt werden.");
  }
  const settings = await prisma.siteSettings.findUnique({ where: { ownerId: admin.id } });
  await prisma.page.update({
    where: { id: pageId },
    data: { blocks: legalBlocksFor(page.kind, settings) },
  });

  revalidatePath("/admin/pages");
  revalidatePath(`/admin/pages/${pageId}`);
  revalidatePath(`/${page.slug}`);
}

/** Schaltet eine (System-)Seite sichtbar/unsichtbar — z.B. Kontakt deaktivieren. */
export async function setPageEnabled(pageId: string, formData: FormData) {
  const admin = await requireAdmin();
  await ownedPage(pageId, admin.id);
  const enabled = formData.get("enabled") === "on";
  await prisma.page.update({ where: { id: pageId }, data: { isEnabled: enabled } });

  revalidatePath("/admin/pages");
  revalidatePath("/", "layout");
}
