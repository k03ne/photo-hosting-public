import "server-only";

import exifReader from "exif-reader";
import sharp from "sharp";

// Zielgrößen (längste Kante). Original wird nie hochskaliert.
const MAX_DIM = 2560;
const THUMB_DIM = 640;
const BLUR_DIM = 16;

/** Anzeigbare Aufnahme-Metadaten (aus EXIF extrahiert, GPS bleibt außen vor). */
export type PhotoExif = {
  camera?: string; // Hersteller + Modell
  lens?: string;
  iso?: number;
  focalLength?: number; // mm
  aperture?: number; // f-Zahl
  exposure?: string; // z.B. "1/250 s"
};

export type ProcessedImage = {
  full: Buffer; // WebP in Anzeigegröße
  thumb: Buffer; // WebP Thumbnail
  width: number; // Maße der `full`-Variante
  height: number;
  blurDataUrl: string; // winzige Base64-Vorschau für Skeleton/Blur-up
  takenAt: Date | null; // aus EXIF (falls vorhanden)
  exif: PhotoExif | null; // Kamera/ISO/Brennweite … für die Anzeige
};

/**
 * Verarbeitet ein hochgeladenes Bild:
 * - richtet es anhand der EXIF-Orientierung aus (`rotate()`)
 * - entfernt sämtliche Metadaten inkl. GPS (sharp gibt ohne `withMetadata()`
 *   keine EXIF-Daten aus)
 * - erzeugt WebP in Anzeigegröße + Thumbnail + Blur-Platzhalter
 */
export async function processImage(input: Buffer): Promise<ProcessedImage> {
  const pipeline = sharp(input, { failOn: "none" }).rotate();
  const meta = await pipeline.metadata();

  const takenAt = extractTakenAt(meta.exif);
  const exif = extractExif(meta.exif);

  const full = await pipeline
    .clone()
    .resize({
      width: MAX_DIM,
      height: MAX_DIM,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 82 })
    .toBuffer();

  const fullMeta = await sharp(full).metadata();

  const thumb = await pipeline
    .clone()
    .resize({
      width: THUMB_DIM,
      height: THUMB_DIM,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 75 })
    .toBuffer();

  const blur = await pipeline
    .clone()
    .resize({ width: BLUR_DIM, height: BLUR_DIM, fit: "inside" })
    .webp({ quality: 40 })
    .toBuffer();

  return {
    full,
    thumb,
    width: fullMeta.width ?? 0,
    height: fullMeta.height ?? 0,
    blurDataUrl: `data:image/webp;base64,${blur.toString("base64")}`,
    takenAt,
    exif,
  };
}

function extractExif(exif: Buffer | undefined): PhotoExif | null {
  if (!exif) return null;
  try {
    const parsed = exifReader(exif);
    const image = parsed?.Image ?? {};
    const photo = parsed?.Photo ?? {};

    const make = typeof image.Make === "string" ? image.Make.trim() : "";
    const model = typeof image.Model === "string" ? image.Model.trim() : "";
    // Modell enthält oft schon den Hersteller -> nicht doppeln.
    const camera = model.toLowerCase().startsWith(make.toLowerCase())
      ? model
      : [make, model].filter(Boolean).join(" ");

    const lensRaw = photo.LensModel;
    const lens = typeof lensRaw === "string" ? lensRaw.trim() : undefined;

    const isoRaw = photo.ISOSpeedRatings ?? photo.PhotographicSensitivity;
    const iso = Array.isArray(isoRaw) ? isoRaw[0] : isoRaw;

    const focalLength =
      typeof photo.FocalLength === "number" ? photo.FocalLength : undefined;
    const aperture =
      typeof photo.FNumber === "number" ? photo.FNumber : undefined;

    const exposure = formatExposure(photo.ExposureTime);

    const result: PhotoExif = {};
    if (camera) result.camera = camera;
    if (lens) result.lens = lens;
    if (typeof iso === "number" && iso > 0) result.iso = iso;
    if (focalLength) result.focalLength = Math.round(focalLength);
    if (aperture) result.aperture = Math.round(aperture * 10) / 10;
    if (exposure) result.exposure = exposure;

    return Object.keys(result).length > 0 ? result : null;
  } catch {
    return null;
  }
}

/** Belichtungszeit als "1/250 s" bzw. "2 s". */
function formatExposure(seconds: unknown): string | undefined {
  if (typeof seconds !== "number" || seconds <= 0) return undefined;
  if (seconds >= 1) return `${Math.round(seconds * 10) / 10} s`;
  return `1/${Math.round(1 / seconds)} s`;
}

function extractTakenAt(exif: Buffer | undefined): Date | null {
  if (!exif) return null;
  try {
    const parsed = exifReader(exif);
    const dt =
      parsed?.Photo?.DateTimeOriginal ??
      parsed?.Photo?.DateTimeDigitized ??
      parsed?.Image?.DateTime;
    if (dt instanceof Date && !Number.isNaN(dt.getTime())) return dt;
  } catch {
    // EXIF nicht lesbar -> ignorieren
  }
  return null;
}
