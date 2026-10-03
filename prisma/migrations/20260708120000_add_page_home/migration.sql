-- Startseiten-Kennzeichen: markiert die Seite, die unter der Root-Domain `/`
-- ausgeliefert wird.
ALTER TABLE "Page" ADD COLUMN "isHome" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Page_ownerId_isHome_idx" ON "Page"("ownerId", "isHome");

-- Integrität: höchstens EINE Startseite je Owner. Partial-Unique-Index (nur
-- DB-seitig; nicht im Prisma-Schema modellierbar).
CREATE UNIQUE INDEX "Page_owner_single_home" ON "Page"("ownerId") WHERE "isHome" = true;
