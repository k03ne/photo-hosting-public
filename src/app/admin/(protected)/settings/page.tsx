import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/server/current-admin";
import { formatDisplayName, parseSocials } from "@/lib/branding";
import { IdentityCard } from "@/components/admin/IdentityCard";
import { SeoCard } from "@/components/admin/SeoCard";
import { BrandingCard } from "@/components/admin/BrandingCard";
import { SocialsCard } from "@/components/admin/SocialsCard";
import { MailSettingsCard } from "@/components/admin/MailSettingsCard";
import { BackupCard } from "@/components/admin/BackupCard";
import { StorageBar } from "@/components/admin/StorageBar";
import { Tabs } from "@/components/admin/Tabs";
import { getStorageUsage } from "@/lib/storage-usage";

export default async function SettingsOverview() {
  const admin = await requireAdmin();
  const settings = await prisma.siteSettings.findUnique({ where: { ownerId: admin.id } });
  const usage = await getStorageUsage(admin.id);

  const identity = {
    ownerName: settings?.ownerName ?? "",
    addressStreet: settings?.addressStreet ?? "",
    addressZip: settings?.addressZip ?? "",
    addressCity: settings?.addressCity ?? "",
    addressCountry: settings?.addressCountry ?? "",
    phone: settings?.phone ?? "",
    vatId: settings?.vatId ?? "",
    contactEmail: settings?.contactEmail ?? "",
  };

  const branding = {
    ownerName: settings?.ownerName ?? "",
    logoType: (settings?.logoType === "IMAGE" ? "IMAGE" : "TEXT") as "TEXT" | "IMAGE",
    logoImageKey: settings?.logoImageKey ?? null,
    nameDisplayStyle: settings?.nameDisplayStyle ?? "FULL",
  };

  const mailInitial = {
    contactRecipient: settings?.contactRecipient ?? "",
    smtpHost: settings?.smtpHost ?? "",
    smtpPort: settings?.smtpPort ?? 587,
    smtpSecure: settings?.smtpSecure ?? false,
    smtpUser: settings?.smtpUser ?? "",
    mailFrom: settings?.mailFrom ?? "",
    mailFromName: settings?.mailFromName ?? "",
    hasPassword: Boolean(settings?.smtpPassEnc),
  };

  const seoInitial = {
    seoTitle: settings?.seoTitle ?? "",
    seoDescription: settings?.seoDescription ?? "",
    seoIndexable: settings?.seoIndexable ?? true,
    faviconKey: settings?.faviconKey ?? null,
    ogImageKey: settings?.ogImageKey ?? null,
  };

  // Titel, der ohne eigene SEO-Angabe greift — dieselbe Ableitung wie in
  // `getStartPageData`, damit die Vorschau zeigt, was wirklich im Tab steht.
  const siteTitle =
    settings?.startTitle?.trim() ||
    formatDisplayName(settings?.ownerName, settings?.nameDisplayStyle ?? "FULL") ||
    "STUDIO";

  const speicherSection = (
    <section className="card p-5">
      <h2 className="font-medium">Speicherplatz</h2>
      <p className="mt-1 text-sm text-muted">
        Belegter Speicher für alle Bild- und Videodateien. Das Limit wird
        betreiberseitig festgelegt (Umgebungsvariable{" "}
        <code className="text-xs">STORAGE_LIMIT_GB</code>) und ist hier nicht
        änderbar. Ist es erreicht, werden weitere Uploads abgewiesen.
      </p>
      <div className="mt-4">
        <StorageBar usedBytes={usage.usedBytes} limitBytes={usage.limitBytes} />
      </div>
    </section>
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Einstellungen</h1>
        <p className="mt-1.5 text-muted">
          Globale Angaben zu Person, Marke, Auffindbarkeit und Versand. Theme &amp; Freigabe findest
          du unter{" "}
          <a href="/admin/pages" className="underline hover:text-ink">
            Seiten
          </a>
          .
        </p>
      </div>

      <Tabs
        ariaLabel="Einstellungs-Bereiche"
        tabs={[
          {
            id: "identitaet",
            label: "Identität",
            content: <IdentityCard initial={identity} />,
          },
          {
            id: "marke",
            label: "Marke",
            content: (
              <div className="space-y-6">
                <BrandingCard initial={branding} />
                <SocialsCard initial={parseSocials(settings?.socials)} />
              </div>
            ),
          },
          {
            id: "auffindbarkeit",
            label: "Auffindbarkeit",
            content: (
              <SeoCard
                initial={seoInitial}
                fallbackTitle={siteTitle}
                portfolioEnabled={settings?.portfolioEnabled ?? false}
                baseUrl={process.env.NEXT_PUBLIC_APP_URL ?? null}
              />
            ),
          },
          {
            id: "email",
            label: "E-Mail",
            content: <MailSettingsCard initial={mailInitial} />,
          },
          {
            id: "system",
            label: "System",
            content: (
              <div className="space-y-6">
                {speicherSection}
                <BackupCard />
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}
