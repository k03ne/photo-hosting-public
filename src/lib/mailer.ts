import "server-only";

import nodemailer from "nodemailer";

import { decryptSecret } from "@/lib/secret-box";

/** Nur die mail-relevanten Felder der SiteSettings (Rest ist irrelevant). */
export type MailSettingsInput = {
  smtpHost: string | null;
  smtpPort: number | null;
  smtpSecure: boolean;
  smtpUser: string | null;
  smtpPassEnc: string | null;
  mailFrom: string | null;
  mailFromName: string | null;
} | null;

type MailConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string | null;
  pass: string | null;
  from: string;
  fromName: string | null;
};

/**
 * Effektive Mail-Konfiguration: **DB zuerst** (im Backend gepflegt). Nur wenn
 * dort kein Host/Absender hinterlegt ist, greift ein optionaler env-Fallback
 * (`SMTP_*`, `MAIL_FROM`). Gibt `null`, wenn nichts konfiguriert ist.
 */
export function resolveMailConfig(s: MailSettingsInput): MailConfig | null {
  if (s?.smtpHost && s.mailFrom) {
    return {
      host: s.smtpHost,
      port: s.smtpPort ?? 587,
      secure: s.smtpSecure,
      user: s.smtpUser ?? null,
      pass: s.smtpPassEnc ? decryptSecret(s.smtpPassEnc) : null,
      from: s.mailFrom,
      fromName: s.mailFromName ?? null,
    };
  }

  const host = process.env.SMTP_HOST;
  const from = process.env.MAIL_FROM;
  if (host && from) {
    return {
      host,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === "true",
      user: process.env.SMTP_USER ?? null,
      pass: process.env.SMTP_PASS ?? null,
      from,
      fromName: process.env.MAIL_FROM_NAME ?? null,
    };
  }
  return null;
}

export function mailConfigured(s: MailSettingsInput): boolean {
  return resolveMailConfig(s) !== null;
}

/** Versendet eine Mail über den aus den Settings gebauten SMTP-Transport. */
export async function sendMail(
  s: MailSettingsInput,
  msg: { to: string; subject: string; text: string; html?: string; replyTo?: string },
): Promise<void> {
  const cfg = resolveMailConfig(s);
  if (!cfg) throw new Error("Mailversand ist nicht konfiguriert.");

  const transport = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: cfg.user ? { user: cfg.user, pass: cfg.pass ?? "" } : undefined,
  });

  const from = cfg.fromName ? `"${cfg.fromName}" <${cfg.from}>` : cfg.from;
  await transport.sendMail({
    from,
    to: msg.to,
    subject: msg.subject,
    text: msg.text,
    html: msg.html,
    replyTo: msg.replyTo,
  });
}
