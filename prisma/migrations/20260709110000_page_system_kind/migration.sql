-- System-Seiten: feste Seitenarten (Startseite, Impressum, Datenschutz, Kontakt)
-- vs. frei angelegte Seiten, plus Sichtbarkeitsschalter (z.B. Kontakt aus).
ALTER TABLE "Page" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'CUSTOM';
ALTER TABLE "Page" ADD COLUMN "isEnabled" BOOLEAN NOT NULL DEFAULT true;

-- Bestehende Startseite (isHome) rückwirkend als System-Seite markieren.
UPDATE "Page" SET "kind" = 'HOME' WHERE "isHome" = true;
