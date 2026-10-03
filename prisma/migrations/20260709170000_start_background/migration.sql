-- Startseiten-Hintergrund des fixen WebGL-FilmStrip-Themes: Modus + Farbe.
ALTER TABLE "SiteSettings" ADD COLUMN "startBgMode" TEXT NOT NULL DEFAULT 'dark';
ALTER TABLE "SiteSettings" ADD COLUMN "startBgColor" TEXT NOT NULL DEFAULT '#0b0b0d';
