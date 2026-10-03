-- Neues Theme-Setup: die alten Themes (minimal/editorial/studio/masonry) wurden
-- entfernt. Standard + bestehende Verweise auf „immersive" umstellen.
ALTER TABLE "SiteSettings" ALTER COLUMN "activeTheme" SET DEFAULT 'immersive';
UPDATE "SiteSettings"
  SET "activeTheme" = 'immersive'
  WHERE "activeTheme" IN ('minimal', 'editorial', 'studio', 'masonry');
