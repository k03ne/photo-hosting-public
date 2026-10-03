-- Aufnahme-Metadaten (EXIF) sind ab jetzt Opt-in: neue Alben starten mit
-- ausgeblendeten Metadaten. Bestehende Alben behalten ihren gespeicherten Wert.
ALTER TABLE "Album" ALTER COLUMN "showExif" SET DEFAULT false;
