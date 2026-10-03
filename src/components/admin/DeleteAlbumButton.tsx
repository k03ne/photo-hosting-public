"use client";

import { useState } from "react";

import { deleteAlbum } from "@/server/actions/albums";

/** Gut lesbarer Zufallscode (ohne leicht verwechselbare Zeichen). */
function randomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

export function DeleteAlbumButton({
  albumId,
  albumTitle,
}: {
  albumId: string;
  albumTitle: string;
}) {
  const [armed, setArmed] = useState(false);
  const [code] = useState(randomCode);
  const [typed, setTyped] = useState("");
  const match = typed.trim().toUpperCase() === code;

  if (!armed) {
    return (
      <button
        type="button"
        onClick={() => setArmed(true)}
        className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950/40"
      >
        Album löschen
      </button>
    );
  }

  return (
    <form action={deleteAlbum} className="space-y-2">
      <input type="hidden" name="id" value={albumId} />
      <p className="text-sm text-ink">
        Album „{albumTitle}" mit allen Bildern und Kommentaren endgültig löschen.
        Gib zur Bestätigung diesen Code ein:
      </p>
      <p className="select-all rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-center font-mono text-base font-semibold tracking-[0.3em] text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
        {code}
      </p>
      <input
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        placeholder="Code eingeben"
        autoComplete="off"
        spellCheck={false}
        className="input text-center font-mono tracking-[0.2em]"
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            setArmed(false);
            setTyped("");
          }}
          className="btn-ghost flex-1"
        >
          Abbrechen
        </button>
        <button
          type="submit"
          disabled={!match}
          className="flex-1 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Endgültig löschen
        </button>
      </div>
    </form>
  );
}
