import { z } from "zod";

/**
 * Kuratierte Menüeinträge. Ein Eintrag verweist entweder auf eine eigene Seite
 * (`page` — Beschriftung und Adresse folgen dann der Seite und bleiben beim
 * Umbenennen richtig) oder ist ein freier Link (`link`, auch nach außen).
 *
 * Reihenfolge im Array = Reihenfolge im Menü. Prisma-frei, damit der Editor im
 * Browser dieselbe Quelle nutzt wie die Server-Action.
 */
export const menuItemSchema = z.discriminatedUnion("t", [
  z.object({ t: z.literal("page"), id: z.string().min(1).max(80) }),
  z.object({
    t: z.literal("link"),
    label: z.string().trim().min(1).max(60),
    href: z.string().trim().min(1).max(400),
    /** In neuem Tab öffnen (bei externen Zielen der Normalfall). */
    blank: z.boolean().optional(),
  }),
]);

export const menuItemsSchema = z.array(menuItemSchema).max(30);

export type MenuItem = z.infer<typeof menuItemSchema>;

/** Sichere Grenze DB(Json/unknown) → MenuItem[]. Ungültiges → leeres Array. */
export function parseMenuItems(json: unknown): MenuItem[] {
  const res = menuItemsSchema.safeParse(json);
  return res.success ? res.data : [];
}

/** Wo die Social-Links auftauchen. */
export const SOCIALS_MODES = ["corner", "menu", "off"] as const;
export type SocialsMode = (typeof SOCIALS_MODES)[number];

export function parseSocialsMode(value: unknown): SocialsMode {
  return value === "menu" || value === "off" ? value : "corner";
}

/** Ausgewählte Social-Kanäle; `null` = alle gepflegten. */
export function parseSocialKeys(json: unknown): string[] | null {
  if (!Array.isArray(json)) return null;
  const keys = json.filter((v): v is string => typeof v === "string" && v.length > 0);
  return keys;
}

/**
 * Zeigt ein Link-Ziel nach außen? Interne Ziele beginnen mit „/" — alles andere
 * (http(s), mailto:, tel:) verlässt die Website.
 */
export function isExternalHref(href: string): boolean {
  return !href.startsWith("/");
}

/**
 * Normalisiert eine Link-Eingabe: „example.com/x" wird zu „https://example.com/x",
 * interne Pfade bleiben unangetastet. Ohne das landet ein Menüeintrag als
 * relativer Pfad auf der eigenen Domain — der klassische tote Link.
 */
export function normalizeHref(raw: string): string {
  const v = raw.trim();
  if (!v) return "";
  if (v.startsWith("/")) return v;
  if (/^(https?:\/\/|mailto:|tel:)/i.test(v)) return v;
  return `https://${v}`;
}
