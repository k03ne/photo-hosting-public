-- Platzhalter-Bilder (Unsplash) markieren, damit sie sich sammelweise
-- ausblenden und löschen lassen.
ALTER TABLE "Photo" ADD COLUMN "demoSource" TEXT;
ALTER TABLE "Photo" ADD COLUMN "demoCredit" TEXT;

CREATE INDEX "Photo_demoSource_idx" ON "Photo"("demoSource");
