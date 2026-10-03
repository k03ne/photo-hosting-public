"use client";

type Layout = "MASONRY" | "GRID" | "JUSTIFIED";

const bar = "rounded-[2px] bg-muted/40";

// Deterministische „Ziegel"-Höhen für die Masonry-Vorschau.
const heights = [
  [7, 4],
  [4, 7],
  [6, 5],
  [5, 6],
  [7, 5],
  [4, 6],
];

// Abstand der Kacheln in der Vorschau — spiegelt die Auswahl „Bild-Abstand"
// (`gridSpacing`) wider, damit die drei Layout-Karten zeigen, was tatsächlich
// in der Galerie ankommt.
function previewGap(spacing: string): string {
  return spacing === "LARGE" ? "gap-[5px]" : "gap-[2px]";
}

function MasonryPreview({ cols, gap }: { cols: number; gap: string }) {
  return (
    <div className={`flex h-full ${gap}`}>
      {Array.from({ length: cols }).map((_, i) => (
        <div key={i} className={`flex flex-1 flex-col ${gap}`}>
          {/* Anteilig statt in px: passt sich jedem Abstand an, ohne zu überlaufen. */}
          <div className={bar} style={{ flex: `${heights[i % 6][0]} 0 0` }} />
          <div className={bar} style={{ flex: `${heights[i % 6][1]} 0 0` }} />
        </div>
      ))}
    </div>
  );
}

function GridPreview({ cols, gap }: { cols: number; gap: string }) {
  return (
    <div
      className={`grid h-full ${gap}`}
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
      {Array.from({ length: cols * 2 }).map((_, i) => (
        <div key={i} className={bar} />
      ))}
    </div>
  );
}

function JustifiedPreview({ gap }: { gap: string }) {
  return (
    <div className={`flex h-full flex-col ${gap}`}>
      <div className={`flex flex-1 ${gap}`}>
        <div className={`flex-[2] ${bar}`} />
        <div className={`flex-1 ${bar}`} />
        <div className={`flex-[1.6] ${bar}`} />
      </div>
      <div className={`flex flex-1 ${gap}`}>
        <div className={`flex-1 ${bar}`} />
        <div className={`flex-[2.2] ${bar}`} />
      </div>
    </div>
  );
}

const options: { value: Layout; label: string; hint: string }[] = [
  { value: "MASONRY", label: "Masonry", hint: "Höhen variieren" },
  { value: "GRID", label: "Raster", hint: "Gleiche Kacheln" },
  { value: "JUSTIFIED", label: "Ausgerichtet", hint: "Zeilen bündig" },
];

export function LayoutPicker({
  value,
  columns,
  spacing,
  onChange,
}: {
  value: Layout;
  columns: number;
  /** REGULAR | LARGE — wird in den Vorschauen als Kachelabstand gezeigt. */
  spacing: string;
  onChange: (v: Layout) => void;
}) {
  const gap = previewGap(spacing);
  return (
    <div className="grid grid-cols-3 gap-2 sm:gap-3">
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            aria-pressed={active}
            className={`card p-2 text-left transition ${
              active ? "border-ink ring-1 ring-ink" : "hover:border-muted/50"
            }`}
          >
            <div className="h-14 rounded-md bg-canvas p-1.5 sm:h-16 sm:p-2">
              {opt.value === "MASONRY" && (
                <MasonryPreview cols={columns} gap={gap} />
              )}
              {opt.value === "GRID" && <GridPreview cols={columns} gap={gap} />}
              {opt.value === "JUSTIFIED" && <JustifiedPreview gap={gap} />}
            </div>
            <p
              className={`mt-2 text-center text-xs font-semibold ${
                active ? "text-ink" : "text-muted"
              }`}
            >
              {opt.label}
            </p>
            <p className="hidden text-center text-[11px] text-muted sm:block">
              {opt.hint}
            </p>
          </button>
        );
      })}
    </div>
  );
}
