"use client";

import { useActionState } from "react";

import { submitContactForm } from "@/server/actions/mail";
import { useIsPreview } from "./preview-context";

type Field = "name" | "email" | "phone" | "message";

/**
 * Kontaktformular-Runtime (read-styled über Theme-Tokens, für alle Themes gleich).
 * Sendet über die Server-Action `submitContactForm`; im Editor-Vorschaumodus ist
 * der Versand deaktiviert. Der Empfänger wird NICHT hier bestimmt, sondern
 * serverseitig aus den globalen Einstellungen (contactRecipient) — der Client
 * kann keine Zieladresse wählen (kein offener Mailer).
 */
export function ContactFormView({
  heading,
  fields,
}: {
  heading?: string;
  fields: Field[];
  /** Altes Prop, nicht mehr genutzt (Empfänger ist global). */
  recipient?: string;
}) {
  const preview = useIsPreview();
  const [state, action, pending] = useActionState<{ ok?: boolean; error?: string }, FormData>(
    submitContactForm,
    {},
  );

  if (state.ok) {
    return (
      <section className="px-6 py-24 md:px-12">
        <div className="mx-auto max-w-lg text-center">
          {heading && (
            <h2 className="mb-4 font-display text-3xl font-light tracking-tight">{heading}</h2>
          )}
          <p className="text-ink/80">Danke! Deine Nachricht wurde gesendet.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="px-6 py-24 md:px-12">
      <div className="mx-auto max-w-lg">
        {heading && (
          <h2 className="mb-10 text-center font-display text-3xl font-light tracking-tight">
            {heading}
          </h2>
        )}
        <form
          action={preview ? undefined : action}
          onSubmit={preview ? (e) => e.preventDefault() : undefined}
          className="flex flex-col gap-5"
        >
          {/* Honeypot gegen Bots — visuell versteckt. */}
          <input
            type="text"
            name="company"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden
            className="hidden"
          />

          {fields.includes("name") && <TextField name="name" placeholder="Name" />}
          {fields.includes("email") && <TextField name="email" type="email" placeholder="E-Mail" />}
          {fields.includes("phone") && <TextField name="phone" type="tel" placeholder="Telefon" />}
          {fields.includes("message") && (
            <textarea
              name="message"
              rows={5}
              placeholder="Nachricht"
              className="border-b border-ink/30 bg-transparent py-2 text-sm outline-none transition focus:border-ink"
            />
          )}

          {state.error && <p className="text-sm text-red-600">{state.error}</p>}

          <button
            type="submit"
            disabled={pending || preview}
            className="mt-2 self-center border border-ink px-10 py-3 text-[11px] uppercase tracking-[0.25em] transition hover:bg-ink hover:text-canvas disabled:opacity-50"
          >
            {preview ? "Vorschau" : pending ? "Sendet …" : "Senden"}
          </button>
          {preview && (
            <p className="text-center text-xs text-muted">Vorschau — Versand ist hier deaktiviert.</p>
          )}
        </form>
      </div>
    </section>
  );
}

function TextField({
  name,
  placeholder,
  type = "text",
}: {
  name: string;
  placeholder: string;
  type?: string;
}) {
  return (
    <input
      type={type}
      name={name}
      placeholder={placeholder}
      className="border-b border-ink/30 bg-transparent py-2 text-sm outline-none transition focus:border-ink"
    />
  );
}
