-- Grundeinstellung Schrift + Startseiten-Inhalt (eigener Editor, kein Block-Builder).
ALTER TABLE "SiteSettings" ADD COLUMN "siteFont" TEXT NOT NULL DEFAULT 'editorial';
ALTER TABLE "SiteSettings" ADD COLUMN "startTitle" TEXT;
ALTER TABLE "SiteSettings" ADD COLUMN "startSource" TEXT NOT NULL DEFAULT 'albums';
