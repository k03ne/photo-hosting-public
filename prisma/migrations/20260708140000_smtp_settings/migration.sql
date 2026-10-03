-- SMTP-Zugang für den Kontaktformular-Versand (im Backend pflegbar).
ALTER TABLE "SiteSettings" ADD COLUMN "smtpHost" TEXT;
ALTER TABLE "SiteSettings" ADD COLUMN "smtpPort" INTEGER;
ALTER TABLE "SiteSettings" ADD COLUMN "smtpSecure" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SiteSettings" ADD COLUMN "smtpUser" TEXT;
ALTER TABLE "SiteSettings" ADD COLUMN "smtpPassEnc" TEXT;
ALTER TABLE "SiteSettings" ADD COLUMN "mailFrom" TEXT;
ALTER TABLE "SiteSettings" ADD COLUMN "mailFromName" TEXT;
