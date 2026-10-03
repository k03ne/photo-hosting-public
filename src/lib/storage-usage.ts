import "server-only";

import { prisma } from "@/lib/prisma";

export { formatBytes } from "@/lib/format-bytes";

const BYTES_PER_GB = 1024 ** 3;

export type StorageUsage = {
  /** Belegter Speicher in Bytes (Anzeige- + Original- + RAW-Dateien). */
  usedBytes: number;
  /** Konfiguriertes Limit in GiB, oder null für „kein Limit". */
  limitGb: number | null;
  /** Limit in Bytes, oder null. */
  limitBytes: number | null;
  /** Belegungsgrad 0..1 (bezogen auf das Limit); null ohne Limit. */
  ratio: number | null;
};

/**
 * Ermittelt den vom Admin belegten Bildspeicher. Belegung = Summe aus
 * Anzeige-WebP (`sizeBytes`), herunterladbarem Original (`originalSizeBytes`)
 * und optionaler RAW-Datei (`rawSizeBytes`) über ALLE Fotos seiner Alben —
 * inklusive der noch nicht endgültig gelöschten (Papierkorb), da deren Dateien
 * bis zum Purge weiter auf dem Speicher liegen.
 */
export async function getStorageUsage(adminId: string): Promise<StorageUsage> {
  const agg = await prisma.photo.aggregate({
    where: { album: { ownerId: adminId } },
    _sum: { sizeBytes: true, originalSizeBytes: true, rawSizeBytes: true },
  });

  const usedBytes =
    (agg._sum.sizeBytes ?? 0) +
    (agg._sum.originalSizeBytes ?? 0) +
    (agg._sum.rawSizeBytes ?? 0);

  const limitGb = getStorageLimitGb();
  const limitBytes = limitGb != null ? limitGb * BYTES_PER_GB : null;
  const ratio = limitBytes && limitBytes > 0 ? usedBytes / limitBytes : null;

  return { usedBytes, limitGb, limitBytes, ratio };
}

/**
 * Speicher-Limit in GiB — betreiberseitig über die Umgebungsvariable
 * `STORAGE_LIMIT_GB` gesetzt (im Deploy/`.env`), bewusst NICHT im Backend
 * editierbar. Fehlt/0/ungültig = kein Limit.
 */
function getStorageLimitGb(): number | null {
  const raw = process.env.STORAGE_LIMIT_GB;
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}
