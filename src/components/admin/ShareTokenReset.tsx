"use client";

import { useActionState, useEffect, useState } from "react";

import { rotateShareToken } from "@/server/actions/albums";

/**
 * „Link neu erzeugen" in der Freigabe-Kachel. Zweistufig (erst armen, dann
 * bestätigen), weil der Schritt nicht umkehrbar ist: der alte Token ist danach
 * weg, bereits verschickte Gästelinks liefern 404.
 *
 * `isLegacyToken` markiert Alben, die noch den alten, vorhersagbaren cuid-Token
 * tragen — dort ist das Nachziehen eine Empfehlung, sonst nur eine Notmaßnahme.
 */
export function ShareTokenReset({
  albumId,
  isLegacyToken,
}: {
  albumId: string;
  isLegacyToken: boolean;
}) {
  const [state, formAction, isPending] = useActionState(rotateShareToken, {});
  const [armed, setArmed] = useState(false);

  // Erst einklappen, wenn die Action tatsächlich durch ist — nicht schon beim
  // Klick: das Formular darf nicht mitten im Submit aus dem Baum fliegen,
  // sonst geht die Erfolgs-/Fehlermeldung verloren.
  useEffect(() => {
    if (state.success) setArmed(false);
  }, [state.success]);

  if (!armed) {
    return (
      <div className="space-y-1.5">
        <button
          type="button"
          onClick={() => setArmed(true)}
          className="btn-ghost text-sm"
        >
          Kryptischen Link neu erzeugen
        </button>
        {isLegacyToken ? (
          <p className="text-xs text-amber-600">
            Dieses Album nutzt noch das alte, schwächere Link-Verfahren. Einmal
            neu erzeugen schließt das — vorhandene Gästelinks musst du danach
            erneut verschicken.
          </p>
        ) : (
          <p className="text-xs text-muted">
            Nötig, wenn ein Link in falsche Hände geraten ist.
          </p>
        )}
        {state.success && (
          <p className="text-xs text-green-600">
            Neuer Link erzeugt. Der alte liefert jetzt 404.
          </p>
        )}
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="id" value={albumId} />
      <p className="text-sm text-ink">
        Neuen kryptischen Link erzeugen? Alle bereits verschickten Links auf
        dieses Album hören damit auf zu funktionieren.
      </p>
      {state.error && <p className="text-xs text-red-600">{state.error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={isPending}
          onClick={() => setArmed(false)}
          className="btn-ghost flex-1"
        >
          Abbrechen
        </button>
        <button
          type="submit"
          disabled={isPending}
          className="btn-primary flex-1"
        >
          {isPending ? "Erzeuge…" : "Neu erzeugen"}
        </button>
      </div>
    </form>
  );
}
