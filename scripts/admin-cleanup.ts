/**
 * Wartungsskript für Admin-Konten (Single-Photographer-App).
 *
 * Standard: NUR anzeigen — alle Admins mit Anzahl Alben/Seiten und ob sie eine
 * SiteSettings-Zeile haben. So lässt sich ein versehentlich angelegtes Geister-
 * Konto (z.B. Default-Seed `admin@example.com`) erkennen.
 *
 * Löschen: `--delete <email>` entfernt das Konto NUR, wenn es keine Alben und
 * keine Seiten besitzt (Sicherheitsnetz gegen Datenverlust).
 *
 * Ausführen (gegen die PRODUKTIONS-DB — DATABASE_URL entsprechend setzen):
 *   npx tsx scripts/admin-cleanup.ts
 *   npx tsx scripts/admin-cleanup.ts --delete admin@example.com
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const admins = await prisma.admin.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      email: true,
      createdAt: true,
      _count: { select: { albums: true, pages: true } },
      settings: { select: { portfolioEnabled: true } },
    },
  });

  console.log(`\nGefundene Admin-Konten: ${admins.length}\n`);
  for (const a of admins) {
    console.log(
      `• ${a.email}\n    id=${a.id}\n    angelegt=${a.createdAt.toISOString()}\n` +
        `    Alben=${a._count.albums}  Seiten=${a._count.pages}  ` +
        `Website öffentlich=${a.settings?.portfolioEnabled ?? "—"}`,
    );
  }
  console.log("");

  const deleteFlagIndex = process.argv.indexOf("--delete");
  if (deleteFlagIndex === -1) {
    console.log(
      "Nur Anzeige. Zum Entfernen eines leeren Geister-Kontos:\n" +
        "  npx tsx scripts/admin-cleanup.ts --delete <email>\n",
    );
    return;
  }

  const email = process.argv[deleteFlagIndex + 1];
  if (!email) throw new Error("Bitte eine E-Mail nach --delete angeben.");

  const target = admins.find((a) => a.email === email);
  if (!target) {
    console.log(`Kein Konto mit E-Mail "${email}" gefunden — nichts zu tun.`);
    return;
  }
  if (target._count.albums > 0 || target._count.pages > 0) {
    console.log(
      `ABBRUCH: "${email}" besitzt ${target._count.albums} Alben und ` +
        `${target._count.pages} Seiten — wird NICHT gelöscht.`,
    );
    return;
  }

  // Cascade in schema.prisma entfernt zugehörige SiteSettings automatisch.
  await prisma.admin.delete({ where: { id: target.id } });
  console.log(`✓ Konto "${email}" (leer) wurde gelöscht.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
