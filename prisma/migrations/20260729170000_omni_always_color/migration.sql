-- Bilder im OmniGrid dauerhaft farbig zeigen (statt erst beim Hover).
ALTER TABLE "SiteSettings" ADD COLUMN "omniAlwaysColor" BOOLEAN NOT NULL DEFAULT false;
