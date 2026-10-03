import { z } from "zod";

/**
 * Kuratierte Einträge des Startseiten-Film-Strips. Ein Eintrag ist entweder ein
 * ganzes Album (Cover-Kachel → Bild-Grid) oder ein Einzelfoto. Reihenfolge im
 * Array = Reihenfolge im Strip. Einzige Quelle der Wahrheit für Persistenz
 * (Server-Action validiert damit) und Typen (per z.infer).
 */
export const startItemSchema = z.discriminatedUnion("t", [
  z.object({ t: z.literal("album"), id: z.string().min(1) }),
  z.object({ t: z.literal("photo"), k: z.string().min(1) }),
]);

export const startItemsSchema = z.array(startItemSchema).max(300);

export type StartItem = z.infer<typeof startItemSchema>;

/** Sichere Grenze DB(Json/unknown) → StartItem[]. Ungültiges → leeres Array. */
export function parseStartItems(json: unknown): StartItem[] {
  const res = startItemsSchema.safeParse(json);
  return res.success ? res.data : [];
}
