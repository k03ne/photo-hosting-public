-- Portfolio-Kategorie pro Bild (Mischalben): überschreibt Album.category fürs
-- Portfolio. Getrennt von Photo.category (= Galerie-Gruppe der Kundengalerie).
ALTER TABLE "Photo" ADD COLUMN "portfolioCategory" TEXT;
