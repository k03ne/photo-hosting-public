-- Identität (Impressum/Datenschutz/Copyright), Branding (Logo/Namensdarstellung),
-- Social-Links und globales Kontaktformular-Ziel für die SiteSettings.

-- Identität
ALTER TABLE "SiteSettings" ADD COLUMN "ownerName" TEXT;
ALTER TABLE "SiteSettings" ADD COLUMN "addressStreet" TEXT;
ALTER TABLE "SiteSettings" ADD COLUMN "addressZip" TEXT;
ALTER TABLE "SiteSettings" ADD COLUMN "addressCity" TEXT;
ALTER TABLE "SiteSettings" ADD COLUMN "addressCountry" TEXT;
ALTER TABLE "SiteSettings" ADD COLUMN "phone" TEXT;
ALTER TABLE "SiteSettings" ADD COLUMN "vatId" TEXT;
ALTER TABLE "SiteSettings" ADD COLUMN "contactEmail" TEXT;

-- Branding
ALTER TABLE "SiteSettings" ADD COLUMN "logoType" TEXT NOT NULL DEFAULT 'TEXT';
ALTER TABLE "SiteSettings" ADD COLUMN "logoImageKey" TEXT;
ALTER TABLE "SiteSettings" ADD COLUMN "nameDisplayStyle" TEXT NOT NULL DEFAULT 'FULL';

-- Social-Links (JSON: Plattform -> URL)
ALTER TABLE "SiteSettings" ADD COLUMN "socials" JSONB;

-- Kontaktformular-Ziel (ersetzt Empfänger-pro-Block)
ALTER TABLE "SiteSettings" ADD COLUMN "contactRecipient" TEXT;
