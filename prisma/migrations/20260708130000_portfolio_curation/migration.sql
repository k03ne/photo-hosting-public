-- Portfolio-Kuratierung: Admin-Favoriten je Foto + optionale Album-Kategorie.
ALTER TABLE "Photo" ADD COLUMN "isFavorite" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Album" ADD COLUMN "category" TEXT;

-- CreateIndex
CREATE INDEX "Photo_albumId_isFavorite_idx" ON "Photo"("albumId", "isFavorite");
