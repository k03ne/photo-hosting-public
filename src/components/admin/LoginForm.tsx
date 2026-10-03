"use client";

import { useActionState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";

import { authenticate } from "@/server/actions/auth";

export function LoginForm() {
  const [errorMessage, formAction, isPending] = useActionState(
    authenticate,
    undefined,
  );

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden p-4">
      {/* Interner Admin-Login: bewusst neutral, kein Album-Foto */}
      <div className="absolute inset-0 bg-neutral-950" />
      <div className="absolute left-1/2 top-1/3 h-72 w-72 -translate-x-1/2 rounded-full bg-white/[0.04] blur-[100px]" />

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="relative w-full max-w-sm border border-white/15 bg-white/10 p-8 text-white backdrop-blur-xl"
      >
        <p className="text-center text-[11px] uppercase tracking-[0.3em] text-white/70">
          Photos
        </p>
        <h1 className="mt-6 text-center text-lg font-light uppercase tracking-[0.15em]">
          Anmelden
        </h1>

        <form action={formAction} className="mt-8 space-y-4">
          <div className="space-y-1.5">
            <label
              htmlFor="email"
              className="text-[11px] uppercase tracking-[0.15em] text-white/70"
            >
              E-Mail
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              className="w-full border border-white/20 bg-white/5 px-3.5 py-2.5 text-sm text-white outline-none transition placeholder:text-white/40 focus:border-white/60"
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="password"
              className="text-[11px] uppercase tracking-[0.15em] text-white/70"
            >
              Passwort
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="w-full border border-white/20 bg-white/5 px-3.5 py-2.5 text-sm text-white outline-none transition placeholder:text-white/40 focus:border-white/60"
            />
          </div>

          {errorMessage && (
            <p className="text-sm text-red-300" role="alert">
              {errorMessage}
            </p>
          )}

          <button
            type="submit"
            disabled={isPending}
            className="w-full bg-white px-3 py-2.5 text-xs font-medium uppercase tracking-[0.15em] text-neutral-900 transition hover:bg-white/90 disabled:opacity-60"
          >
            {isPending ? "Anmelden…" : "Anmelden"}
          </button>
        </form>

        <Link
          href="/"
          className="mt-6 block text-center text-[11px] uppercase tracking-[0.15em] text-white/50 transition hover:text-white/80"
        >
          Zur Startseite
        </Link>
      </motion.div>
    </main>
  );
}
