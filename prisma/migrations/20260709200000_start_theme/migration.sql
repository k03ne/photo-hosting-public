-- Startseiten-Theme (FilmStrip "reel" | OmniGrid "omnigrid"); Default = bisheriges Verhalten.
ALTER TABLE "SiteSettings" ADD COLUMN "startTheme" TEXT NOT NULL DEFAULT 'reel';
