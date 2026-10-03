"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/server/current-admin";
import { getSiteOwnerId } from "@/lib/portfolio";
import { encryptSecret } from "@/lib/secret-box";
import { sendMail, mailConfigured } from "@/lib/mailer";
import { clientIpHash } from "@/lib/security";

// Die mail-relevanten SiteSettings-Felder (inkl. verschlüsseltem Passwort).
const MAIL_SELECT = {
  smtpHost: true,
  smtpPort: true,
  smtpSecure: true,
  smtpUser: true,
  smtpPassEnc: true,
  mailFrom: true,
  mailFromName: true,
} as const;

// ---------------------------------------------------------------------------
// Admin: SMTP-Einstellungen speichern
// ---------------------------------------------------------------------------

export type MailFormState = { ok?: boolean; error?: string };

const settingsSchema = z.object({
  contactRecipient: z.string().trim().max(255), // Zieladresse (dein Postfach)
  smtpHost: z.string().trim().max(255),
  smtpPort: z.coerce.number().int().min(1).max(65535),
  smtpSecure: z.boolean(),
  smtpUser: z.string().trim().max(255),
  smtpPass: z.string().max(500), // Klartext aus dem Formular; leer = unverändert
  mailFrom: z.string().trim().max(255),
  mailFromName: z.string().trim().max(120),
});

