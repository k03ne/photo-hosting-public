"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import type { SiteMenuItem } from "@/lib/site-menu";

/**
 * Burger-Menü der Unterseiten — bewusst dieselbe Geste und Position (oben
 * rechts) wie auf der WebGL-Startseite: die Navigation soll auf der ganzen
 * Website gleich funktionieren. Erbt die Theme-Token (canvas/ink/line), weil es
 * innerhalb des Theme-Wrappers gerendert wird.
 */
export function SiteMenu({
  items,
  socials = [],
}: {
  items: SiteMenuItem[];
  /** Abgesetzte Social-Gruppe im Panel (Modus „menu"). */
  socials?: SiteMenuItem[];
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Seitenwechsel schließt das Panel (sonst bleibt es über der neuen Seite offen).
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (items.length === 0 && socials.length === 0) return null;

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname === href);

  return (
    <div className="fixed right-4 top-4 z-50 sm:right-6 sm:top-6">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="Menü"
        className="flex flex-col items-end gap-1.5 rounded-[3px] border border-line bg-canvas/80 p-3 backdrop-blur-sm transition-colors hover:border-accent"
      >
        <span className="block h-px w-6 bg-ink" />
        <span className={`block h-px bg-ink transition-all ${open ? "w-6" : "w-4"}`} />
      </button>

      {open && (
        <nav
          aria-label="Hauptmenü"
          className="absolute right-0 top-full mt-2 flex min-w-44 flex-col gap-1 rounded-[3px] border border-line bg-canvas/95 p-2 backdrop-blur-sm"
        >
          {items.map((item) =>
            item.external ? (
              // Externe Ziele bewusst als <a> mit target: Next-Link würde hier
              // nur den Client-Router bemühen, der die fremde Adresse nicht kennt.
              <a
                key={item.href}
                href={item.href}
                target="_blank"
                rel="noreferrer"
                className="rounded-[3px] px-3 py-2 text-[0.68rem] font-medium uppercase tracking-[0.14em] text-ink transition-colors hover:text-accent"
              >
                {item.label}
              </a>
            ) : (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive(item.href) ? "page" : undefined}
                className={`rounded-[3px] px-3 py-2 text-[0.68rem] font-medium uppercase tracking-[0.14em] transition-colors ${
                  isActive(item.href) ? "bg-accent text-canvas" : "text-ink hover:text-accent"
                }`}
              >
                {item.label}
              </Link>
            ),
          )}

          {socials.length > 0 && (
            <>
              {items.length > 0 && <span className="my-1 block h-px bg-line" aria-hidden />}
              {socials.map((s) => (
                <a
                  key={s.href}
                  href={s.href}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-[3px] px-3 py-2 text-[0.62rem] uppercase tracking-[0.14em] text-ink opacity-70 transition-colors hover:text-accent hover:opacity-100"
                >
                  {s.label}
                </a>
              ))}
            </>
          )}
        </nav>
      )}
    </div>
  );
}
