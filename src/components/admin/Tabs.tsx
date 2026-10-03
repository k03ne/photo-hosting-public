"use client";

import { useState, type ReactNode } from "react";

export type TabItem = {
  id: string;
  label: string;
  /** Optionaler Zähler (z.B. Bilderanzahl) als dezente Pille. */
  badge?: number;
  content: ReactNode;
};

/**
 * Tab-Leiste für Admin-Workspaces (Album-Bearbeitung, Einstellungen). Alle
 * Panels werden serverseitig gerendert und hier nur ein-/ausgeblendet — so
 * bleiben Server-Components und der Zustand der Panels erhalten. Auf schmalen
 * Screens scrollt die Leiste horizontal.
 */
export function Tabs({
  tabs,
  initial,
  ariaLabel,
}: {
  tabs: TabItem[];
  initial?: string;
  ariaLabel: string;
}) {
  const [active, setActive] = useState(initial ?? tabs[0]?.id);

  return (
    <div>
      <div
        role="tablist"
        aria-label={ariaLabel}
        className="mb-6 flex gap-1 overflow-x-auto border-b border-line"
      >
        {tabs.map((t) => {
          const isActive = t.id === active;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActive(t.id)}
              className={`-mb-px flex shrink-0 items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition ${
                isActive
                  ? "border-ink text-ink"
                  : "border-transparent text-muted hover:text-ink"
              }`}
            >
              {t.label}
              {typeof t.badge === "number" && (
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[11px] ${
                    isActive ? "bg-ink text-canvas" : "bg-surface text-muted"
                  }`}
                >
                  {t.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {tabs.map((t) => (
        <div key={t.id} role="tabpanel" hidden={t.id !== active}>
          {t.content}
        </div>
      ))}
    </div>
  );
}
