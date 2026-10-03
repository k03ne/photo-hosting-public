-- AlterTable
ALTER TABLE "Album" ADD COLUMN     "showExif" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Photo" ADD COLUMN     "exif" JSONB;
