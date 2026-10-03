import { prisma } from "@/lib/prisma";
import type { Block } from "@/themes/schema";

/**
 * Deterministische Zuordnung der öffentlichen Website zur Root-Domain. Die App
 * ist Single-Photographer (siehe CLAUDE.md).
 *
 * WICHTIG: Nicht einfach „ältester Admin". Der Seed legt bei fehlendem
 * `ADMIN_EMAIL` einen Default-Admin (`admin@example.com`) an; wird die echte
 * E-Mail später gesetzt, entsteht ein ZWEITER Admin. Das älteste Konto ist dann
 * ein leeres Geister-Konto — die öffentliche Seite las dessen leere Einstellungen
 * (Website „nicht öffentlich", keine Startseiten-Bilder). Deshalb wählen wir das
 * Konto MIT den meisten Inhalten (Alben + Seiten) und nehmen erst bei Gleichstand
 * das ältere. So folgt der Owner immer den tatsächlich gepflegten Daten.
 */
export async function getSiteOwnerId(): Promise<string | null> {
  const admins = await prisma.admin.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, _count: { select: { albums: true, pages: true } } },
  });
  if (admins.length === 0) return null;

  let best = admins[0];
  let bestScore = best._count.albums + best._count.pages;
  for (const a of admins) {
    const score = a._count.albums + a._count.pages;
    // > (nicht >=): bei Gleichstand bleibt das ältere Konto (Reihenfolge asc).
    if (score > bestScore) {
      best = a;
      bestScore = score;
    }
  }
  return best.id;
}

/**
 * Löst datengetriebene Blöcke Server-seitig auf, bevor sie gerendert werden — der
 * Block bleibt eine reine Präsentationseinheit, die Datenbeschaffung passiert hier:
 *  - `gallery` mit `albumId` → konkrete Foto-Keys (sichtbar, in Sortierreihenfolge).
 *  - `portfolioGrid` → kuratierte `photoKeys` zu vollen `items` (inkl. effektiver
 *    Portfolio-Kategorie `photo.portfolioCategory ?? album.category`), Reihenfolge erhalten.
 *
 * JEDE Abfrage ist auf `ownerId` eingegrenzt. Die App ist zwar Single-Photographer,
 * aber genau dort entsteht regelmäßig ein zweiter (Geister-)Admin (siehe
 * `getSiteOwnerId`) — ohne Eingrenzung zöge die öffentliche Seite Bilder aus
 * fremden Konten. Ohne Owner (frische Installation) bleibt alles unaufgelöst.
 */
export async function resolvePageBlocks(
  blocks: Block[],
  ownerId: string | null,
): Promise<Block[]> {
  if (!ownerId) return blocks;
  return Promise.all(
    blocks.map(async (block) => {
      if (block.type === "gallery") {
        const { albumId, photoKeys } = block.data;
        if (!albumId || photoKeys.length > 0) return block;
        const photos = await prisma.photo.findMany({
          // Nur Bilder: ein Video würde im Galerie-Block als stummes Standbild
          // ohne Abspielmöglichkeit landen (`start-page-data` filtert ebenso).
          where: { albumId, deletedAt: null, mediaType: "IMAGE", album: { ownerId } },
          orderBy: { sortOrder: "asc" },
          select: { storageKey: true },
        });
        return { ...block, data: { ...block.data, photoKeys: photos.map((p) => p.storageKey) } };
      }

      if (block.type === "heroScatter") {
        const { source, photoKeys, count } = block.data;
        const base = {
          storageKey: true,
          width: true,
          height: true,
          blurDataUrl: true,
        } as const;
        const toItem = (p: {
          storageKey: string;
          width: number;
          height: number;
          blurDataUrl: string | null;
        }) => ({ key: p.storageKey, width: p.width, height: p.height, blurDataUrl: p.blurDataUrl });

        // Manuelle Auswahl: exakt die gewählten Keys, Reihenfolge erhalten.
        if (source === "manual") {
          if (photoKeys.length === 0) return block;
          const photos = await prisma.photo.findMany({
            where: { storageKey: { in: photoKeys }, deletedAt: null, album: { ownerId } },
            select: base,
          });
          const byKey = new Map(photos.map((p) => [p.storageKey, p]));
          const items = photoKeys
            .map((k) => byKey.get(k))
            .filter((p): p is NonNullable<typeof p> => Boolean(p))
            .map(toItem);
          return { ...block, data: { ...block.data, items } };
        }

        // Automatische Quellen: nur für den Seitenbereich freigegebene Fotos
        // (isPublic — steuerbar in der Mediathek unter „Bilder").
        const photos = await prisma.photo.findMany({
          where: { deletedAt: null, isPublic: true, album: { ownerId } },
          select: { ...base, portfolioCategory: true, album: { select: { category: true } } },
          orderBy: { createdAt: "desc" },
        });
        if (photos.length === 0) return block;

        let ordered = photos;
        if (source === "categories") {
          // Nach effektiver Portfolio-Kategorie gruppieren, dann Round-Robin — so
          // mischen sich die Kategorien; bei wenigen Kategorien wiederholen sie
          // sich mit jeweils anderen Bildern.
          const groups = new Map<string, typeof photos>();
          for (const p of photos) {
            const cat = p.portfolioCategory ?? p.album.category ?? "—";
            const arr = groups.get(cat);
            if (arr) arr.push(p);
            else groups.set(cat, [p]);
          }
          const lists = [...groups.values()];
          const max = Math.max(...lists.map((l) => l.length));
          const out: typeof photos = [];
          for (let i = 0; i < max; i++) {
            for (const l of lists) if (i < l.length) out.push(l[i]);
          }
          ordered = out;
        }

        // Auf die gewünschte Anzahl bringen (bei zu wenigen Bildern wiederholen).
        const items = Array.from({ length: count }, (_, i) => toItem(ordered[i % ordered.length]));
        return { ...block, data: { ...block.data, items } };
      }

      if (block.type === "portfolioGrid") {
        const { photoKeys } = block.data;
        if (photoKeys.length === 0) return block;
        const photos = await prisma.photo.findMany({
          where: { storageKey: { in: photoKeys }, deletedAt: null, album: { ownerId } },
          select: {
            storageKey: true,
            caption: true,
            portfolioCategory: true,
            width: true,
            height: true,
            blurDataUrl: true,
            album: { select: { category: true } },
          },
        });
        const byKey = new Map(photos.map((p) => [p.storageKey, p]));
        // Reihenfolge der kuratierten Auswahl erhalten; fehlende (gelöschte) auslassen.
        const items = photoKeys
          .map((key) => byKey.get(key))
          .filter((p): p is NonNullable<typeof p> => Boolean(p))
          .map((p) => ({
            key: p.storageKey,
            category: p.portfolioCategory ?? p.album.category ?? null,
            caption: p.caption,
            width: p.width,
            height: p.height,
            blurDataUrl: p.blurDataUrl,
          }));
        return { ...block, data: { ...block.data, items } };
      }

      return block;
    }),
  );
}
