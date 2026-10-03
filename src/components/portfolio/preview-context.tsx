"use client";

import { createContext, useContext } from "react";

/**
 * Signalisiert, dass ein Block im Editor-Vorschaumodus (LivePreview) gerendert
 * wird — z.B. damit das Kontaktformular dort NICHT wirklich versendet. Auf der
 * öffentlichen Seite fehlt der Provider → Default `false` → echter Versand.
 */
const PreviewContext = createContext(false);

export const PreviewProvider = PreviewContext.Provider;

export function useIsPreview(): boolean {
  return useContext(PreviewContext);
}
