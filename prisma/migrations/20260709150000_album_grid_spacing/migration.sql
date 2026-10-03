-- Bild-Abstand der Galerie pro Album (REGULAR | LARGE).
ALTER TABLE "Album" ADD COLUMN "gridSpacing" TEXT NOT NULL DEFAULT 'REGULAR';
