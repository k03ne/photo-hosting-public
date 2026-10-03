-- OmniGrid: Bildgröße (Zellgröße) und Abstand (Zwischenraum-Anteil) konfigurierbar.
ALTER TABLE "SiteSettings" ADD COLUMN "omniGap" DOUBLE PRECISION NOT NULL DEFAULT 0.16;
ALTER TABLE "SiteSettings" ADD COLUMN "omniCellSize" DOUBLE PRECISION NOT NULL DEFAULT 3.4;
