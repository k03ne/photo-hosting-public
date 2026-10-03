/**
 * Kleines Info-Icon mit Hover-/Fokus-Tooltip. Rein CSS (group-hover), daher als
 * Server-Component nutzbar. Für kurze Erklärungen neben Listeneinträgen.
 */
export function InfoHint({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex shrink-0">
      <span
        tabIndex={0}
        role="note"
        aria-label={text}
        className="grid h-5 w-5 cursor-help place-items-center rounded-full border text-[11px] font-serif italic leading-none text-muted transition hover:border-ink hover:text-ink focus:outline-none focus-visible:border-ink"
      >
        i
      </span>
      <span className="pointer-events-none absolute left-1/2 top-7 z-20 w-60 -translate-x-1/2 rounded-lg border bg-canvas p-2.5 text-left text-xs leading-relaxed text-muted opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
        {text}
      </span>
    </span>
  );
}
