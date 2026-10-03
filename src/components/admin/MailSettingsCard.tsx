"use client";

import { useActionState, useState, useTransition } from "react";

import { saveMailSettings, sendTestMail, type MailFormState } from "@/server/actions/mail";

type Initial = {
  contactRecipient: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  mailFrom: string;
  mailFromName: string;
  hasPassword: boolean;
};

/** Provider-Presets: füllen Host/Port/TLS vor. „Eigener Server" lässt alles frei. */
const PRESETS: { label: string; host?: string; port: number; secure: boolean }[] = [
  { label: "Gmail", host: "smtp.gmail.com", port: 465, secure: true },
  { label: "Outlook / 365", host: "smtp.office365.com", port: 587, secure: false },
  { label: "Eigener Server", port: 587, secure: false },
];

/**
 * Kontaktformular-Versand. Oben die Zieladresse (dein Postfach) — dorthin gehen
 * alle Einsendungen. Die SMTP-Zugangsdaten (nötig, um überhaupt versenden zu
 * können) liegen darunter unter „Erweitert", vorbelegbar per Provider-Preset.
 */
export function MailSettingsCard({ initial }: { initial: Initial }) {
  const [state, action, pending] = useActionState<MailFormState, FormData>(saveMailSettings, {});

  // Host/Port/TLS als State, damit Presets sie vorbelegen können.
  const [host, setHost] = useState(initial.smtpHost);
  const [port, setPort] = useState(String(initial.smtpPort || 587));
  const [secure, setSecure] = useState(initial.smtpSecure);

  const [testTo, setTestTo] = useState(initial.contactRecipient || initial.mailFrom);
  const [testing, startTest] = useTransition();
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function applyPreset(p: (typeof PRESETS)[number]) {
    if (p.host) setHost(p.host);
    setPort(String(p.port));
    setSecure(p.secure);
  }

  function runTest() {
    setTestMsg(null);
    startTest(async () => {
      const r = await sendTestMail(testTo);
      setTestMsg({ ok: r.ok, text: r.message });
    });
  }

  return (
    <section className="card p-5">
      <h2 className="font-medium">Kontaktformular-Versand</h2>
      <p className="mt-1 text-sm text-muted">
        Einsendungen des Kontaktformulars gehen an deine Zieladresse. Zum Versenden trägt die
        App sich bei deinem Postausgangsserver (SMTP) ein — wie ein Mailprogramm.
      </p>

      <form action={action} className="mt-4 space-y-4">
        {/* Zieladresse — das Wichtigste. */}
        <label className="block text-sm">
          <span className="mb-1 block text-muted">Zieladresse (dein Postfach)</span>
          <input
            type="email"
            name="contactRecipient"
            defaultValue={initial.contactRecipient}
            placeholder="du@deine-domain.de"
            className="input"
          />
        </label>

        {/* SMTP-Zugang — eingeklappt, offen wenn noch nichts hinterlegt. */}
        <details className="rounded-lg border" open={!initial.smtpHost}>
          <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium">
            Erweitert · Postausgangsserver (SMTP)
          </summary>
          <div className="space-y-3 border-t px-4 py-4">
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => applyPreset(p)}
                  className="chip border px-3 py-1.5 text-sm transition hover:border-ink"
                >
                  {p.label}
                </button>
              ))}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm sm:col-span-2">
                <span className="mb-1 block text-muted">SMTP-Host</span>
                <input
                  name="smtpHost"
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  placeholder="smtp.deine-domain.de"
                  className="input"
                />
              </label>

              <label className="block text-sm">
                <span className="mb-1 block text-muted">Port</span>
                <input
                  type="number"
                  name="smtpPort"
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                  min={1}
                  max={65535}
                  className="input"
                />
              </label>

              <label className="flex items-center gap-2 self-end pb-2 text-sm">
                <input
                  type="checkbox"
                  name="smtpSecure"
                  checked={secure}
                  onChange={(e) => setSecure(e.target.checked)}
                  className="h-4 w-4"
                />
                SSL/TLS (Port 465)
              </label>

              <label className="block text-sm">
                <span className="mb-1 block text-muted">Benutzer</span>
                <input
                  name="smtpUser"
                  defaultValue={initial.smtpUser}
                  autoComplete="off"
                  placeholder="mail@deine-domain.de"
                  className="input"
                />
              </label>

              <label className="block text-sm">
                <span className="mb-1 block text-muted">Passwort</span>
                <input
                  type="password"
                  name="smtpPass"
                  autoComplete="new-password"
                  placeholder={initial.hasPassword ? "•••••••• (gesetzt)" : ""}
                  className="input"
                />
                {initial.hasPassword && (
                  <span className="mt-1 block text-xs text-muted">Leer lassen = unverändert.</span>
                )}
              </label>

              <label className="block text-sm">
                <span className="mb-1 block text-muted">Absender-Adresse (optional)</span>
                <input
                  type="email"
                  name="mailFrom"
                  defaultValue={initial.mailFrom}
                  placeholder="leer = wie Benutzer"
                  className="input"
                />
              </label>

              <label className="block text-sm">
                <span className="mb-1 block text-muted">Absender-Name (optional)</span>
                <input
                  name="mailFromName"
                  defaultValue={initial.mailFromName}
                  placeholder="Dein Studio"
                  className="input"
                />
              </label>
            </div>
          </div>
        </details>

        <div className="flex items-center gap-3">
          <button type="submit" disabled={pending} className="btn-accent disabled:opacity-50">
            {pending ? "Speichert …" : "Speichern"}
          </button>
          {state.ok && <span className="text-sm text-green-600">Gespeichert.</span>}
          {state.error && <span className="text-sm text-red-600">{state.error}</span>}
        </div>
      </form>

      {/* Testmail — getrennt vom Speichern-Formular (kein verschachteltes form). */}
      <div className="mt-5 flex flex-wrap items-center gap-2 border-t pt-4">
        <input
          type="email"
          value={testTo}
          onChange={(e) => setTestTo(e.target.value)}
          placeholder="Empfänger der Testmail"
          className="input h-9 w-full py-1 text-sm sm:w-64"
        />
        <button
          type="button"
          onClick={runTest}
          disabled={testing}
          className="btn-ghost h-9 disabled:opacity-50"
        >
          {testing ? "Sendet …" : "Testmail senden"}
        </button>
        {testMsg && (
          <span className={`text-sm ${testMsg.ok ? "text-green-600" : "text-red-600"}`}>
            {testMsg.text}
          </span>
        )}
      </div>
    </section>
  );
}
