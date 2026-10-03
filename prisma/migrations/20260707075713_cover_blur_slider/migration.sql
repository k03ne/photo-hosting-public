-- Cover-Blur von Boolean auf px-Radius (0 = aus) umstellen.
-- Bestehende „an"-Cover erhalten einen Standard-Radius von 20px.
ALTER TABLE "Album" ADD COLUMN "coverBlurPx" INTEGER NOT NULL DEFAULT 0;
UPDATE "Album" SET "coverBlurPx" = 20 WHERE "coverBlur" = true;
ALTER TABLE "Album" DROP COLUMN "coverBlur";
