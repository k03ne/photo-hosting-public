const KB = 1024;
const MB = KB * 1024;
const GB = MB * 1024;

/**
 * Menschenlesbare Größe, z.B. „3,2 GB" / „540 MB" / „4,7 MB". Deutsche
 * Dezimalstelle. Eine Nachkommastelle nur unter 100 Einheiten: bei Dateigrößen
 * ist sie aussagekräftig („4,7 MB"), bei Speicherbelegung wäre sie nur Rauschen.
 *
 * EINZIGE Quelle für Größenangaben — vorher gab es eine zweite Variante im
 * PhotoManager, die MB mit englischem Punkt formatierte und kein GB kannte.
 */
export function formatBytes(bytes: number): string {
  if (bytes >= GB) return `${scaled(bytes / GB)} GB`;
  if (bytes >= MB) return `${scaled(bytes / MB)} MB`;
  if (bytes >= KB) return `${Math.round(bytes / KB)} KB`;
  return `${bytes} B`;
}

function scaled(value: number): string {
  return value < 100 ? value.toFixed(1).replace(".", ",") : String(Math.round(value));
}
