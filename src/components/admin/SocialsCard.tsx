"use client";

import { useActionState } from "react";

import { saveSocials, type SettingsFormState } from "@/server/actions/settings";
import { SOCIAL_PLATFORMS } from "@/lib/branding";

/** Sichtbares Adress-Präfix vor dem Eingabefeld, z.B. „instagram.com/". */
function prefixOf(host: string | null, path?: string): string | null {
  if (!host) return null;
  return host.replace(/^https?:\/\//, "") + (path ?? "");
}

/**
 * Social-Links. Eingetragen wird nur das Handle — die Adresse davor steht als
 * fester Text im Feld, damit sichtbar ist, was daraus wird. Leere Felder werden
 * im Frontend nicht dargestellt.
 */
export function SocialsCard({ initial }: { initial: Record<string, string> }) {
  const [state, action, pending] = useActionState<SettingsFormState, FormData>(saveSocials, {});

  return (
    <section className="card p-5">
      <h2 className="font-medium">Social-Links</h2>
      <p className="mt-1 text-sm text-muted">
        Nur den Namen bzw. das Handle eintragen — die Adresse ergibt sich daraus. Nicht ausgefüllte
        Netzwerke werden nirgends angezeigt.
      </p>

      <form action={action} className="mt-4 grid gap-3 sm:grid-cols-2">
        {SOCIAL_PLATFORMS.map((p) => {
          const prefix = prefixOf(p.host, "path" in p ? p.path : undefined);
          return (
            <label key={p.key} className="block text-sm">
              <span className="mb-1 block text-muted">{p.label}</span>
              <span className="input flex items-center gap-0 p-0 focus-within:ring-1 focus-within:ring-accent">
                {prefix && (
                  <span className="shrink-0 py-2 pl-3 text-muted" aria-hidden>
                    {prefix}
                    {p.at ? "@" : ""}
                  </span>
                )}
                <input
                  type="text"
                  name={p.key}
                  defaultValue={initial[p.key] ?? ""}
                  placeholder={p.placeholder}
                  aria-label={`${p.label} — Name oder Handle`}
                  className={`w-full min-w-0 border-0 bg-transparent py-2 pr-3 outline-none ${
                    prefix ? "pl-0" : "pl-3"
                  }`}
                />
              </span>
            </label>
          );
        })}

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
