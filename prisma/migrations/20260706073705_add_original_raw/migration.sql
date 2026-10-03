-- AlterTable
ALTER TABLE "Photo" ADD COLUMN     "originalKey" TEXT,
ADD COLUMN     "originalMime" TEXT,
ADD COLUMN     "originalSizeBytes" INTEGER,
ADD COLUMN     "rawKey" TEXT,
ADD COLUMN     "rawName" TEXT,
ADD COLUMN     "rawSizeBytes" INTEGER;
