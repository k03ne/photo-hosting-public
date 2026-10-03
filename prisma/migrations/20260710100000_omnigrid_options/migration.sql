-- OmniGrid-spezifische Startseiten-Optionen (nur wirksam bei startTheme = 'omnigrid').
ALTER TABLE "SiteSettings" ADD COLUMN "omniAutoSpeed" DOUBLE PRECISION NOT NULL DEFAULT 0.08;
ALTER TABLE "SiteSettings" ADD COLUMN "omniShowGridLines" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "SiteSettings" ADD COLUMN "omniSubtitle" TEXT;
