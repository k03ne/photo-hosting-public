import type { ThemeDefinition, ThemeName } from "./types";
import { immersiveTheme } from "./immersive";

/** Zentrale Zuordnung Theme-Identifier → Komponenten/Tokens. Neue Themes
 *  werden ausschließlich hier registriert. */
export const themes: Record<ThemeName, ThemeDefinition> = {
  immersive: immersiveTheme,
};

export const DEFAULT_THEME: ThemeName = "immersive";

/** Robust: unbekannter/leerer Identifier fällt auf das Default-Theme zurück. */
export function resolveTheme(name: string | null | undefined): ThemeDefinition {
  if (name && name in themes) return themes[name as ThemeName];
  return themes[DEFAULT_THEME];
}
