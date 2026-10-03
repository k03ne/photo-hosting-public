"use client";

import { useEffect, useRef, useState } from "react";

import { ChevronDownIcon, DownloadIcon } from "@/components/share/icons";

// Auswählbare Download-Qualität: JPG mittel, JPG Original, RAW-Quelldatei.
export type Quality = "m" | "original" | "raw";

/**
 * Download-Button mit aufklappbarer Qualitätsauswahl. Wird sowohl in der hellen
 * Galerie-Toolbar als auch über der dunklen Lightbox verwendet.
 */
export function DownloadMenu({
  hasRaw,
  label,
  buildUrl,
  variant = "toolbar",
  direction = "down",
}: {
  hasRaw: boolean;
  label: string;
  buildUrl: (q: Quality) => string;
  variant?: "toolbar" | "lightbox";
  direction?: "down" | "up";
}) {
  const [open, setOpen] = useState(false);
  // Standard: volle Auflösung — Gäste sollen nicht ungewollt eine kleinere
  // Web-Größe („M") laden. „M" bleibt als bewusste Option erhalten.
  const [q, setQ] = useState<Quality>("original");
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  const options: { value: Quality; label: string; hint: string }[] = [
    { value: "m", label: "JPG · M", hint: "Web-Größe, max. 2048 px" },
    { value: "original", label: "JPG · Original", hint: "Volle Auflösung" },
    ...(hasRaw
      ? [{ value: "raw" as Quality, label: "RAW", hint: "Originaldatei" }]
      : []),
  ];

  const dark = variant === "lightbox";
  const trigger = dark
    ? "flex items-center gap-1.5 rounded-full border border-white/20 bg-black/45 px-3 py-2 text-white backdrop-blur transition hover:bg-black/60"
    : "flex items-center gap-1.5 text-[11px] uppercase tracking-[0.15em] text-muted transition hover:text-ink";
  const panelPos =
    direction === "up" ? "bottom-full mb-3" : "top-full mt-3";
  const panelSide = dark ? "left-1/2 -translate-x-1/2" : "right-0";
  const panel = dark
    ? "border-white/10 bg-neutral-900/95 text-white backdrop-blur-md"
    : "border-[hsl(var(--line))] bg-surface";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="Download"
        className={trigger}
      >
        <DownloadIcon className={dark ? "h-[18px] w-[18px]" : "h-4 w-4"} />
        {!dark && <span>Download</span>}
        <ChevronDownIcon
          className={`h-3.5 w-3.5 transition ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div
          className={`absolute z-[100060] w-60 rounded-xl border p-2 shadow-lg ${panelPos} ${panelSide} ${panel}`}
        >
          <p
            className={`px-2 pb-1 pt-1 text-[10px] uppercase tracking-[0.15em] ${
              dark ? "text-white/50" : "text-muted"
            }`}
          >
            {label} · Qualität
          </p>
          <div className="space-y-0.5">
            {options.map((o) => {
              const active = q === o.value;
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setQ(o.value)}
                  className={`flex w-full items-start gap-2.5 rounded-lg px-2 py-1.5 text-left transition ${
                    dark
                      ? active
                        ? "bg-white/10"
                        : "hover:bg-white/10"
                      : active
                        ? "bg-ink/5"
                        : "hover:bg-ink/5"
                  }`}
                >
                  <span
                    className={`mt-0.5 grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full border ${
                      active
                        ? dark
                          ? "border-white"
                          : "border-ink"
                        : dark
                          ? "border-white/40"
                          : "border-muted/50"
                    }`}
                  >
                    {active && (
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${dark ? "bg-white" : "bg-ink"}`}
                      />
                    )}
                  </span>
                  <span className="leading-tight">
                    <span
                      className={`block text-sm ${dark ? "text-white" : "text-ink"}`}
                    >
                      {o.label}
                    </span>
                    <span
                      className={`block text-[11px] ${dark ? "text-white/50" : "text-muted"}`}
                    >
                      {o.hint}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
          <a
            href={buildUrl(q)}
            onClick={() => setOpen(false)}
            className={`mt-2 block w-full rounded-xl px-4 py-2.5 text-center text-sm font-medium transition ${
              dark
                ? "bg-white text-neutral-900 hover:bg-white/90"
                : "bg-ink text-canvas hover:opacity-90"
            }`}
          >
            Herunterladen
          </a>
        </div>
      )}
    </div>
  );
}
