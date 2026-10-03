"use client";

import { useActionState } from "react";
import { motion } from "framer-motion";

import { mediaUrl } from "@/lib/media";
import { unlockAlbum, type UnlockState } from "@/server/actions/share";

export function PasswordGate({
  shareToken,
  albumTitle,
  coverKey,
  coverFocusX = 50,
  coverFocusY = 50,
}: {
  shareToken: string;
  albumTitle: string;
  coverKey: string | null;
  coverFocusX?: number;
  coverFocusY?: number;
}) {
  // shareToken vorbinden -> Signatur passt zu useActionState.
  const action = unlockAlbum.bind(null, shareToken);
  const [state, formAction, isPending] = useActionState<UnlockState, FormData>(
    action,
    {},
  );

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden p-4">
      {/* Kundenlogin: Cover des Albums als geblurter Hintergrund */}
      {coverKey ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={mediaUrl(coverKey, "full")}
            alt=""
            className="absolute inset-0 h-full w-full scale-110 object-cover blur-2xl"
            style={{ objectPosition: `${coverFocusX}% ${coverFocusY}%` }}
          />
          <div className="absolute inset-0 bg-black/45" />
        </>
      ) : (
        <div className="absolute inset-0 bg-neutral-900" />
      )}

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="relative w-full max-w-sm border border-white/15 bg-white/10 p-8 text-white backdrop-blur-xl"
      >
        <h1 className="text-center font-display text-xl font-light uppercase tracking-[0.15em]">
          {albumTitle}
        </h1>
        <p className="mt-2 text-center text-[11px] uppercase tracking-[0.15em] text-white/70">
          Passwortgeschützt
        </p>

        <form action={formAction} className="mt-8 space-y-4">
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
              autoFocus
              required
              className="w-full border border-white/20 bg-white/5 px-3.5 py-2.5 text-sm text-white outline-none transition placeholder:text-white/40 focus:border-white/60"
            />
          </div>

          {state.error && (
            <p className="text-sm text-red-300" role="alert">
              {state.error}
            </p>
          )}

          <button
            type="submit"
            disabled={isPending}
            className="w-full bg-white px-3 py-2.5 text-xs font-medium uppercase tracking-[0.15em] text-neutral-900 transition hover:bg-white/90 disabled:opacity-60"
          >
            {isPending ? "Prüfen…" : "Album öffnen"}
          </button>
        </form>
      </motion.div>
    </main>
  );
}
