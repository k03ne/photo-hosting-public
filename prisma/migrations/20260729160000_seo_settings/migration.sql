-- Auffindbarkeit: Titel/Beschreibung für Tab, Suchergebnis und Link-Vorschau,
-- eigenes Favicon + Vorschaubild sowie der Schalter „von Suchmaschinen
-- ausschließen" (noindex + robots.txt).
ALTER TABLE "SiteSettings" ADD COLUMN "seoTitle" TEXT;
ALTER TABLE "SiteSettings" ADD COLUMN "seoDescription" TEXT;
ALTER TABLE "SiteSettings" ADD COLUMN "seoIndexable" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "SiteSettings" ADD COLUMN "faviconKey" TEXT;
ALTER TABLE "SiteSettings" ADD COLUMN "ogImageKey" TEXT;
