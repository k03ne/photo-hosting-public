"use client";

import { useActionState } from "react";

import {
  removeAlbumPassword,
  setAlbumPassword,
  type AlbumFormState,
} from "@/server/actions/albums";

export function AlbumPasswordForm({
  albumId,
  hasPassword,
}: {
  albumId: string;
  hasPassword: boolean;
}) {
  const [state, formAction, isPending] = useActionState<
    AlbumFormState,
    FormData
  >(setAlbumPassword, {});
  const fe = state.fieldErrors ?? {};

  return (
    <div className="space-y-3">
      <p className="text-sm text-neutral-500">
        {hasPassword ? (
          <span className="text-green-600">
            Passwortschutz ist aktiv.
          </span>
        ) : (
          "Kein Passwort gesetzt — das Album ist über den Link ohne Passwort erreichbar."
        )}
      </p>

      <form action={formAction} className="flex flex-wrap items-start gap-2">
        <input type="hidden" name="id" value={albumId} />
        <div className="space-y-1">
          <input
            name="password"
            type="password"
            placeholder={hasPassword ? "Neues Passwort" : "Passwort setzen"}
            className="rounded-lg border border-neutral-300 bg-transparent px-3 py-2 text-sm outline-none transition focus:border-neutral-900 dark:border-neutral-700 dark:focus:border-neutral-100"
          />
          {fe.password && (
            <p className="text-xs text-red-600">{fe.password[0]}</p>
          )}
          {state.success && (
            <p className="text-xs text-green-600">Passwort gespeichert.</p>
          )}
        </div>
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:opacity-60 dark:bg-neutral-100 dark:text-neutral-900"
        >
          {isPending ? "Speichern…" : hasPassword ? "Ändern" : "Setzen"}
        </button>
      </form>

      {hasPassword && (
        <form action={removeAlbumPassword}>
          <input type="hidden" name="id" value={albumId} />
          <button
            type="submit"
            className="text-sm text-neutral-500 underline-offset-2 hover:text-red-600 hover:underline"
          >
            Passwortschutz entfernen
          </button>
        </form>
      )}
    </div>
  );
}
