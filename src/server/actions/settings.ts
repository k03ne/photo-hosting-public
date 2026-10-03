"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/server/current-admin";
import { DEFAULT_THEME } from "@/themes/registry";
import { NAME_DISPLAY_STYLES, normalizeSocialInput, SOCIAL_PLATFORMS } from "@/lib/branding";

export type SettingsFormState = { ok?: boolean; error?: string };

/** Schreibt Teil-Updates in die (genau eine) SiteSettings-Zeile des Admins. */
async function upsertSettings(adminId: string, data: Record<string, unknown>) {
  await prisma.siteSettings.upsert({
    where: { ownerId: adminId },
    update: data,
    create: { ownerId: adminId, activeTheme: DEFAULT_THEME, ...data },
  });
  revalidatePath("/admin/settings");
  revalidatePath("/", "layout"); // Impressum/Copyright/Footer neu rendern
}

// ---------------------------------------------------------------------------
// Identität (Impressum / Datenschutz / Copyright)
// ---------------------------------------------------------------------------

const identitySchema = z.object({
  ownerName: z.string().trim().max(160),
  addressStreet: z.string().trim().max(200),
  addressZip: z.string().trim().max(20),
  addressCity: z.string().trim().max(120),
  addressCountry: z.string().trim().max(120),
  phone: z.string().trim().max(60),
  vatId: z.string().trim().max(60),
  contactEmail: z.string().trim().max(200),
});

export async function saveIdentity(
  _prev: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const admin = await requireAdmin();
  const parsed = identitySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe." };
  }
  const d = parsed.data;
  if (d.contactEmail && !z.string().email().safeParse(d.contactEmail).success) {
    return { error: "Kontakt-E-Mail ist keine gültige Adresse." };
  }

  await upsertSettings(admin.id, {
    ownerName: d.ownerName || null,
    addressStreet: d.addressStreet || null,
    addressZip: d.addressZip || null,
    addressCity: d.addressCity || null,
    addressCountry: d.addressCountry || null,
    phone: d.phone || null,
    vatId: d.vatId || null,
    contactEmail: d.contactEmail || null,
  });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Branding: Namensdarstellung (Logo-Bild-Upload läuft über die Route)
// ---------------------------------------------------------------------------

const brandingSchema = z.object({
  logoType: z.enum(["TEXT", "IMAGE"]),
  nameDisplayStyle: z.enum(NAME_DISPLAY_STYLES),
});

export async function saveBranding(
  _prev: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const admin = await requireAdmin();
  const parsed = brandingSchema.safeParse({
    logoType: formData.get("logoType"),
    nameDisplayStyle: formData.get("nameDisplayStyle"),
  });
  if (!parsed.success) return { error: "Ungültige Auswahl." };

  await upsertSettings(admin.id, {
    logoType: parsed.data.logoType,
    nameDisplayStyle: parsed.data.nameDisplayStyle,
  });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Social-Links
// ---------------------------------------------------------------------------

const handleOrEmpty = z.string().trim().max(300);

/**
 * Gespeichert wird das Handle, nicht die Adresse — die baut `socialUrl()` beim
 * Anzeigen. Eine eingetippte Voll-URL der eigenen Plattform wird dabei auf das
 * Handle zurückgeschnitten (`normalizeSocialInput`), fremde Adressen bleiben
 * unverändert stehen. Deshalb gibt es hier keine „bitte mit https://"-Prüfung
 * mehr; sie hätte genau das verboten, was jetzt der Normalfall ist.
 */
export async function saveSocials(
  _prev: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const admin = await requireAdmin();

  const socials: Record<string, string> = {};
  for (const { key, label, host } of SOCIAL_PLATFORMS) {
    const parsed = handleOrEmpty.safeParse(formData.get(key) ?? "");
    if (!parsed.success) return { error: `Ungültiger Wert bei ${label}.` };
    const value = normalizeSocialInput(key, parsed.data);
    if (!value) continue;
    // Ohne Handle-Schema (Website) bleibt die vollständige Adresse Pflicht.
    if (!host && !/^https?:\/\//i.test(value)) {
      return { error: `Bitte vollständige Adresse (mit https://) bei ${label}.` };
    }
    socials[key] = value;
  }

  await upsertSettings(admin.id, { socials });
  return { ok: true };
}
