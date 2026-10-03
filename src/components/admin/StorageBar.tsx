import { formatBytes } from "@/lib/format-bytes";

/**
 * Fortschrittsbalken für die Speicherbelegung. Ohne Limit wird nur die
 * belegte Menge angezeigt (kein Balken). Farbe schlägt ab 75 % nach Amber
 * und ab 100 % nach Rot um.
 */
export function StorageBar({
  usedBytes,
  limitBytes,
  compact = false,
}: {
  usedBytes: number;
  limitBytes: number | null;
  compact?: boolean;
}) {
  const hasLimit = limitBytes != null && limitBytes > 0;
  const ratio = hasLimit ? usedBytes / limitBytes! : 0;
  const pct = Math.min(100, Math.round(ratio * 100));

  const color = !hasLimit
    ? "bg-neutral-400"
    : ratio >= 1
      ? "bg-red-500"
      : ratio >= 0.75
        ? "bg-amber-500"
        : "bg-emerald-500";

  return (
    <div>
      <div className={`flex items-baseline justify-between ${compact ? "text-xs" : "text-sm"}`}>
        <span className="font-medium">{formatBytes(usedBytes)} belegt</span>
        {hasLimit ? (
          <span className="text-muted">
            von {formatBytes(limitBytes!)} · {pct}%
          </span>
        ) : (
          <span className="text-muted">kein Limit</span>
        )}
      </div>

      {hasLimit && (
        <div
          className={`mt-1.5 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800 ${compact ? "h-1.5" : "h-2.5"}`}
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Speicherbelegung"
        >
          <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
        </div>
      )}

      {hasLimit && ratio >= 1 && !compact && (
        <p className="mt-2 text-sm text-red-600">
          Speicher voll — neue Uploads werden abgewiesen, bis Platz frei wird oder das Limit erhöht wird.
        </p>
      )}
    </div>
  );
}
