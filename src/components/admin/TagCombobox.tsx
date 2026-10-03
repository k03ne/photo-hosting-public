"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Textfeld mit echtem Aufklapp-Menü der bereits vergebenen Werte (Galerie-
 * Gruppen, Portfolio-Kategorien). Beides ist möglich: einen vorhandenen Eintrag
 * auswählen oder einen neuen tippen.
 *
 * Ersetzt das frühere `<input list>` + `<datalist>`: Das ist zwar genau für
 * diesen Fall gedacht, wird von den Browsern aber sehr unterschiedlich
 * umgesetzt — Safari zeigt gar keine Liste, Chrome erst beim Tippen. In der
 * Praxis sah das Feld deshalb wie ein reines Freitextfeld aus, und die schon
 * angelegten Gruppen waren nicht auffindbar. Ein eigenes Menü verhält sich
 * überall gleich und zeigt vor allem, WAS es schon gibt.
 */
export function TagCombobox({
  id,
  value,
  onChange,
  options,
  placeholder,
  title,
  /** Beschriftung des Eintrags, der den Wert leert. */
  clearLabel = "Ohne Zuordnung",
  /** Hinweis, wenn es noch gar keine Einträge gibt. */
  emptyHint = "Noch keine Einträge — tippe einen neuen.",
  inputClassName = "input",
  onEnter,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  title?: string;
  clearLabel?: string;
  emptyHint?: string;
  inputClassName?: string;
  /** Enter im Feld (z. B. um ein Formular abzuschicken). */
  onEnter?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Klick außerhalb schließt das Menü.
  useEffect(() => {
    if (!open) return;
    function onDown(e: PointerEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  function pick(next: string) {
    onChange(next);
    setOpen(false);
    inputRef.current?.focus();
  }

  return (
    <div
      ref={wrapRef}
      className="relative"
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          // Nicht weiterreichen: sonst schließt derselbe Tastendruck auch den
          // umgebenden Bild-Editor.
          e.stopPropagation();
          setOpen(false);
        }
        if (e.key === "Enter" && !open && onEnter) onEnter();
      }}
    >
      <input
        id={id}
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        title={title}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls={id ? `${id}-listbox` : undefined}
        className={`${inputClassName} pr-8`}
      />

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Liste schließen" : "Vorhandene anzeigen"}
        aria-expanded={open}
        tabIndex={-1}
        className="absolute inset-y-0 right-0 grid w-8 cursor-pointer place-items-center text-muted transition hover:text-ink"
      >
        <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.6}>
          <path d="M6 8l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <ul
          id={id ? `${id}-listbox` : undefined}
          role="listbox"
          className="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded-lg border bg-surface p-1 shadow-lg"
        >
          {options.length === 0 ? (
            <li className="px-2 py-1.5 text-xs text-muted">{emptyHint}</li>
          ) : (
            <>
              <li>
                <button
                  type="button"
                  role="option"
                  aria-selected={value === ""}
                  onClick={() => pick("")}
                  className={`w-full cursor-pointer rounded-md px-2 py-1.5 text-left text-sm transition hover:bg-canvas ${
                    value === "" ? "font-medium text-ink" : "text-muted"
                  }`}
                >
                  {clearLabel}
                </button>
              </li>
              {options.map((o) => (
                <li key={o}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={value === o}
                    onClick={() => pick(o)}
                    className={`w-full cursor-pointer truncate rounded-md px-2 py-1.5 text-left text-sm transition hover:bg-canvas ${
                      value === o ? "bg-canvas font-medium" : ""
                    }`}
                  >
                    {o}
                  </button>
                </li>
              ))}
            </>
          )}
        </ul>
      )}
    </div>
  );
}
