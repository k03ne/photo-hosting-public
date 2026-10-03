import Link from "next/link";
import type { Metadata } from "next";

import { NOINDEX } from "@/lib/seo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ADMIN_LINKS } from "@/components/admin/admin-nav";
import { MobileMenu } from "@/components/admin/MobileMenu";
import { auth } from "@/auth";
import { signOutAction } from "@/server/actions/auth";

/** Der Admin-Bereich gehört nie in einen Suchindex. */
export const metadata: Metadata = NOINDEX;

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Defense-in-depth: Middleware schützt bereits, hier zusätzlich der User-Kontext.
  const session = await auth();

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="sticky top-0 z-30 border-b bg-canvas/80 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-[1600px] items-center gap-4 px-4 sm:px-6 lg:px-8">
          <Link
            href="/admin"
            className="shrink-0 font-display text-lg font-semibold tracking-tight"
          >
            Photos<span className="text-accent">.</span>
          </Link>

          {/* Desktop-Navigation (ab md) */}
          <nav className="hidden items-center gap-5 md:flex lg:gap-7">
            {ADMIN_LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="text-sm text-muted transition hover:text-ink"
              >
                {l.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
            <span className="hidden text-sm text-muted lg:inline">
              {session?.user?.email}
            </span>
            <ThemeToggle />
            {/* Abmelden nur auf Desktop; auf Mobile im Burger-Menü */}
            <form action={signOutAction} className="hidden md:block">
              <button type="submit" className="btn-ghost py-2">
                Abmelden
              </button>
            </form>
            <MobileMenu email={session?.user?.email} />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1600px] flex-1 px-6 py-10 lg:px-8">
        {children}
      </main>
    </div>
  );
}
