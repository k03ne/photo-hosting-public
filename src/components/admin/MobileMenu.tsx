"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { ADMIN_LINKS } from "@/components/admin/admin-nav";
import { signOutAction } from "@/server/actions/auth";

/**
 * Mobiles Burger-Menü (< md). Blendet die Navigationslinks hinter einem
 * Aufklapp-Panel aus, damit die Kopfzeile auf schmalen Displays nicht überläuft.
 */
export function MobileMenu({ email }: { email?: string | null }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Bei Routenwechsel schließen.
  useEffect(() => setOpen(false), [pathname]);

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Menü schließen" : "Menü öffnen"}
        aria-expanded={open}
        className="grid h-9 w-9 place-items-center rounded-lg border text-ink transition hover:bg-surface"
      >
        {open ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <path d="M3 6h18M3 12h18M3 18h18" />
          </svg>
        )}
      </button>

      {open && (
        <>
          {/* Klick außerhalb schließt */}
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-x-0 bottom-0 top-16 z-30 cursor-default bg-black/20"
          />
          <div className="absolute inset-x-0 top-16 z-40 border-b bg-canvas shadow-lg">
            <nav className="mx-auto flex max-w-[1600px] flex-col px-4 py-2">
              {ADMIN_LINKS.map((l) => {
                const active = pathname === l.href || pathname.startsWith(`${l.href}/`);
                return (
                  <Link
                    key={l.href}
                    href={l.href}
                    className={`rounded-lg px-2 py-2.5 text-sm transition hover:bg-surface ${
                      active ? "font-medium text-ink" : "text-muted"
                    }`}
                  >
                    {l.label}
                  </Link>
                );
              })}
              <form action={signOutAction} className="mt-1 border-t pt-2">
                {email && <p className="truncate px-2 pb-1 text-xs text-muted">{email}</p>}
                <button
                  type="submit"
                  className="w-full rounded-lg px-2 py-2.5 text-left text-sm text-muted transition hover:bg-surface"
                >
                  Abmelden
                </button>
              </form>
            </nav>
          </div>
        </>
      )}
    </div>
  );
}