export async function saveMailSettings(
  _prev: MailFormState,
  formData: FormData,
): Promise<MailFormState> {
  const admin = await requireAdmin();

  const parsed = settingsSchema.safeParse({
    contactRecipient: formData.get("contactRecipient") ?? "",
    smtpHost: formData.get("smtpHost") ?? "",
    smtpPort: formData.get("smtpPort") ?? 587,
    smtpSecure: formData.get("smtpSecure") === "on",
    smtpUser: formData.get("smtpUser") ?? "",
    smtpPass: formData.get("smtpPass") ?? "",
    mailFrom: formData.get("mailFrom") ?? "",
    mailFromName: formData.get("mailFromName") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe." };
  }
  const d = parsed.data;
  // Absender automatisch = Benutzer, wenn nicht separat angegeben (viele Relays
  // verlangen From = angemeldeter Account).
  const effectiveFrom = d.mailFrom || d.smtpUser;
  if (effectiveFrom && !z.string().email().safeParse(effectiveFrom).success) {
    return { error: "Absenderadresse ist keine gültige E-Mail." };
  }
  if (d.contactRecipient && !z.string().email().safeParse(d.contactRecipient).success) {
    return { error: "Zieladresse ist keine gültige E-Mail." };
  }

  const base = {
    contactRecipient: d.contactRecipient || null,
    smtpHost: d.smtpHost || null,
    smtpPort: d.smtpPort,
    smtpSecure: d.smtpSecure,
    smtpUser: d.smtpUser || null,
    mailFrom: effectiveFrom || null,
    mailFromName: d.mailFromName || null,
  };
  // Passwort nur überschreiben, wenn ausgefüllt (leer = unverändert lassen).
  const passUpdate = d.smtpPass ? { smtpPassEnc: encryptSecret(d.smtpPass) } : {};

  await prisma.siteSettings.upsert({
    where: { ownerId: admin.id },
    update: { ...base, ...passUpdate },
    create: { ownerId: admin.id, ...base, ...passUpdate },
  });

  revalidatePath("/admin/settings");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Admin: Testmail
// ---------------------------------------------------------------------------

export async function sendTestMail(to: string): Promise<{ ok: boolean; message: string }> {
  const admin = await requireAdmin();
  const s = await prisma.siteSettings.findUnique({
    where: { ownerId: admin.id },
    select: MAIL_SELECT,
  });
  if (!mailConfigured(s)) return { ok: false, message: "Bitte zuerst die SMTP-Daten speichern." };

  const target = (to || s?.mailFrom || "").trim();
  if (!z.string().email().safeParse(target).success) {
    return { ok: false, message: "Ungültige Empfängeradresse." };
  }
  try {
    await sendMail(s, {
      to: target,
      subject: "Testmail — Portfolio",
      text: "Dies ist eine Testmail deiner Portfolio-Website. Der Versand funktioniert. ✅",
    });
    return { ok: true, message: `Testmail an ${target} gesendet.` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Versand fehlgeschlagen." };
  }
}

// ---------------------------------------------------------------------------
// Public: Kontaktformular absenden
// ---------------------------------------------------------------------------

const contactSchema = z.object({
  name: z.string().trim().max(200).optional(),
  email: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(60).optional(),
  message: z.string().trim().max(5000).optional(),
});

// Best-effort In-Memory-Drosselung (Single-Server; reicht gegen einfaches Spam).
const hits = new Map<string, number[]>();
function throttled(ipHash: string): boolean {
  const now = Date.now();
  const arr = (hits.get(ipHash) ?? []).filter((t) => now - t < 10 * 60 * 1000);
  arr.push(now);
  hits.set(ipHash, arr);
  return arr.length > 5;
}

export async function submitContactForm(
  _prev: { ok?: boolean; error?: string },
  formData: FormData,
): Promise<{ ok?: boolean; error?: string }> {
  // Honeypot: Bots füllen versteckte Felder → stillschweigend „ok".
  if (String(formData.get("company") ?? "").trim() !== "") return { ok: true };

  const parsed = contactSchema.safeParse({
    name: formData.get("name") ?? undefined,
    email: formData.get("email") ?? undefined,
    phone: formData.get("phone") ?? undefined,
    message: formData.get("message") ?? undefined,
  });
  if (!parsed.success) return { error: "Bitte Eingaben prüfen." };
  const d = parsed.data;
  if (!d.message && !d.email && !d.name) {
    return { error: "Bitte gib eine Nachricht ein." };
  }

  if (throttled(await clientIpHash())) {
    return { error: "Zu viele Anfragen. Bitte versuche es später erneut." };
  }

  const ownerId = await getSiteOwnerId();
  if (!ownerId) return { error: "Versand momentan nicht möglich." };

  // Empfänger ist NICHT vom Client wählbar (kein offener Mailer): fest die
  // global konfigurierte Zieladresse (Fallback: Absenderadresse).
  const s = await prisma.siteSettings.findUnique({
    where: { ownerId },
    select: { ...MAIL_SELECT, contactRecipient: true, portfolioEnabled: true },
  });

  // Server Actions bleiben aufrufbar, auch wenn die Seite gar nicht mehr
  // ausgeliefert wird: Ohne diese Prüfung kämen weiter Mails an, nachdem die
  // Website abgeschaltet oder die Kontaktseite deaktiviert wurde.
  if (!s?.portfolioEnabled) return { error: "Versand momentan nicht möglich." };
  const contactPage = await prisma.page.findFirst({
    where: { ownerId, kind: "CONTACT", isPublished: true, isEnabled: true },
    select: { id: true },
  });
  if (!contactPage) return { error: "Versand momentan nicht möglich." };

  if (!mailConfigured(s)) return { error: "Der Kontaktversand ist noch nicht eingerichtet." };
  const recipient = s?.contactRecipient || s?.mailFrom;
  if (!recipient) return { error: "Der Kontaktversand ist noch nicht eingerichtet." };

  const senderIsEmail = d.email ? z.string().email().safeParse(d.email).success : false;
  const body = [
    d.name && `Name: ${d.name}`,
    d.email && `E-Mail: ${d.email}`,
    d.phone && `Telefon: ${d.phone}`,
    "",
    d.message ?? "",
  ]
    .filter((x): x is string => Boolean(x) || x === "")
    .join("\n");

  try {
    await sendMail(s, {
      to: recipient,
      subject: `Neue Kontaktanfrage${d.name ? ` von ${d.name}` : ""}`,
      text: body,
      replyTo: senderIsEmail ? d.email : undefined,
    });
    return { ok: true };
  } catch {
    return { error: "Nachricht konnte nicht gesendet werden." };
  }
}
