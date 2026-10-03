-- Kuratierter Startseiten-Inhalt (Auswahl der Bilder/Alben), Filter- & Menü-Schalter.
ALTER TABLE "SiteSettings" ADD COLUMN "startItems" JSONB;
ALTER TABLE "SiteSettings" ADD COLUMN "startShowFilter" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "SiteSettings" ADD COLUMN "startMenuEnabled" BOOLEAN NOT NULL DEFAULT true;
