"use client";

import { useEffect, useRef, useState, type ComponentType, type CSSProperties } from "react";

import type { Block } from "@/themes/schema";
import type { BlockComponentProps } from "@/themes/types";
import { resolveTheme } from "@/themes/registry";
import { PreviewProvider } from "@/components/portfolio/preview-context";

type LibraryPhoto = {
  storageKey: string;
  blurDataUrl: string | null;
  caption: string | null;
  category: string | null;
  width: number;
  height: number;
};
type LibraryAlbum = { id: string; category: string | null; photos: LibraryPhoto[] };

/** Geräte-Presets: Breite des gerenderten Portfolios in der Vorschau. */
const DEVICES = {
  desktop: { label: "Desktop", width: null as number | null },
  tablet: { label: "Tablet", width: 820 },
  mobile: { label: "Handy", width: 390 },
} as const;
type Device = keyof typeof DEVICES;

interface LivePreviewProps {
  blocks: Block[];
  theme: string;
  /** Globale Farb-/Schrift-Tokens der Website (siehe `deriveSubpageTokens`). */
  tokenOverrides?: Record<string, string>;
  library: LibraryAlbum[];
  activeBlockId: string | null;
  onSelectBlock: (id: string) => void;
}

/**
 * Live-Vorschau des Portfolios im Editor. Rendert die ECHTEN Theme-Komponenten
 * (dieselben wie auf der öffentlichen Seite), sodass die Vorschau exakt dem
 * Ergebnis entspricht. Album-Galerien werden clientseitig aus der Mediathek
 * aufgelöst (spiegelt `resolveGalleryBlocks` server-seitig). Ein Klick auf einen
 * Block wählt ihn aus; der aktive Block wird hervorgehoben und in Sicht gescrollt.
 */
export function LivePreview({
  blocks,
  theme,
  tokenOverrides,
  library,
  activeBlockId,
  onSelectBlock,
}: LivePreviewProps) {
  const [device, setDevice] = useState<Device>("desktop");
  const active = resolveTheme(theme);
  const resolved = resolveBlocks(blocks, library);
  // Reihenfolge wie in `BlockRenderer`: Theme-Tokens als Basis, darüber die
  // globalen Website-Tokens — sonst zeigte die Vorschau ein anderes Design als
  // die veröffentlichte Unterseite.
  const themeStyle = {
    ...(active.tokens ?? {}),
    ...(tokenOverrides ?? {}),
  } as CSSProperties;

  const scrollRef = useRef<HTMLDivElement>(null);
  const blockRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Aktiven Block sanft in Sicht scrollen (z.B. bei Auswahl links im Editor).
  useEffect(() => {
    if (!activeBlockId) return;
    blockRefs.current[activeBlockId]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeBlockId]);

  const frameWidth = DEVICES[device].width;

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border bg-surface">
      {/* Kopfleiste: Geräte-Umschalter */}
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted">Vorschau</span>
        <div className="inline-flex overflow-hidden rounded-lg border">
          {(Object.keys(DEVICES) as Device[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setDevice(key)}
              aria-pressed={device === key}
              title={DEVICES[key].label}
              className={`flex h-8 w-9 items-center justify-center transition ${
                device === key ? "bg-accent text-[hsl(var(--accent-ink))]" : "hover:bg-canvas"
              }`}
            >
              <DeviceIcon device={key} />
            </button>
          ))}
        </div>
      </div>

      {/* Vorschaufläche (eigener Scroll-Container) */}
      <div ref={scrollRef} className="flex-1 overflow-auto bg-canvas/40 p-3">
        {resolved.length === 0 ? (
          <div className="grid h-full min-h-64 place-items-center text-center text-sm text-muted">
            Noch keine Blöcke — die Vorschau erscheint hier.
          </div>
        ) : (
          <div
            className="mx-auto overflow-hidden rounded-lg border bg-canvas shadow-sm transition-[max-width] duration-200"
            style={frameWidth ? { maxWidth: frameWidth } : undefined}
          >
            {/* Theme-Wrapper: setzt die Design-Tokens als CSS-Variablen — wie im
                echten BlockRenderer, damit die Vorschau farb-/schriftgetreu ist.
                PreviewProvider=true → Kontaktformular sendet in der Vorschau nicht. */}
            <PreviewProvider value={true}>
            <div style={themeStyle} data-theme={active.name} className="bg-canvas font-sans text-ink">
              {resolved.map((block, index) => {
                const Component = active.blocks[block.type] as ComponentType<
                  BlockComponentProps<Block>
                >;
                const isActive = block.id === activeBlockId;
                return (
                  <div
                    key={block.id}
                    ref={(el) => {
                      blockRefs.current[block.id] = el;
                    }}
                    onClick={() => onSelectBlock(block.id)}
                    className={`relative cursor-pointer outline-2 -outline-offset-2 transition ${
                      isActive
                        ? "outline outline-blue-500"
                        : "outline-transparent hover:outline hover:outline-blue-300"
                    }`}
                  >
                    {Component ? (
                      <Component block={block} index={index} />
                    ) : (
                      <div className="p-4 text-sm text-muted">Unbekannter Block „{block.type}".</div>
                    )}
                  </div>
                );
              })}
            </div>
            </PreviewProvider>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Client-seitiges Gegenstück zu `resolvePageBlocks` (Server): löst datengetriebene
 * Blöcke aus der bereits geladenen Mediathek auf. Reine Funktion.
 *  - `gallery` mit `albumId` → Foto-Keys des Albums.
 *  - `portfolioGrid` → kuratierte `photoKeys` zu vollen `items` (effektive
 *    Kategorie `photo.category ?? album.category`).
 */
function resolveBlocks(blocks: Block[], library: LibraryAlbum[]): Block[] {
  const keysByAlbum = new Map(library.map((a) => [a.id, a.photos.map((p) => p.storageKey)]));
  const byKey = new Map<string, { photo: LibraryPhoto; albumCategory: string | null }>();
  for (const a of library) {
    for (const p of a.photos) byKey.set(p.storageKey, { photo: p, albumCategory: a.category });
  }

  return blocks.map((block) => {
    if (block.type === "gallery") {
      const { albumId, photoKeys } = block.data;
      if (!albumId || photoKeys.length > 0) return block;
      return { ...block, data: { ...block.data, photoKeys: keysByAlbum.get(albumId) ?? [] } };
    }

    if (block.type === "portfolioGrid") {
      const items = block.data.photoKeys
        .map((key) => byKey.get(key))
        .filter((hit): hit is NonNullable<typeof hit> => Boolean(hit))
        .map(({ photo, albumCategory }) => ({
          key: photo.storageKey,
          category: photo.category ?? albumCategory ?? null,
          caption: photo.caption,
          width: photo.width,
          height: photo.height,
          blurDataUrl: photo.blurDataUrl,
        }));
      return { ...block, data: { ...block.data, items } };
    }

    return block;
  });
}

/** Kleine Geräte-Icons (Lucide-Stil, 20×20). */
function DeviceIcon({ device }: { device: Device }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  if (device === "desktop") {
    return (
      <svg {...common} aria-hidden>
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <path d="M8 21h8M12 17v4" />
      </svg>
    );
  }
  if (device === "tablet") {
    return (
      <svg {...common} aria-hidden>
        <rect x="4" y="2" width="16" height="20" rx="2" />
        <path d="M12 18h.01" />
      </svg>
    );
  }
  return (
    <svg {...common} aria-hidden>
      <rect x="6" y="2" width="12" height="20" rx="2" />
      <path d="M12 18h.01" />
    </svg>
  );
}
