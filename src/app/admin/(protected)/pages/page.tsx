import Link from "next/link";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/server/current-admin";
import { ThemeCard } from "@/components/admin/ThemeCard";
import { MenuCard, type MenuSocialOption } from "@/components/admin/MenuCard";
import { InfoHint } from "@/components/admin/InfoHint";
import { formatDisplayName, parseSocials, SOCIAL_PLATFORMS, socialUrl } from "@/lib/branding";
import { parseStartTheme } from "@/lib/start-theme";
import { getMenuEditorPages } from "@/lib/site-menu";
import { parseMenuItems, parseSocialKeys, parseSocialsMode } from "@/lib/menu-items";
import {
  createPage,
  setPortfolioEnabled,
  ensureSystemPages,
  regenerateLegalPage,
  setPageEnabled,
} from "@/server/actions/pages";

/** Anzeige-Metadaten + Erklärung der festen Seiten (Reihenfolge = Sortierung). */
const SYSTEM_META: Record<string, { label: string; order: number; path: string; info: string }> = {
  HOME: {
    label: "Startseite",
    order: 0,
    path: "/",
    info: "Die immersive WebGL-Startseite. Inhalt & Bildquelle bearbeitest du hier direkt (kein Block-Builder). Farbe & Schrift rechts unter Grundeinstellungen.",
  },
  IMPRINT: {
    label: "Impressum",
    order: 1,
    path: "/impressum",
    info: "Anbieterkennzeichnung. Inhalt lässt sich aus deinen Identitäts-Angaben (Einstellungen) neu erzeugen.",
  },
  PRIVACY: {
    label: "Datenschutz",
    order: 2,
    path: "/datenschutz",
    info: "Datenschutzerklärung. Inhalt lässt sich aus deinen Identitäts-Angaben (Einstellungen) neu erzeugen.",
  },
  CONTACT: {
    label: "Kontakt",
    order: 3,
    path: "/kontakt",
    info: "Kontaktseite mit Formular. Der Empfänger wird unter Einstellungen → Versand gepflegt.",
  },
};

const CUSTOM_INFO = "Eigene Inhaltsseite unter /slug, gestaltet mit dem Block-Builder.";

function PublishBadge({ live }: { live: boolean }) {
  return (
    <span className={`chip ${live ? "bg-accent text-[hsl(var(--accent-ink))]" : "border text-muted"}`}>
      {live ? "Live" : "Entwurf"}
    </span>
  );
}

/**
 * Öffnet die öffentliche Seite in einem neuen Tab. Die Startseite hat eine eigene
 * Vorschau-Route, die unabhängig vom Live-Schalter rendert. Alle anderen Seiten
 * existieren nur unter ihrer öffentlichen URL — und die antwortet mit 404, solange
 * die Seite nicht veröffentlicht ist, bzw. zeigt den Platzhalter, solange die
 * Website nicht freigeschaltet ist. Statt den Nutzer ins Leere klicken zu lassen,
 * ist der Button dann deaktiviert und nennt den Grund.
 */
function PreviewButton({ href, blocked }: { href: string; blocked?: string }) {
  const base = "chip border px-3 py-1.5 transition";
  if (blocked) {
    return (
      <span className={`${base} cursor-not-allowed text-muted opacity-60`} title={blocked} aria-disabled>
        Vorschau ↗
      </span>
    );
  }
  return (
    <Link
      href={href}
      target="_blank"
      rel="noopener"
      title="Öffentliche Seite in neuem Tab öffnen"
      className={`${base} hover:border-ink`}
    >
      Vorschau ↗
    </Link>
  );
}

/** Grund, warum die öffentliche Vorschau (noch) nichts Sinnvolles zeigt. */
function previewBlocker(
  page: { isPublished: boolean; isEnabled: boolean },
  portfolioEnabled: boolean,
): string | undefined {
  if (!page.isPublished || !page.isEnabled) return "Seite ist noch nicht veröffentlicht.";
  if (!portfolioEnabled) return "Website ist nicht öffentlich — Besucher sehen nur den Platzhalter.";
  return undefined;
}

