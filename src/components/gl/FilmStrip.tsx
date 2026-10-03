"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { useThemeStore, type FilmItem } from "@/store/useThemeStore";
import { createTexture } from "@/lib/mock-filmstrip";
import {
  FilmShaderMaterial,
  type FilmShaderMaterialImpl,
} from "./FilmShaderMaterial";

// Sicherstellen, dass `extend({ FilmShaderMaterial })` läuft (Tree-Shaking-Schutz).
void FilmShaderMaterial;

// ── Geometrie-Konstanten (Weltkoordinaten) ──────────────────────────────────
// Jedes Panel sitzt in einem gleich breiten „Slot" (uniformer STRIDE → einfache
// Modulo-Schleife). Innerhalb der Bounding-Box wird es auf sein echtes
// Seitenverhältnis skaliert, sodass Hoch- UND Querformate unverzerrt und
// unbeschnitten erscheinen (Plane-Aspect == Bild-Aspect → cover ist neutral).
const BOUND_W = 2.9;
const BOUND_H = 3.7;
const GAP = 0.5;
const STRIDE = BOUND_W + GAP; // Slot-Breite (Achsabstand zweier Panels)

/** Passt ein Seitenverhältnis (w/h) höhen- bzw. breitenbegrenzt in die Box ein. */
function fitPlane(aspect: number): { w: number; h: number } {
  let w = BOUND_H * aspect;
  let h = BOUND_H;
  if (w > BOUND_W) {
    w = BOUND_W;
    h = BOUND_W / aspect;
  }
  return { w, h };
}

/** Wählt die je nach Filter sichtbaren Items. */
function selectItems(items: FilmItem[], filter: string): FilmItem[] {
  if (filter === "all") return items;
  if (filter === "albums") return items.filter((it) => it.kind === "album");
  return items.filter((it) => it.category === filter);
}

/** Gleiche Item-Liste? (nur IDs vergleichen, Reihenfolge zählt). */
function sameIds(a: FilmItem[], b: FilmItem[]): boolean {
  return a.length === b.length && a.every((it, i) => it.id === b[i].id);
}

