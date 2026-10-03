"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { useGesture } from "@use-gesture/react";

import {
  GrayscaleTransitionMaterial,
  type GrayscaleTransitionMaterialImpl,
} from "@/components/gl/GrayscaleTransitionMaterial";
import { useGridStore, type GridImage } from "@/store/useGridStore";

// Basis-Zellgröße (Weltkoordinaten) als Fallback. Die tatsächliche Ebenengröße
// pro Zelle wird aus dem Seitenverhältnis des Bildes abgeleitet, bleibt aber
// innerhalb der Zelle. Per `cellSize`-Prop überschreibbar (größer = größere Bilder).
const CELL = 3.4;
// Voreingestellter Zwischenraum (Anteil der Zelle). Kleiner = engeres Raster;
// per `gap`-Prop überschreibbar (Ebene = CELL * (1 - gap)).
const DEFAULT_GAP = 0.16;

/**
 * Umschließt eine Koordinate periodisch in das zentrierte Intervall
 * [-span/2, +span/2). Kern der „unendlichen" 2D-Kachelung:
 *
 *   wrap(v) = ((v + span/2) mod span) - span/2      (mit stets positivem mod)
 *
 * Dadurch bleiben die Weltkoordinaten immer klein (kein Wegdriften ins
 * Unendliche → keine Float-Präzisionsverluste, kein Speicherwachstum). Eine
 * Ebene, die oben aus dem Frustum läuft, taucht unten wieder auf. Die Textur
 * bleibt fest an die Zelle gebunden → das Raster wiederholt sich mit Periode
 * `span`, das Umschlagen passiert außerhalb des Sichtfelds und poppt daher nicht.
 */
function wrap(v: number, span: number): number {
  return ((((v + span / 2) % span) + span) % span) - span / 2;
}

/** Textur laden, Farbraum/Filter setzen; bei Wechsel der `src` neu laden. */
function useImageTexture(src: string): THREE.Texture | null {
  const ref = useRef<THREE.Texture | null>(null);
  const { gl, invalidate } = useThree();

  const texture = useMemo(() => {
    const tex = new THREE.TextureLoader().load(src, (t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      // Anisotrope Filterung: scharfe Kanten auch bei schräg/verkleinert.
      t.anisotropy = Math.min(4, gl.capabilities.getMaxAnisotropy());
      t.needsUpdate = true;
      invalidate();
    });
    ref.current = tex;
    return tex;
  }, [src, gl, invalidate]);

  useEffect(() => () => texture.dispose(), [texture]);
  return texture;
}

type Cell = {
  key: number;
  /** Eindeutige Instanz-ID DIESER Ebene (nicht die Bild-ID) — Basis der Farb-Isolation. */
  instanceId: string;
  image: GridImage;
  /** Ruhelage im Raster (vor Anwendung des Drag-Offsets). */
  baseX: number;
  baseY: number;
  /** Ebenengröße aus dem Bildseitenverhältnis (in die Zelle eingepasst). */
  w: number;
  h: number;
};

