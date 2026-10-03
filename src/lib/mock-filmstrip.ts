import * as THREE from "three";
import type { FilmItem } from "@/store/useThemeStore";

/**
 * Mock-Datenquelle für das FilmStrip-Theme. Erzeugt Bild-Texturen komplett im
 * Browser (Canvas-2D → CanvasTexture), also ohne Netzwerk und ohne CORS-Fragen
 * — ideal, um Shader/Scroll/Interaktion zu prüfen. Für Echtdaten genügt es,
 * `FilmItem.src` (mit `mediaUrl(key,"thumb")`) und `FilmItem.aspect`
 * (`width/height` des Fotos) zu füllen: `createTexture` lädt dann die WebP statt
 * zu malen, das Panel bekommt automatisch das richtige Hoch-/Querformat.
 */

/** Kategorien der Filterleiste (Mock). */
export const MOCK_CATEGORIES = ["Portraits", "Reisen", "Architektur", "Analog"];

/** Kräftige, editorial anmutende Basisfarben. */
const PALETTE = [
  "#6b7a8f", "#a38b6d", "#7d6b8f", "#5f7a6b", "#8f6b6b",
  "#4a5568", "#9c8466", "#546b7a", "#7a5f6b", "#66808f",
];

/** Wiederkehrendes Muster aus Hoch-, Quer- und Quadratformaten. */
const ASPECTS = [0.72, 1.5, 0.66, 1.0, 0.8, 1.33, 0.7];

/** Deterministischer Mock-Katalog: Mischung aus Einzelbildern und Alben. */
export const MOCK_ITEMS: FilmItem[] = Array.from({ length: 16 }, (_, i) => {
  const isAlbum = i % 5 === 0; // jedes 5. Element ist ein Album
  return {
    id: `mock-${i}`,
    kind: isAlbum ? "album" : "photo",
    title: isAlbum ? `Album ${String(i / 5 + 1).padStart(2, "0")}` : `Frame ${String(i + 1).padStart(2, "0")}`,
    category: MOCK_CATEGORIES[i % MOCK_CATEGORIES.length],
    color: PALETTE[i % PALETTE.length],
    aspect: ASPECTS[i % ASPECTS.length],
    albumId: isAlbum ? `album-${i}` : undefined,
  };
});

/** Mischt zwei Hex-Farben (t in 0..1). */
function mix(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map((o) => parseInt(a.slice(o, o + 2), 16));
  const pb = [1, 3, 5].map((o) => parseInt(b.slice(o, o + 2), 16));
  const c = pa.map((v, i) => Math.round(v + (pb[i] - v) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

/**
 * Erzeugt eine THREE-Textur für ein FilmItem. Echtdaten (`item.src`) werden via
 * TextureLoader geladen; sonst wird eine abstrakte, editorial anmutende Kachel
 * gemalt (Verlauf + weicher Lichtfleck + Farbbänder, ohne Text/Perforation).
 * Die Canvas hat das Seitenverhältnis des Items, damit das cover-Mapping neutral
 * bleibt (kein Beschnitt).
 */
export function createTexture(item: FilmItem): THREE.Texture {
  if (item.src) {
    const tex = new THREE.TextureLoader().load(item.src);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    return tex;
  }

  const base = item.color ?? "#5f6670";
  const aspect = item.aspect ?? 0.72;
  const long = 1000;
  const w = Math.round(aspect >= 1 ? long : long * aspect);
  const h = Math.round(aspect >= 1 ? long / aspect : long);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;

  // Grund: diagonaler Verlauf von aufgehellter Basis nach tief abgedunkelt.
  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, mix(base, "#ffffff", 0.18));
  grad.addColorStop(0.55, base);
  grad.addColorStop(1, mix(base, "#000000", 0.62));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Weicher Lichtfleck (radialer Glow) leicht außermittig.
  const glow = ctx.createRadialGradient(
    w * 0.32, h * 0.28, 0,
    w * 0.32, h * 0.28, Math.max(w, h) * 0.7,
  );
  glow.addColorStop(0, mix(base, "#ffffff", 0.4).replace("rgb", "rgba").replace(")", ",0.5)"));
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);

  // Zwei diagonale, halbtransparente Farbbänder für Tiefe/Bewegung.
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate(-0.5);
  ctx.globalAlpha = 0.14;
  ctx.fillStyle = mix(base, "#000000", 0.4);
  ctx.fillRect(-w, -h * 0.12, w * 2, h * 0.1);
  ctx.fillStyle = mix(base, "#ffffff", 0.3);
  ctx.fillRect(-w, h * 0.14, w * 2, h * 0.06);
  ctx.restore();

  // Zarte Vignette.
  const vig = ctx.createRadialGradient(
    w / 2, h / 2, Math.min(w, h) * 0.35,
    w / 2, h / 2, Math.max(w, h) * 0.75,
  );
  vig.addColorStop(0, "rgba(0,0,0,0)");
  vig.addColorStop(1, "rgba(0,0,0,0.35)");
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, w, h);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Mock-Bilder für die geöffnete Album-Grid-Ansicht (DOM/CSS). Reine
 * CSS-Verläufe — bei Echtdaten hier die Foto-Keys des Albums via `mediaUrl`
 * einsetzen.
 */
export function mockAlbumTiles(item: FilmItem): { id: string; background: string }[] {
  const base = item.color ?? "#5f6670";
  return Array.from({ length: 12 }, (_, i) => ({
    id: `${item.id}-tile-${i}`,
    background: `linear-gradient(${140 + i * 12}deg, ${mix(base, "#ffffff", 0.15)}, ${mix(
      base,
      "#000000",
      0.5,
    )})`,
  }));
}
