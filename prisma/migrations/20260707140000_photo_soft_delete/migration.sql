-- AlterTable
ALTER TABLE "Photo" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Photo_albumId_deletedAt_idx" ON "Photo"("albumId", "deletedAt");