function GridPlane({
  cell,
  offset,
  spanX,
  spanY,
  alwaysColor,
}: {
  cell: Cell;
  offset: React.RefObject<THREE.Vector2>;
  spanX: number;
  spanY: number;
  /** Bilder dauerhaft farbig zeigen statt erst beim Hover. */
  alwaysColor: boolean;
}) {
  const mesh = useRef<THREE.Mesh>(null);
  const mat = useRef<GrayscaleTransitionMaterialImpl>(null);
  const hover = useRef(false);
  const texture = useImageTexture(cell.image.src);

  const setHover = useGridStore((s) => s.setHover);
  const clearHover = useGridStore((s) => s.clearHover);
  const openLightbox = useGridStore((s) => s.openLightbox);

  useFrame((_, delta) => {
    const m = mesh.current;
    const material = mat.current;
    if (!m || !material) return;

    // Position = Ruhelage + Drag-Offset, beide Achsen periodisch umgeschlagen.
    m.position.x = wrap(cell.baseX + offset.current.x, spanX);
    m.position.y = wrap(cell.baseY + offset.current.y, spanY);

    // Weiche Uniform-Übergänge (framerate-unabhängig gedämpft). Farbe wird aus
    // dem LOKALEN Hover-Zustand dieser Instanz getrieben → nur die eine gehoverte
    // Ebene färbt, ihre Wrap-Klone bleiben grau (Instanz-Isolation).
    const k = 1 - Math.pow(0.001, delta); // ~ exponentielles Nähern pro Sekunde
    const on = hover.current ? 1 : 0;
    // `alwaysColor` hebt nur die Entsättigung auf — der Hover bleibt als
    // Uniform erhalten, damit die Ebene weiterhin auf Zeigen reagiert.
    material.uColor += ((alwaysColor ? 1 : on) - material.uColor) * k;
    material.uHover += (on - material.uHover) * k;
  });

  return (
    <mesh
      ref={mesh}
      onPointerOver={(e) => {
        e.stopPropagation();
        hover.current = true;
        document.body.style.cursor = "pointer";
        setHover(cell.instanceId, cell.image);
      }}
      onPointerOut={() => {
        hover.current = false;
        document.body.style.cursor = "";
        clearHover(cell.instanceId);
      }}
      onClick={(e) => {
        // 1-Klick: Hover färbt bereits, ein einzelner Klick öffnet sofort.
        e.stopPropagation();
        openLightbox(cell.image);
      }}
    >
      <planeGeometry args={[cell.w, cell.h]} />
      <grayscaleTransitionMaterial
        ref={mat}
        key={GrayscaleTransitionMaterial.key}
        uTexture={texture}
        uPlaneSize={new THREE.Vector2(cell.w, cell.h)}
        uImageSize={new THREE.Vector2(cell.image.aspect, 1)}
      />
    </mesh>
  );
}

/**
 * Unendliches, omnidirektionales Bildraster. Enthält Drag-/Wheel-Gestik
 * (@use-gesture/react) mit Trägheits-Dämpfung und die modulare Wrap-Logik.
 */
