-- OmniGrid: Auftritt der Marke (Logo/Wortmarke) konfigurierbar.
-- "swap"  = Name mittig, weicht bei Bewegung dem Logo oben links.
-- "fixed" = Logo dauerhaft oben links, Mitte frei für eigenen Text.
ALTER TABLE "SiteSettings" ADD COLUMN "omniBrandMode" TEXT NOT NULL DEFAULT 'swap';
-- Freie Headline der Mitte (nur im Modus "fixed" genutzt).
ALTER TABLE "SiteSettings" ADD COLUMN "omniHeadline" TEXT;
