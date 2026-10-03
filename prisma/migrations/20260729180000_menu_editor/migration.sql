-- Frei editierbares Menü: kuratierte Einträge (Seiten + externe Links) sowie
-- Platzierung und Auswahl der Social-Links.
ALTER TABLE "SiteSettings" ADD COLUMN "menuItems" JSONB;
ALTER TABLE "SiteSettings" ADD COLUMN "menuSocialsMode" TEXT NOT NULL DEFAULT 'corner';
ALTER TABLE "SiteSettings" ADD COLUMN "menuSocialKeys" JSONB;
