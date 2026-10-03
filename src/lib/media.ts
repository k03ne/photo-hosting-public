/** Baut die öffentliche URL für eine Bildvariante aus dem storageKey. */
export function mediaUrl(storageKey: string, variant: "full" | "thumb" = "full") {
  const suffix = variant === "thumb" ? "_thumb.webp" : ".webp";
  return `/api/media/${storageKey}${suffix}`;
}

/** Baut die URL für eine Videodatei (der `originalKey` enthält bereits die
 *  Endung, z.B. `..._video.mp4`). Wird über die Media-Route ausgeliefert. */
export function videoUrl(key: string) {
  return `/api/media/${key}`;
}
