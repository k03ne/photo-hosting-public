-- Fokuspunkt pro Bild (object-position in %) für die Cover-Darstellung.
ALTER TABLE "Photo" ADD COLUMN "focusX" INTEGER NOT NULL DEFAULT 50;
ALTER TABLE "Photo" ADD COLUMN "focusY" INTEGER NOT NULL DEFAULT 50;