export function InfiniteGrid({
  reducedMotion = false,
  gap = DEFAULT_GAP,
  cellSize = CELL,
  showGridLines = false,
  dark = true,
  alwaysColor = false,
}: {
  reducedMotion?: boolean;
  /** Zwischenraum-Anteil pro Zelle (0..1). Kleiner = engeres Raster. */
  gap?: number;
  /** Basis-Zellgröße (Weltkoordinaten). Größer = größere Bilder / mehr Zoom. */
  cellSize?: number;
  /** Minimalistische „Schneidematte" hinter den Bildern einblenden. */
  showGridLines?: boolean;
  /** Aktuelles Theme (steuert Kontrast/Farbe der Schneidematte). */
  dark?: boolean;
  /** Bilder dauerhaft farbig zeigen statt erst beim Hover (Graustufen aus). */
  alwaysColor?: boolean;
}) {
  // Schutz gegen degenerierte Werte (0/negativ würde das Layout zerstören).
  const cell = cellSize > 0.5 ? cellSize : CELL;
  const { viewport, gl, invalidate } = useThree();
  const items = useGridStore((s) => s.items);

  // Geglätteter Offset (folgt `target`), Zielwert (setzt die Gestik) und
  // Restgeschwindigkeit (Impuls nach dem Loslassen).
  const offset = useRef(new THREE.Vector2(0, 0));
  const target = useRef(new THREE.Vector2(0, 0));
  const velocity = useRef(new THREE.Vector2(0, 0));

  // Genug Zellen, um den Viewport + einen Ring ringsum zu füllen (für den
  // nahtlosen Umschlag außerhalb des Sichtfelds).
  const { cells, spanX, spanY } = useMemo(() => {
    const cols = Math.max(3, Math.ceil(viewport.width / cell) + 2);
    const rows = Math.max(3, Math.ceil(viewport.height / cell) + 2);
    const spanX = cols * cell;
    const spanY = rows * cell;
    const plane = cell * (1 - gap);
    const list: Cell[] = [];
    const source: GridImage[] =
      items.length > 0 ? items : [{ id: "placeholder", src: "", full: "", aspect: 1 }];

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const idx = r * cols + c;
        const image = source[idx % source.length];
        const aspect = image.aspect || 1;
        // Ebene ins Zellquadrat einpassen (längere Achse = `plane`).
        const w = aspect >= 1 ? plane : plane * aspect;
        const h = aspect >= 1 ? plane / aspect : plane;
        list.push({
          key: idx,
          instanceId: `inst-${idx}`,
          image,
          // Zentriertes Gitter: Zellmittelpunkte symmetrisch um den Ursprung.
          baseX: (c - (cols - 1) / 2) * cell,
          baseY: (r - (rows - 1) / 2) * cell,
          w,
          h,
        });
      }
    }
    return { cells: list, spanX, spanY };
  }, [viewport.width, viewport.height, items, gap, cell]);

  // ── Gestik: Drag (Zeiger/Touch) + Wheel/Trackpad ──────────────────────────
  // Bindung direkt an das Canvas-Element, damit Wheel non-passiv abgefangen und
  // die Seite nicht mitscrollt. Der Umrechnungsfaktor Pixel→Welt macht die
  // Bewegung 1:1 „unter dem Finger".
  const px2world = (viewport.height / gl.domElement.clientHeight) || 0.01;

  useGesture(
    {
      onDrag: ({ delta: [dx, dy], last, velocity: [vx, vy], direction: [dirX, dirY] }) => {
        // Bildschirm-Y zeigt nach unten, Welt-Y nach oben → Y invertieren.
        target.current.x += dx * px2world;
        target.current.y -= dy * px2world;
        // Beim Loslassen Restimpuls setzen (Trägheit); v ist px/ms → skaliert.
        if (last) {
          velocity.current.set(
            dirX * vx * px2world * 18,
            -dirY * vy * px2world * 18,
          );
        } else {
          velocity.current.set(0, 0);
        }
        invalidate();
      },
      onWheel: ({ delta: [dx, dy], event }) => {
        event.preventDefault();
        target.current.x -= dx * px2world;
        target.current.y += dy * px2world;
        velocity.current.set(0, 0);
        invalidate();
      },
    },
    {
      target: gl.domElement,
      eventOptions: { passive: false },
      drag: { filterTaps: true, pointer: { touch: true } },
    },
  );

  useFrame((_, delta) => {
    // Trägheit: Restgeschwindigkeit auf den Zielwert addieren und exponentiell
    // ausklingen lassen (reibungsartige Dämpfung, framerate-unabhängig).
    if (!reducedMotion && velocity.current.lengthSq() > 1e-6) {
      target.current.addScaledVector(velocity.current, delta);
      velocity.current.multiplyScalar(Math.pow(0.94, delta * 60));
      if (velocity.current.lengthSq() < 1e-5) velocity.current.set(0, 0);
      invalidate();
    }

    // Idle-Auto-Schwenk: der Store setzt bei Ruhe eine Zufallsrichtung; wir
    // schieben den Zielwert konstant dorthin. Jede Nutzereingabe räumt
    // `autoScrollDir` wieder ab (registerActivity) → der Schwenk stoppt sanft.
    // Erst greifen lassen, wenn eine evtl. Trägheit ausgeklungen ist.
    const auto = useGridStore.getState().autoScrollDir;
    if (auto && !reducedMotion && velocity.current.lengthSq() < 1e-6) {
      const speed = useGridStore.getState().autoScrollSpeed;
      target.current.x += auto.x * speed * delta;
      target.current.y += auto.y * speed * delta;
    }
    // Dämpfung/Glättung: Offset folgt dem Ziel gefedert statt hart zu springen.
    const follow = reducedMotion ? 1 : 1 - Math.pow(0.0001, delta);
    offset.current.lerp(target.current, follow);
  });

  return (
    <group>
      {/* Schneidematte HINTER den Bildern; nutzt denselben `offset` → panzt synchron. */}
      {showGridLines && <CuttingMat offset={offset} dark={dark} cellSize={cell} />}
      {cells.map((cell) => (
        <GridPlane
          key={cell.key}
          cell={cell}
          offset={offset}
          spanX={spanX}
          spanY={spanY}
          alwaysColor={alwaysColor}
        />
      ))}
    </group>
  );
}

// ── Schneidematte (Cutting Mat) ───────────────────────────────────────────────
// Kamera-Z aus OmniGridTheme; leichte Übergröße kompensiert die Perspektive der
// hinter den Bildern liegenden Ebene, damit die Matte randlos füllt.
const MAT_DEPTH = 0.5;
const MAT_OVERSCAN = 1.12;