export function FilmStrip({ items }: { items: FilmItem[] }) {
  const { gl } = useThree();
  const filter = useThemeStore((s) => s.filter);
  const openLightbox = useThemeStore((s) => s.openLightbox);
  const openAlbum = useThemeStore((s) => s.openAlbum);
  const setVelocity = useThemeStore((s) => s.setVelocity);

  // Aktuell gerenderte Liste (wird bei Filterwechsel erst nach Ausblenden getauscht).
  const [renderItems, setRenderItems] = useState<FilmItem[]>(() =>
    selectItems(items, filter),
  );

  // Texturen zur aktuellen Liste; bei Wechsel alte sauber freigeben.
  const textures = useMemo(() => renderItems.map(createTexture), [renderItems]);
  useEffect(() => () => textures.forEach((t) => t.dispose()), [textures]);

  // Panel-Layout je Item: echte Größe (aus dem Seitenverhältnis) + eine sehr
  // dezente vertikale Staffelung für einen organischeren, künstlerischen Verlauf.
  const layout = useMemo(
    () =>
      renderItems.map((it, i) => {
        const { w, h } = fitPlane(it.aspect ?? 0.72);
        return { w, h, size: new THREE.Vector2(w, h), y: Math.sin(i * 1.7) * 0.12 };
      }),
    [renderItems],
  );

  // ── Refs für imperative Per-Frame-Updates (keine Re-Renders) ───────────────
  const meshRefs = useRef<(THREE.Mesh | null)[]>([]);
  const matRefs = useRef<(FilmShaderMaterialImpl | null)[]>([]);
  const pending = useRef<FilmItem[] | null>(null); // ausstehende Filterauswahl
  const fade = useRef(1); // globaler Opacity-Fade 0..1

  const scroll = useRef(0); // aktueller (geglätteter) Scroll-Offset
  const target = useRef(0); // Ziel-Offset (Eingabe akkumuliert hierhin)
  const velocity = useRef(0); // geglättete, normierte Geschwindigkeit
  const hoveredId = useRef<string | null>(null);
  const dragged = useRef(false); // unterscheidet Klick von Drag

  // Bei Filterwechsel die neue Auswahl vormerken (Swap passiert nach dem Fade).
  useEffect(() => {
    const next = selectItems(items, filter);
    if (!sameIds(next, renderItems)) pending.current = next;
  }, [items, filter, renderItems]);

  // ── Eingabe: Wheel + Pointer-Drag (Touch inklusive über Pointer Events) ────
  useEffect(() => {
    const dom = gl.domElement;
    let down = false;
    let lastX = 0;
    let moved = 0;

    // Nur scrollen, wenn die Canvas im Vordergrund ist (nicht in Lightbox/Album).
    const active = () => useThemeStore.getState().view === "canvas";

    const onWheel = (e: WheelEvent) => {
      if (!active()) return;
      // Vertikales Wheel bewegt den horizontalen Streifen (natürlichstes Mapping).
      target.current += (e.deltaY + e.deltaX) * 0.0022;
    };
    const onDown = (e: PointerEvent) => {
      if (!active()) return;
      down = true;
      moved = 0;
      lastX = e.clientX;
      dragged.current = false;
    };
    const onMove = (e: PointerEvent) => {
      if (!down || !active()) return;
      const dx = e.clientX - lastX;
      lastX = e.clientX;
      moved += Math.abs(dx);
      target.current -= dx * 0.009;
      if (moved > 6) dragged.current = true; // ab 6px gilt es als Drag
    };
    const onUp = () => {
      down = false;
    };

    dom.addEventListener("wheel", onWheel, { passive: true });
    dom.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      dom.removeEventListener("wheel", onWheel);
      dom.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [gl]);

  // ── Interaktion pro Panel ──────────────────────────────────────────────────
  const handleClick = (item: FilmItem) => (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (dragged.current) return; // war ein Drag, kein Klick
    if (item.kind === "album") openAlbum(item);
    else openLightbox(item);
  };
  const handleOver = (item: FilmItem) => (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    hoveredId.current = item.id;
    gl.domElement.style.cursor = "pointer";
  };
  const handleOut = () => {
    hoveredId.current = null;
    gl.domElement.style.cursor = "grab";
  };

  // ── Render-Loop ─────────────────────────────────────────────────────────────
  useFrame((_, dt) => {
    const d = Math.min(dt, 0.05); // gegen Sprünge bei Tab-Wechsel deckeln

    // Sanftes Dauer-Driften (der Streifen „läuft"), plus Nutzereingabe im target.
    if (useThemeStore.getState().view === "canvas") target.current += d * 0.25;

    // Trägheit: scroll nähert sich exponentiell dem Ziel → weiche Inertia.
    const prev = scroll.current;
    scroll.current = THREE.MathUtils.damp(scroll.current, target.current, 6, d);

    // Momentane Geschwindigkeit, normiert und geglättet für die Shader.
    const raw = (scroll.current - prev) / Math.max(d, 1e-4); // Einheiten/s
    velocity.current = THREE.MathUtils.damp(
      velocity.current,
      THREE.MathUtils.clamp(raw * 0.35, -1, 1),
      10,
      d,
    );
    setVelocity(velocity.current);

    // Filter-Crossfade: erst aus-, dann Liste tauschen, dann wieder einblenden.
    if (pending.current) {
      fade.current = THREE.MathUtils.damp(fade.current, 0, 9, d);
      if (fade.current < 0.02) {
        setRenderItems(pending.current);
        pending.current = null;
      }
    } else {
      fade.current = THREE.MathUtils.damp(fade.current, 1, 9, d);
    }

    const total = renderItems.length * STRIDE;

    for (let i = 0; i < renderItems.length; i++) {
      const mesh = meshRefs.current[i];
      const mat = matRefs.current[i];
      if (!mesh || !mat) continue;

      // Unendliche Schleife per Modulo: Basisposition i*STRIDE, um den Scroll
      // verschoben, dann in das zentrierte Intervall [-total/2, total/2) gefaltet.
      // So taucht ein links hinausgeschobenes Panel rechts wieder auf (und
      // umgekehrt) — ein echter Ringpuffer ohne Nachladen/Neuinstanzieren.
      let x = i * STRIDE - scroll.current;
      x = ((x % total) + total) % total; // → [0, total)
      if (x > total / 2) x -= total; // → [-total/2, total/2)
      mesh.position.x = x;
      mesh.position.y = layout[i].y;

      // Das Band weicht zu den Rändern hin in die Tiefe zurück und dreht leicht
      // ein → zusammen mit der statischen Gruppen-Neigung ein nach hinten
      // angeschrägter Verlauf im Z-Raum. (frustumCulled greift zusätzlich.)
      mesh.position.z = -Math.abs(x) * 0.16;
      mesh.rotation.y = -x * 0.03;

      // Textur zuweisen (imperativ statt als Prop — vermeidet die aus dem
      // null-Default abgeleitete Prop-Typisierung des Uniforms).
      if (mat.uTexture !== textures[i]) mat.uTexture = textures[i];

      // Uniforms aktualisieren.
      mat.uTime += d;
      mat.uVelocity = velocity.current;
      mat.uOpacity = fade.current;

      // Hover weich interpolieren.
      const targetHover = hoveredId.current === renderItems[i].id ? 1 : 0;
      mat.uHovered = THREE.MathUtils.damp(mat.uHovered, targetHover, 8, d);

      // Bildseitenverhältnis für cover-Mapping (sobald die Textur geladen ist).
      const img = mat.uTexture?.image as { width?: number; height?: number } | undefined;
      if (img?.width && img?.height) mat.uImageSize.set(img.width, img.height);
    }
  });

  return (
    // Statische Gruppen-Neigung: der ganze Streifen ist leicht nach hinten
    // angeschrägt (Y-/X-Rotation) — Basis des artistic „ins Bild laufenden" Bands.
    <group rotation={[0.05, 0.16, 0]}>
      {renderItems.map((item, i) => (
        <mesh
          key={item.id}
          ref={(el) => {
            meshRefs.current[i] = el;
          }}
          onClick={handleClick(item)}
          onPointerOver={handleOver(item)}
          onPointerOut={handleOut}
        >
          {/* Segmentierte Ebene in echter Panel-Größe (Hoch/Quer); genug
              Unterteilungen, damit die Vertex-Wölbung glatt bleibt. */}
          <planeGeometry args={[layout[i].w, layout[i].h, 24, 24]} />
          <filmShaderMaterial
            ref={(el) => {
              matRefs.current[i] = el as FilmShaderMaterialImpl | null;
            }}
            transparent
            uPlaneSize={layout[i].size}
          />
        </mesh>
      ))}
    </group>
  );
}
