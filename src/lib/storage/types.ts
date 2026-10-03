/** Abstraktion über den Ablageort der Bilder (Filesystem oder S3-kompatibel). */
export type StorageObject =
  | { kind: "buffer"; body: Buffer; contentType: string }
  | { kind: "redirect"; url: string };

export interface StorageDriver {
  /** Speichert Daten unter einem Key (Key kann Slashes/Verzeichnisse enthalten). */
  save(key: string, data: Buffer, contentType: string): Promise<void>;
  /** Löscht ein Objekt; kein Fehler, wenn es nicht existiert. */
  delete(key: string): Promise<void>;
  /** Liefert das Objekt zum Ausliefern, oder null wenn nicht vorhanden. */
  get(key: string): Promise<StorageObject | null>;
}
