"use client";

import { useActionState } from "react";

import { saveIdentity, type SettingsFormState } from "@/server/actions/settings";

export type IdentityInitial = {
  ownerName: string;
  addressStreet: string;
  addressZip: string;
  addressCity: string;
  addressCountry: string;
  phone: string;
  vatId: string;
  contactEmail: string;
};

/** Person/Studio-Daten — Grundlage für Impressum, Datenschutz und Copyright. */
export function IdentityCard({ initial }: { initial: IdentityInitial }) {
  const [state, action, pending] = useActionState<SettingsFormState, FormData>(saveIdentity, {});

  return (
    <section className="card p-5">
      <h2 className="font-medium">Identität</h2>
      <p className="mt-1 text-sm text-muted">
        Name und Anschrift für Impressum, Datenschutzerklärung und das Copyright im Footer.
      </p>

      <form action={action} className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block text-sm sm:col-span-2">
          <span className="mb-1 block text-muted">Name / Studio</span>
          <input name="ownerName" defaultValue={initial.ownerName} placeholder="Andreas König" className="input" />
        </label>

        <label className="block text-sm sm:col-span-2">
          <span className="mb-1 block text-muted">Straße & Hausnummer</span>
          <input name="addressStreet" defaultValue={initial.addressStreet} className="input" />
        </label>

        <label className="block text-sm">
          <span className="mb-1 block text-muted">PLZ</span>
          <input name="addressZip" defaultValue={initial.addressZip} className="input" />
        </label>

        <label className="block text-sm">
          <span className="mb-1 block text-muted">Ort</span>
          <input name="addressCity" defaultValue={initial.addressCity} className="input" />
        </label>

        <label className="block text-sm">
          <span className="mb-1 block text-muted">Land</span>
          <input name="addressCountry" defaultValue={initial.addressCountry} placeholder="Deutschland" className="input" />
        </label>

        <label className="block text-sm">
          <span className="mb-1 block text-muted">Telefon</span>
          <input name="phone" defaultValue={initial.phone} className="input" />
        </label>

        <label className="block text-sm">
          <span className="mb-1 block text-muted">Kontakt-E-Mail (öffentlich)</span>
          <input type="email" name="contactEmail" defaultValue={initial.contactEmail} className="input" />
        </label>

        <label className="block text-sm">
          <span className="mb-1 block text-muted">USt-IdNr. (optional)</span>
          <input name="vatId" defaultValue={initial.vatId} placeholder="DE…" className="input" />
        </label>

        <div className="flex items-center gap-3 sm:col-span-2">
          <button type="submit" disabled={pending} className="btn-accent disabled:opacity-50">
            {pending ? "Speichert …" : "Speichern"}
          </button>
          {state.ok && <span className="text-sm text-green-600">Gespeichert.</span>}
          {state.error && <span className="text-sm text-red-600">{state.error}</span>}
        </div>
      </form>
    </section>
  );
}
