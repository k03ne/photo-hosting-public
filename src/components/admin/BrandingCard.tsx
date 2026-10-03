"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { saveBranding, type SettingsFormState } from "@/server/actions/settings";
import { NAME_DISPLAY_STYLES, formatDisplayName, type NameDisplayStyle } from "@/lib/branding";

export type BrandingInitial = {
  ownerName: string;
  logoType: "TEXT" | "IMAGE";
  logoImageKey: string | null;
  nameDisplayStyle: string;
};

const STYLE_LABELS: Record<NameDisplayStyle, string> = {
  FULL: "Vorname Nachname",
  INITIAL_LAST: "V. Nachname",
  LAST_ONLY: "Nachname",
  INITIALS: "Initialen",
};

/** Logo: entweder ein hochgeladenes Bild oder ein Schrift-Logo aus dem Namen
 *  mit wählbarer Schreibweise — mit Live-Vorschau. */
export function BrandingCard({ initial }: { initial: BrandingInitial }) {
  const router = useRouter();
  const [state, action, pending] = useActionState<SettingsFormState, FormData>(saveBranding, {});

  const [logoType, setLogoType] = useState<"TEXT" | "IMAGE">(initial.logoType);
  const [style, setStyle] = useState<string>(initial.nameDisplayStyle);
  const [uploading, startUpload] = useTransition();
  const [uploadErr, setUploadErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const preview = formatDisplayName(initial.ownerName, style) || "Dein Name";

  function upload(file: File) {
    setUploadErr(null);
    const body = new FormData();
    body.append("logo", file);
    startUpload(async () => {
      const res = await fetch("/api/admin/logo", { method: "POST", body });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setUploadErr(j.error ?? "Upload fehlgeschlagen.");
        return;
      }
      setLogoType("IMAGE");
      router.refresh();
    });
  }

  function removeLogo() {
    startUpload(async () => {
      await fetch("/api/admin/logo", { method: "DELETE" });
      setLogoType("TEXT");
      router.refresh();
    });
  }

  return (
    <section className="card p-5">
      <h2 className="font-medium">Logo & Namensdarstellung</h2>
      <p className="mt-1 text-sm text-muted">
        Nutze ein Bild-Logo oder ein Schrift-Logo aus deinem Namen (aus „Identität").
      </p>

      {/* Live-Vorschau */}
      <div className="mt-4 grid place-items-center rounded-lg border bg-surface p-6">
        {logoType === "IMAGE" && initial.logoImageKey ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/media/${initial.logoImageKey}`}
            alt="Logo"
            className="max-h-20 w-auto object-contain"
          />
        ) : (
          <span className="font-display text-3xl font-semibold tracking-tight">{preview}</span>
        )}
      </div>

      {/* Auswahl Bild vs. Schrift */}
      <div className="mt-4 flex gap-2">
        {(["TEXT", "IMAGE"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setLogoType(t)}
            aria-pressed={logoType === t}
            className={`chip px-4 py-2 transition ${
              logoType === t ? "bg-accent text-[hsl(var(--accent-ink))]" : "border hover:border-ink"
            }`}
          >
            {t === "TEXT" ? "Schrift-Logo" : "Bild-Logo"}
          </button>
        ))}
      </div>

      {logoType === "IMAGE" ? (
        <div className="mt-4 space-y-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) upload(f);
              e.target.value = "";
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="btn-accent disabled:opacity-50"
            >
              {uploading ? "Lädt …" : initial.logoImageKey ? "Logo ersetzen" : "Logo hochladen"}
            </button>
            {initial.logoImageKey && (
              <button
                type="button"
                onClick={removeLogo}
                disabled={uploading}
                className="btn-ghost disabled:opacity-50"
              >
                Entfernen
              </button>
            )}
          </div>
          <p className="text-xs text-muted">PNG/JPG/WebP, max. 5 MB. Wird zu WebP konvertiert.</p>
          {uploadErr && <p className="text-sm text-red-600">{uploadErr}</p>}
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap gap-2">
          {NAME_DISPLAY_STYLES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStyle(s)}
              aria-pressed={style === s}
              className={`chip px-3 py-1.5 transition ${
                style === s ? "bg-accent text-[hsl(var(--accent-ink))]" : "border hover:border-ink"
              }`}
            >
              {STYLE_LABELS[s]}
            </button>
          ))}
        </div>
      )}

      {/* Speichern (logoType + Schreibweise) */}
      <form action={action} className="mt-5 flex items-center gap-3 border-t pt-4">
        <input type="hidden" name="logoType" value={logoType} />
        <input type="hidden" name="nameDisplayStyle" value={style} />
        <button type="submit" disabled={pending} className="btn-accent disabled:opacity-50">
          {pending ? "Speichert …" : "Speichern"}
        </button>
        {state.ok && <span className="text-sm text-green-600">Gespeichert.</span>}
        {state.error && <span className="text-sm text-red-600">{state.error}</span>}
      </form>
    </section>
  );
}
