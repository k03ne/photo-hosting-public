-- Minimaler Video-Support: Medientyp + optionale Dauer. Bei VIDEO liegt unter
-- storageKey.webp das Poster (clientseitig erzeugt), originalKey ist die
-- abspielbare Videodatei.
ALTER TABLE "Photo" ADD COLUMN "mediaType" TEXT NOT NULL DEFAULT 'IMAGE';
ALTER TABLE "Photo" ADD COLUMN "durationMs" INTEGER;