// Bildschirm-alignierte Ebene, deren Gitter in Weltkoordinaten (minus Pan-Offset)
// berechnet wird → läuft 1:1 synchron mit dem Bildraster. Dicke Hauptlinien,
// dünne Nebenlinien, dezente Fadenkreuze (+) an den Hauptknoten.
const MAT_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const MAT_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform vec2 uOffset;
  uniform vec2 uViewport;
  uniform float uMajor;
  uniform float uMinor;
  uniform vec3 uColor;
  uniform float uOpacity;

  // Anti-aliasing-Gitter: 1 auf einer Linie mit Schrittweite \`step\`, sonst 0.
  float axisGrid(vec2 coord, float step, float thickness) {
    vec2 c = coord / step;
    vec2 f = abs(fract(c - 0.5) - 0.5);      // Abstand zur nächsten Linie (in Zellen)
    vec2 w = fwidth(c) * thickness;          // Linienbreite ~ pro Pixel
    vec2 g = vec2(1.0) - smoothstep(vec2(0.0), w, f);
    return max(g.x, g.y);
  }

  void main() {
    // Weltkoordinate der Matte, um den Pan-Offset verschoben ⇒ synchron zum Raster.
    vec2 world = (vUv - 0.5) * uViewport - uOffset;

    float minor = axisGrid(world, uMinor, 1.0) * 0.45;  // dünne Nebenlinien
    float major = axisGrid(world, uMajor, 1.5);         // dicke Hauptlinien
    float intensity = max(minor, major);

    // Fadenkreuze (+) an den Hauptknoten.
    vec2 nv = (fract(world / uMajor - 0.5) - 0.5) * uMajor;  // Versatz zum nächsten Knoten
    vec2 na = abs(nv);
    float arm = uMinor * 0.6;                                // Armlänge des Kreuzes
    float thin = fwidth(world.x) * 1.5;
    float plus = max(
      (1.0 - smoothstep(0.0, thin, na.x)) * step(na.y, arm),
      (1.0 - smoothstep(0.0, thin, na.y)) * step(na.x, arm)
    );
    intensity = max(intensity, plus * 0.9);

    gl_FragColor = vec4(uColor, intensity * uOpacity);
  }
`;

function CuttingMat({
  offset,
  dark,
  cellSize = CELL,
}: {
  offset: React.RefObject<THREE.Vector2>;
  dark: boolean;
  cellSize?: number;
}) {
  const { viewport } = useThree();
  const mat = useRef<THREE.ShaderMaterial>(null);

  // Übergrößte Weltmaße (füllen den Rand trotz Perspektive der hinteren Ebene).
  const vw = viewport.width * MAT_OVERSCAN;
  const vh = viewport.height * MAT_OVERSCAN;

  // Uniform-Konfiguration einmalig — Werte werden je Frame aktualisiert.
  const config = useMemo(
    () => ({
      uniforms: {
        uOffset: { value: new THREE.Vector2() },
        uViewport: { value: new THREE.Vector2(1, 1) },
        uMajor: { value: cellSize },        // Hauptlinien im Zellraster
        uMinor: { value: cellSize / 4 },    // Nebenlinien (Viertelung)
        uColor: { value: new THREE.Color() },
        uOpacity: { value: 0 },
      },
      vertexShader: MAT_VERT,
      fragmentShader: MAT_FRAG,
      transparent: true,
      depthTest: false,  // nie von Bildern verdeckt/verdeckend
      depthWrite: false,
    }),
    [],
  );

  useFrame(() => {
    const material = mat.current;
    if (!material) return;
    const u = material.uniforms;
    (u.uOffset.value as THREE.Vector2).copy(offset.current);
    (u.uViewport.value as THREE.Vector2).set(vw, vh);
    // Low-Contrast: helle Linien auf Dunkel, dunkle auf Hell.
    (u.uColor.value as THREE.Color).set(dark ? "#ffffff" : "#101012");
    u.uOpacity.value = dark ? 0.05 : 0.07;
  });

  return (
    <mesh renderOrder={-1} position={[0, 0, -MAT_DEPTH]} scale={[vw, vh, 1]}>
      <planeGeometry args={[1, 1]} />
      <shaderMaterial ref={mat} args={[config]} />
    </mesh>
  );
}
