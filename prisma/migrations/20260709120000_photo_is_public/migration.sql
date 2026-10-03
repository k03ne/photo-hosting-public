-- Freigabe einzelner Fotos für den Seitenbereich (Mediathek → Seiten-Blöcke).
ALTER TABLE "Photo" ADD COLUMN "isPublic" BOOLEAN NOT NULL DEFAULT false;

-- Sinnvolle Vorbelegung: Fotos aus bereits veröffentlichten Alben gelten als
-- öffentlich freigegeben.
UPDATE "Photo" p SET "isPublic" = true
FROM "Album" a
WHERE p."albumId" = a."id" AND a."isPublished" = true AND p."deletedAt" IS NULL;
