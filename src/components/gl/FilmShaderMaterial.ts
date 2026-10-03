import * as THREE from "three";
import { extend, type ThreeElement } from "@react-three/fiber";

/**
 * Minimaler `shaderMaterial`-Helfer (ersetzt den gleichnamigen drei-Import, damit
 * @react-three/drei samt Node-22-only `camera-controls` nicht mitgezogen wird).
 * Erzeugt eine THREE.ShaderMaterial-Unterklasse mit Uniforms + gleichnamigen
 * Property-Accessors (`material.uTime = …`). Default-Werte werden je Instanz
 * geklont, damit Vektoren/Objekte nicht zwischen Instanzen geteilt werden.
 */
function shaderMaterial<U extends Record<string, unknown>>(
  uniforms: U,
  vertexShader: string,
  fragmentShader: string,
): (new () => THREE.ShaderMaterial & U) & { key: string } {
  const Material = class extends THREE.ShaderMaterial {
    constructor() {
      const entries = Object.entries(uniforms);
      super({
        vertexShader,
        fragmentShader,
        uniforms: Object.fromEntries(
          entries.map(([name, value]) => [
            name,
            {
              value:
                value && typeof (value as { clone?: unknown }).clone === "function"
                  ? (value as { clone: () => unknown }).clone()
                  : value,
            },
          ]),
        ),
      });
      for (const [name] of entries) {
        Object.defineProperty(this, name, {
          get() {
            return this.uniforms[name].value;
          },
          set(v: unknown) {
            this.uniforms[name].value = v;
          },
        });
      }
    }
  };
  (Material as unknown as { key: string }).key = THREE.MathUtils.generateUUID();
  return Material as unknown as (new () => THREE.ShaderMaterial & U) & { key: string };
}

/**
 * Custom ShaderMaterial für die Bildpanels des Filmstreifens. Erzeugt zwei
 * Effekte, die beide an die Scroll-Geschwindigkeit (`uVelocity`) gekoppelt sind:
 *
 *  1. Vertex-Bending: die Ebene wölbt sich beim Scrollen in die Tiefe — wie ein
 *     durchlaufender Film, der über eine Rolle läuft.
 *  2. Fragment-Aberration: leichte RGB-Verschiebung (Chromatic Aberration) für
 *     den filmischen Speed-Look; dazu Hover-Anhebung und cover-Mapping.
 *
 * Uniforms werden von drei/drei als gleichnamige Properties zugänglich gemacht
 * (`material.uTime = …`), was das per-Frame-Update in <FilmStrip> ermöglicht.
 */
export const FilmShaderMaterial = shaderMaterial(
  {
    uTexture: null,
    uTime: 0,
    uVelocity: 0, // normiert (-1..1)
    uHovered: 0, // 0..1 Hover-Interpolation
    uOpacity: 1, // globaler Fade (Filterwechsel)
    uPlaneSize: new THREE.Vector2(1, 1),
    uImageSize: new THREE.Vector2(1, 1),
  },

  // ── Vertex Shader ─────────────────────────────────────────────────────────
  /* glsl */ `
    uniform float uTime;
    uniform float uVelocity;
    varying vec2 vUv;
    varying float vBend;

    void main() {
      vUv = uv;
      vec3 pos = position;

      // Film-Bending: uv.x läuft 0..1 über die Breite. sin(uv.x * PI) ist 0 an
      // beiden Rändern und 1 in der Mitte → eine symmetrische Wölbung. Ihre
      // Amplitude skaliert mit der (vorzeichenbehafteten) Scroll-Geschwindigkeit,
      // die Ebene biegt sich also in Bewegungsrichtung nach hinten weg. Bewusst
      // dezent gehalten (subtiler Effekt).
      float curve = sin(vUv.x * 3.14159265);
      pos.z -= curve * uVelocity * 0.35;

      // Sehr feines Dauer-Flattern, leicht verstärkt bei Bewegung.
      pos.z += sin(pos.y * 3.0 + uTime * 1.2) * 0.008 * (0.4 + abs(uVelocity));

      // Minimale Scherung: die Ränder ziehen leicht in Scrollrichtung mit.
      pos.x += curve * uVelocity * 0.07;

      vBend = curve;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    }
  `,

  // ── Fragment Shader ───────────────────────────────────────────────────────
  /* glsl */ `
    uniform sampler2D uTexture;
    uniform float uVelocity;
    uniform float uHovered;
    uniform float uOpacity;
    uniform vec2 uPlaneSize;
    uniform vec2 uImageSize;
    varying vec2 vUv;
    varying float vBend;

    // „cover"-Mapping (analog CSS object-fit: cover): füllt die Ebene ohne
    // Verzerrung, indem die längere Bildachse beschnitten wird.
    vec2 coverUv(vec2 uv, vec2 plane, vec2 image) {
      float planeAspect = plane.x / plane.y;
      float imageAspect = image.x / image.y;
      vec2 scale = imageAspect > planeAspect
        ? vec2(planeAspect / imageAspect, 1.0)
        : vec2(1.0, imageAspect / planeAspect);
      return (uv - 0.5) * scale + 0.5;
    }

    void main() {
      vec2 uv = coverUv(vUv, uPlaneSize, uImageSize);

      // Chromatische Aberration: R/B-Kanäle horizontal entgegengesetzt versetzt,
      // Stärke koppelt (dezent) an die Scroll-Geschwindigkeit.
      float shift = uVelocity * 0.005;
      float r = texture2D(uTexture, uv + vec2(shift, 0.0)).r;
      float g = texture2D(uTexture, uv).g;
      float b = texture2D(uTexture, uv - vec2(shift, 0.0)).b;
      vec3 color = vec3(r, g, b);

      // Ruhezustand leicht abgedunkelt, Hover hebt das Bild auf volle Helligkeit.
      color *= 0.78 + 0.22 * uHovered;

      // Zarte Vignette entlang der Wölbung (Ränder minimal dunkler).
      color *= 1.0 - vBend * 0.06;

      gl_FragColor = vec4(color, uOpacity);
    }
  `,
);

// Als JSX-Element `<filmShaderMaterial />` in R3F verfügbar machen.
extend({ FilmShaderMaterial });

/** Instanztyp mit den Uniforms als beschreibbare Properties (für Refs). */
export type FilmShaderMaterialImpl = THREE.ShaderMaterial & {
  uTexture: THREE.Texture | null;
  uTime: number;
  uVelocity: number;
  uHovered: number;
  uOpacity: number;
  uPlaneSize: THREE.Vector2;
  uImageSize: THREE.Vector2;
};

// TS: das neue Intrinsic-Element beim R3F-JSX-Namespace anmelden.
declare module "@react-three/fiber" {
  interface ThreeElements {
    filmShaderMaterial: ThreeElement<typeof FilmShaderMaterial>;
  }
}