export default async function PagesOverview() {
  const admin = await requireAdmin();

  // Feste Seiten sicherstellen (idempotent), bevor gelistet wird.
  await ensureSystemPages(admin.id);

  const [allPages, settings, menuPages] = await Promise.all([
    prisma.page.findMany({ where: { ownerId: admin.id }, orderBy: { updatedAt: "desc" } }),
    prisma.siteSettings.findUnique({ where: { ownerId: admin.id } }),
    // Auswahlliste + automatische Reihenfolge aus derselben Quelle wie die
    // Website — kein Nachbau, sonst driften Editor und Menü auseinander.
    getMenuEditorPages(admin.id),
  ]);

  const portfolioEnabled = settings?.portfolioEnabled ?? false;
  const menuEnabled = settings?.startMenuEnabled ?? true;

  // Gepflegte Social-Kanäle mit fertiger Adresse — der Editor zeigt sie zur
  // Kontrolle an, gespeichert wird weiterhin nur das Handle.
  const socialValues = parseSocials(settings?.socials);
  const socialOptions: MenuSocialOption[] = SOCIAL_PLATFORMS.flatMap((p) => {
    const value = socialValues[p.key];
    const href = value ? socialUrl(p.key, value) : null;
    return href ? [{ key: p.key, label: p.label, href }] : [];
  });

  const curatedMenu = parseMenuItems(settings?.menuItems);
  const baseSettings = {
    mode: (settings?.startBgMode === "light" ? "light" : "dark") as "light" | "dark",
    color: settings?.startBgColor ?? "#0b0b0d",
    font: settings?.siteFont ?? "editorial",
    startTheme: parseStartTheme(settings?.startTheme),
  };

  // Wortmark für die Theme-Vorschau — dieselbe Ableitung wie `getStartPageData`,
  // damit die Kachel dieselbe Schriftmarke zeigt wie die Live-Startseite.
  const siteTitle =
    settings?.startTitle?.trim() ||
    formatDisplayName(settings?.ownerName, settings?.nameDisplayStyle ?? "FULL") ||
    "STUDIO";

  const systemPages = allPages
    .filter((p) => p.kind !== "CUSTOM")
    .sort((a, b) => (SYSTEM_META[a.kind]?.order ?? 9) - (SYSTEM_META[b.kind]?.order ?? 9));
  const customPages = allPages.filter((p) => p.kind === "CUSTOM");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Seiten</h1>
        <p className="mt-1.5 text-muted">
          Website-Struktur links, Grundeinstellungen rechts. Person, Marke, Auffindbarkeit &amp;
          Versand unter{" "}
          <Link href="/admin/settings" className="underline hover:text-ink">
            Einstellungen
          </Link>
          .
        </p>
      </div>

      {/* Links: Seiten (breiter) · Rechts: Sichtbarkeit, Theme, Grundeinstellungen */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-5">
        {/* ── Linke Spalte ─────────────────────────────────────────────────── */}
        <div className="space-y-8 lg:col-span-3">
          {/* Feste Seiten */}
          <section>
            <h2 className="mb-2 font-medium">Feste Seiten</h2>
            <ul className="divide-y rounded-xl border">
              {systemPages.map((page) => {
                const meta = SYSTEM_META[page.kind] ?? {
                  label: page.title,
                  path: `/${page.slug}`,
                  info: "",
                };
                const isLegal = page.kind === "IMPRINT" || page.kind === "PRIVACY";
                return (
                  <li
                    key={page.id}
                    // `relative` + gedehnter Link im Titel: die ganze Zeile öffnet
                    // den Editor, ohne interaktive Elemente ineinander zu schachteln.
                    className="relative flex items-center justify-between gap-3 px-5 py-4 transition hover:bg-surface"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <Link
                        href={`/admin/pages/${page.id}`}
                        className="font-medium after:absolute after:inset-0 after:content-['']"
                      >
                        {meta.label}
                      </Link>
                      <span className="text-sm text-muted">{meta.path}</span>
                      {meta.info && <InfoHint text={meta.info} />}
                    </div>
                    {/* `relative`, damit die Aktionen über der gedehnten Klickfläche liegen. */}
                    <div className="relative flex shrink-0 items-center gap-2">
                      {isLegal && (
                        <form action={regenerateLegalPage.bind(null, page.id)}>
                          <button
                            type="submit"
                            className="chip border px-3 py-1.5 transition hover:border-ink"
                            title="Inhalt aus den Identitäts-Angaben neu erzeugen"
                          >
                            Neu erzeugen
                          </button>
                        </form>
                      )}
                      {page.kind === "CONTACT" && (
                        <form action={setPageEnabled.bind(null, page.id)}>
                          <button
                            type="submit"
                            name="enabled"
                            value={page.isEnabled ? "off" : "on"}
                            aria-pressed={page.isEnabled}
                            className={`chip px-3 py-1.5 transition ${
                              page.isEnabled
                                ? "bg-accent text-[hsl(var(--accent-ink))]"
                                : "border hover:border-ink"
                            }`}
                          >
                            {page.isEnabled ? "Aktiv" : "Aus"}
                          </button>
                        </form>
                      )}
                      <PreviewButton
                        // Die Startseite hat eine eigene Vorschau-Route, die auch
                        // vor der Freischaltung das echte Theme rendert.
                        href={page.kind === "HOME" ? "/admin/start-preview" : meta.path}
                        blocked={
                          page.kind === "HOME"
                            ? undefined
                            : previewBlocker(page, portfolioEnabled)
                        }
                      />
                      <PublishBadge live={page.isPublished && page.isEnabled} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          {/* Eigene Seiten */}
          <section>
            <div className="mb-2 flex items-end justify-between gap-3">
              <h2 className="flex items-center gap-2 font-medium">
                Eigene Seiten
                <span className="text-sm font-normal text-muted">
                  {customPages.length} {customPages.length === 1 ? "Seite" : "Seiten"}
                </span>
                <InfoHint text={CUSTOM_INFO} />
              </h2>
              <form action={createPage} className="flex items-center gap-2">
                <input type="text" name="title" required placeholder="Titel der neuen Seite" className="input" />
                <button type="submit" className="btn-accent whitespace-nowrap">
                  Neue Seite
                </button>
              </form>
            </div>

            {customPages.length === 0 ? (
              <div className="card grid place-items-center border-dashed p-12 text-center">
                <p className="text-sm text-muted">Noch keine eigenen Seiten. Lege oben eine an.</p>
              </div>
            ) : (
              <ul className="divide-y rounded-xl border">
                {customPages.map((page) => (
                  <li
                    key={page.id}
                    className="relative flex items-center justify-between gap-3 px-5 py-4 transition hover:bg-surface"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <Link
                        href={`/admin/pages/${page.id}`}
                        className="truncate font-medium after:absolute after:inset-0 after:content-['']"
                      >
                        {page.title}
                      </Link>
                      <span className="text-sm text-muted">/{page.slug}</span>
                    </div>
                    <div className="relative flex shrink-0 items-center gap-2">
                      <PreviewButton
                        href={`/${page.slug}`}
                        blocked={previewBlocker(page, portfolioEnabled)}
                      />
                      <PublishBadge live={page.isPublished} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* ── Rechte Spalte ────────────────────────────────────────────────── */}
        <div className="space-y-8 lg:col-span-2">
          {/* Website öffentlich? */}
          <section className="card p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-medium">Website öffentlich</h2>
                <p className="mt-1 text-sm text-muted">
                  {portfolioEnabled
                    ? "Erreichbar — veröffentlichte Seiten sind live."
                    : "Deaktiviert — Besucher sehen eine Platzhalterseite."}
                </p>
              </div>
              {/* Ein klarer Schalter: sendet immer den GEGEN-Zustand. */}
              <form action={setPortfolioEnabled} className="shrink-0">
                <button
                  type="submit"
                  name="enabled"
                  value={portfolioEnabled ? "off" : "on"}
                  role="switch"
                  aria-checked={portfolioEnabled}
                  aria-label="Website öffentlich schalten"
                  className={`relative inline-flex h-7 w-12 items-center rounded-full transition ${
                    portfolioEnabled ? "bg-accent" : "bg-neutral-300 dark:bg-neutral-600"
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 rounded-full bg-white shadow transition ${
                      portfolioEnabled ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </form>
            </div>
          </section>

          {/* Theme-Wahl + globale Farbe & Schrift (Startseite + abgeleitet
              Unterseiten). Das OmniGrid-LAYOUT liegt im Startseite-Editor. */}
          <ThemeCard initial={baseSettings} siteTitle={siteTitle} />

          {/* Menü — global: Startseite UND Unterseiten */}
          <MenuCard
            enabled={menuEnabled}
            initialItems={curatedMenu.length > 0 ? curatedMenu : menuPages.auto}
            autoItems={menuPages.auto}
            curated={curatedMenu.length > 0}
            pages={menuPages.pages}
            socials={socialOptions}
            socialsMode={parseSocialsMode(settings?.menuSocialsMode)}
            socialKeys={parseSocialKeys(settings?.menuSocialKeys)}
          />
        </div>
      </div>
    </div>
  );
}
