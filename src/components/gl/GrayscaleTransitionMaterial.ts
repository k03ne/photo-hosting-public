import * as THREE from "three";
import { extend, type ThreeElement } from "@react-three/fiber";

/**
 * Minimaler `shaderMaterial`-Helfer (identisch zu FilmShaderMaterial.ts) — hält
 * @react-three/drei samt Node-22-only `camera-controls` aus dem Bundle. Erzeugt
 * eine THREE.ShaderMaterial-Unterklasse mit Uniforms + gleichnamigen Property-
 * Accessors (`material.uColor = …`). Default-Werte werden je Instanz geklont,
 * damit Vektoren/Objekte nicht zwischen Instanzen geteilt werden.
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
        transparent: true,
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
 * ShaderMaterial der Raster-Ebenen. Rendert die Textur standardmäßig in
 * Graustufen und blendet per `uColor` (0..1) weich zur Originalfarbe über —
 * animiert beim Hover, komplett auf der GPU (keine zweite Textur, kein
 * Neu-Upload). Zusätzlich:
 *  - `coverUv`: object-fit:cover-Mapping ohne Verzerrung.
 *  - `uHover`/`uColor`: heben das Bild aus dem gedimmten Ruhezustand.
 *  - `uOpacity`: globaler Fade (z.B. beim Öffnen der Lightbox).
 *
 * INSTANZ-ISOLATION: Jede Raster-Ebene erhält ihre EIGENE Material-Instanz
 * (die `shaderMaterial`-Fabrik klont alle Uniforms je Instanz — s.o.). `uColor`
 * wird pro Ebene aus deren lokalem Hover-Zustand getrieben. Dadurch färbt im
 * unendlichen Wrap-Around ausschließlich die eine, tatsächlich gehoverte
 * Instanz — Klone desselben Bildes teilen sich KEINE Uniform und bleiben grau.
 */
export const GrayscaleTransitionMaterial = shaderMaterial(
  {
    uTexture: null as THREE.Texture | null,
    uColor: 0, // 0 = Graustufen, 1 = volle Farbe
    uHover: 0, // 0..1 Hover-Interpolation
    uOpacity: 1, // globaler Fade
    uPlaneSize: new THREE.Vector2(1, 1),
    uImageSize: new THREE.Vector2(1, 1),
  },

  // ── Vertex Shader ───────────────────────────────────────────────────────────
  /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,

  // ── Fragment Shader ─────────────────────────────────────────────────────────
  /* glsl */ `
    uniform sampler2D uTexture;
    uniform float uColor;
    uniform float uHover;
    uniform float uOpacity;
    uniform vec2 uPlaneSize;
    uniform vec2 uImageSize;
    varying vec2 vUv;

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
      vec3 tex = texture2D(uTexture, uv).rgb;

      // uColor (0..1) treibt der Aufrufer aus dem lokalen Hover-Zustand DIESER
      // Instanz — daher färbt nur die gehoverte Ebene, nie ihre Klone.
      float reveal = clamp(uColor, 0.0, 1.0);

      // Luminanz (Rec. 709) → neutrale Graustufe; weich zur Originalfarbe mixen.
      float luma = dot(tex, vec3(0.2126, 0.7152, 0.0722));
      vec3 color = mix(vec3(luma), tex, reveal);

      // Ruhezustand deutlich gedimmt; Hover/Farbe heben sanft auf volle Helligkeit.
      float lift = max(uHover, reveal);
      color *= 0.62 + 0.38 * lift;

      gl_FragColor = vec4(color, uOpacity);
    }
  `,
);

// Als JSX-Element `<grayscaleTransitionMaterial />` in R3F verfügbar machen.
extend({ GrayscaleTransitionMaterial });

/** Instanztyp mit den Uniforms als beschreibbare Properties (für Refs). */
export type GrayscaleTransitionMaterialImpl = THREE.ShaderMaterial & {
  uTexture: THREE.Texture | null;
  uColor: number;
  uHover: number;
  uOpacity: number;
  uPlaneSize: THREE.Vector2;
  uImageSize: THREE.Vector2;
};

// TS: das neue Intrinsic-Element beim R3F-JSX-Namespace anmelden.
declare module "@react-three/fiber" {
  interface ThreeElements {
    grayscaleTransitionMaterial: ThreeElement<typeof GrayscaleTransitionMaterial>;
  }
}
