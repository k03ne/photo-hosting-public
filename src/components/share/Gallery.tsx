"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { Gallery as PhotoSwipeGallery, Item } from "react-photoswipe-gallery";
import "photoswipe/dist/photoswipe.css";

import { CommentModal } from "@/components/share/CommentModal";
import { DownloadMenu, type Quality } from "@/components/share/DownloadMenu";
import {
  ChatIcon,
  ChevronDownIcon,
  DownloadIcon,
  HeartIcon,
  pswpIcons,
} from "@/components/share/icons";
import { LightboxOverlay } from "@/components/share/LightboxOverlay";
import { ThemeToggle } from "@/components/ThemeToggle";
import { gridGapClass } from "@/lib/header-style";
import { mediaUrl, videoUrl } from "@/lib/media";
import { toggleLike } from "@/server/actions/interactions";

export type PhotoExif = {
  camera?: string;
  lens?: string;
  iso?: number;
  focalLength?: number;
  aperture?: number;
  exposure?: string;
};

export type GalleryPhoto = {
  id: string;
  storageKey: string;
  mediaType: string; // IMAGE | VIDEO
  videoKey: string | null; // abspielbare Videodatei (bei VIDEO)
  caption: string | null;
  category: string | null;
  width: number;
  height: number;
  blurDataUrl: string | null;
  likeCount: number;
  liked: boolean;
  commentCount: number;
  hasRaw: boolean;
  originalName: string; // Original-Dateiname des Uploads
  sizeBytes: number | null; // Originaldateigröße
  takenAt: string | null; // ISO-String
  exif: PhotoExif | null;
};

type Layout = "MASONRY" | "GRID" | "JUSTIFIED";

type ItemHandlers = {
  onLike: (photo: GalleryPhoto) => void;
  onComments: (photo: GalleryPhoto) => void;
  downloadUrl: (photo: GalleryPhoto) => string;
};

/**
 * Taktung der Diashow (ms). Die Blende wird mit `SLIDE_FADE_MS` per Inline-Style
 * animiert — sonst müssten CSS-Dauer und Ablaufsteuerung getrennt gepflegt werden
 * und die Überblendung ruckelte, sobald beide auseinanderlaufen.
 */
const SLIDE_HOLD_MS = 4000; // Bild sichtbar stehen lassen
const SLIDE_FADE_MS = 450; // Aus- bzw. Einblenden über Schwarz
// `pswp.next()` schaltet ohne Animation um (goTo -> moveIndexBy ohne `animate`),
// hinter der Blende ist also nur eine kurze Pause nötig, damit das neue Bild
// sicher gezeichnet ist. Längeres Warten wäre reine Totzeit im Schwarz.
const SLIDE_SWAP_MS = 120;

export function Gallery({
  photos: initial,
  layout,
  columns,
  spacing = "REGULAR",
  shareToken,
  showExif,
  showThemeToggle,
}: {
  photos: GalleryPhoto[];
  layout: Layout;
  columns: number;
  spacing?: string;
  shareToken: string;
  showExif: boolean;
  showThemeToggle: boolean;
}) {
  const cols = useResponsiveColumns(columns);
  const gap = gridGapClass(spacing);
  const [photos, setPhotos] = useState(initial);
  const [commentPhoto, setCommentPhoto] = useState<GalleryPhoto | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [favsOnly, setFavsOnly] = useState(false);
  // Lightbox-Zustand (Index in `visible`) + eingeblendete Kommentar-Spalte.
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [commentsOpen, setCommentsOpen] = useState(false);
  // Slideshow/Autoplay: laufende Diashow + Überblend-Vorhang (Schwarz).
  const [autoplay, setAutoplay] = useState(false);
  const [curtainDark, setCurtainDark] = useState(false);
  // PhotoSwipe-Instanz für Autoplay-Steuerung (next/element).
  const pswpRef = useRef<{
    next: () => void;
    element?: HTMLElement | null;
  } | null>(null);

  const singleUrl = (photo: GalleryPhoto, q: Quality) =>
    `/a/${shareToken}/download?photo=${photo.id}&quality=${q}`;
  const bulkUrl = (q: Quality) => {
    const params = new URLSearchParams({ quality: q });
    if (activeCategory) params.set("category", activeCategory);
    return `/a/${shareToken}/download?${params.toString()}`;
  };

  // Kategorien in Reihenfolge des ersten Auftretens.
  const categories = Array.from(
    new Set(photos.map((p) => p.category).filter((c): c is string => !!c)),
  );
  const anyRaw = photos.some((p) => p.hasRaw);
  const favCount = photos.filter((p) => p.liked).length;
  const visible = favsOnly
    ? photos.filter((p) => p.liked)
    : activeCategory
      ? photos.filter((p) => p.category === activeCategory)
      : photos;

  function patch(id: string, p: Partial<GalleryPhoto>) {
    setPhotos((prev) => prev.map((x) => (x.id === id ? { ...x, ...p } : x)));
  }

  async function onLike(photo: GalleryPhoto) {
    // Optimistisch umschalten, dann mit Server-Ergebnis abgleichen.
    patch(photo.id, {
      liked: !photo.liked,
      likeCount: photo.likeCount + (photo.liked ? -1 : 1),
    });
    try {
      const res = await toggleLike(photo.id);
      patch(photo.id, { liked: res.liked, likeCount: res.count });
    } catch {
      patch(photo.id, { liked: photo.liked, likeCount: photo.likeCount });
    }
  }

  const handlers: ItemHandlers = {
    onLike,
    onComments: setCommentPhoto,
    // Schnell-Download (Kachel-Hover): volle Auflösung statt kleiner Web-Größe.
    downloadUrl: (photo) => singleUrl(photo, "original"),
  };

  // Reihenfolge, in der PhotoSwipe die Items registriert (= Klick-Index).
  // In MASONRY werden die Items spaltenweise (Round-Robin) gerendert und damit
  // in einer anderen Reihenfolge als `visible` (zeilenweise) gemountet. currIndex
  // muss deshalb über diese Reihenfolge aufgelöst werden, sonst zeigt das Overlay
  // das falsche Bild und der Einzeldownload lädt die falsche Datei.
  const lightboxOrder =
    layout === "MASONRY"
      ? Array.from({ length: cols }).flatMap((_, colIdx) =>
          visible.filter((_, i) => i % cols === colIdx),
        )
      : visible;

  const lightboxPhoto =
    lightboxIndex !== null ? lightboxOrder[lightboxIndex] : undefined;

  // Autoplay-Schleife: Bild halten -> zu Schwarz ausblenden -> hinter der Blende
  // weiterschalten -> wieder einblenden. So entsteht ein sanftes Über-Schwarz-
  // Faden statt PhotoSwipes seitlichem Schieben. Jede Interaktion beendet die Show.
  useEffect(() => {
    if (!autoplay) return;
    const pswp = pswpRef.current;
    if (!pswp) {
      setAutoplay(false);
      return;
    }

    pswp.element?.classList.add("pswp--slideshow");
    let alive = true;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const wait = (ms: number) =>
      new Promise<void>((resolve) => timers.push(setTimeout(resolve, ms)));

    (async () => {
      while (alive) {
        await wait(SLIDE_HOLD_MS); // Bild sichtbar lassen
        if (!alive) break;
        setCurtainDark(true); // ausblenden (zu Schwarz)
        await wait(SLIDE_FADE_MS);
        if (!alive) break;
        pswp.next(); // hinter der Blende weiterschalten
        await wait(SLIDE_SWAP_MS); // PhotoSwipe-Slide hinter Schwarz abwarten
        if (!alive) break;
        setCurtainDark(false); // neues Bild einblenden
        await wait(SLIDE_FADE_MS);
      }
    })();

    const stop = () => setAutoplay(false);
    window.addEventListener("keydown", stop);

    return () => {
      alive = false;
      timers.forEach(clearTimeout);
      setCurtainDark(false);
      pswp.element?.classList.remove("pswp--slideshow");
      window.removeEventListener("keydown", stop);
    };
  }, [autoplay]);

  return (
    <>
      {visible.length > 0 && (
        <div className="sticky top-0 z-20 -mx-3 mb-6 border-b bg-canvas/90 px-3 py-3 backdrop-blur sm:-mx-5 sm:px-5">
          <div className="flex items-center gap-3 sm:gap-4">
            {(categories.length > 0 || favCount > 0) && (
              <>
                {/* Mobil: Kategorien als kompaktes Dropdown, damit rechts Platz
                    für Download + Theme-Umschalter bleibt. */}
                <div className="relative min-w-0 flex-1 sm:hidden">
                  <select
                    aria-label="Kategorie wählen"
                    value={
                      favsOnly ? "__favs__" : activeCategory ?? "__all__"
                    }
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "__favs__") {
                        setFavsOnly(true);
                        setActiveCategory(null);
                      } else if (v === "__all__") {
                        setFavsOnly(false);
                        setActiveCategory(null);
                      } else {
                        setFavsOnly(false);
                        setActiveCategory(v);
                      }
                    }}
                    className="w-full appearance-none truncate rounded-full border border-[hsl(var(--line))] bg-surface py-2 pl-4 pr-9 text-[11px] uppercase tracking-[0.15em] text-ink outline-none"
                  >
                    <option value="__all__">Alle ({photos.length})</option>
                    {categories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                    {favCount > 0 && (
                      <option value="__favs__">Favoriten ({favCount})</option>
                    )}
                  </select>
                  <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                </div>

                {/* Desktop: Pills als Filter, Favoriten optisch abgetrennt. */}
                <div className="hidden min-w-0 flex-1 flex-wrap items-center gap-1.5 sm:flex">
                  <CategoryTab
                    label="Alle"
                    active={!favsOnly && activeCategory === null}
                    onClick={() => {
                      setFavsOnly(false);
                      setActiveCategory(null);
                    }}
                  />
                  {categories.map((c) => (
                    <CategoryTab
                      key={c}
                      label={c}
                      active={!favsOnly && activeCategory === c}
                      onClick={() => {
                        setFavsOnly(false);
                        setActiveCategory(c);
                      }}
                    />
                  ))}
                  {favCount > 0 && (
                    <>
                      <span
                        aria-hidden
                        className="mx-1 h-5 w-px shrink-0 bg-[hsl(var(--line))]"
                      />
                      <CategoryTab
                        label={`Favoriten (${favCount})`}
                        icon={<HeartIcon filled className="h-3.5 w-3.5" />}
                        active={favsOnly}
                        onClick={() => {
                          setFavsOnly(true);
                          setActiveCategory(null);
                        }}
                      />
                    </>
                  )}
                </div>
              </>
            )}

            {/* Download-Menü + Dark/Light-Umschalter, immer rechts. Der Umschalter
                erscheint nur bei automatischem Theme (OS); bei erzwungenem
                Hell/Dunkel bzw. eigener Themefarbe wäre er wirkungslos. */}
            <div className="ml-auto flex shrink-0 items-center justify-end gap-3">
              <DownloadMenu
                hasRaw={anyRaw}
                label={
                  activeCategory ? `„${activeCategory}"` : `Alle (${photos.length})`
                }
                buildUrl={bulkUrl}
              />
              {showThemeToggle && <ThemeToggle />}
            </div>
          </div>
        </div>
      )}

      {favsOnly && visible.length === 0 && (
        <p className="py-16 text-center text-sm text-muted">
          Noch keine Favoriten — tippe auf das Herz eines Bildes.
        </p>
      )}

      <PhotoSwipeGallery
        // trapFocus:false -> sonst zieht PhotoSwipe den Fokus zurück und man
        // kann in die Kommentar-Eingabe über der Lightbox nicht tippen.
        options={{
          bgOpacity: 0.92,
          showHideAnimationType: "fade",
          trapFocus: false,
          // Eingebaute Lightbox-Icons (Schließen, Zoom, Pfeile) auf das
          // einheitliche Outline-Set umstellen.
          ...pswpIcons,
        }}
        onOpen={(pswp) => {
          pswpRef.current = pswp;
          setCommentsOpen(false);
          setLightboxIndex(pswp.currIndex);
          pswp.on("change", () => setLightboxIndex(pswp.currIndex));
          pswp.on("destroy", () => {
            pswpRef.current = null;
            setLightboxIndex(null);
            setCommentsOpen(false);
            setAutoplay(false);
          });
        }}
      >
        {layout === "GRID" && (
          <div
            className={`grid ${gap}`}
            style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
          >
            {visible.map((photo, i) => (
              <GalleryItem
                key={photo.id}
                photo={photo}
                square
                delayMs={revealDelay(i)}
                {...handlers}
              />
            ))}
          </div>
        )}

        {layout === "JUSTIFIED" && (
          <div className={`flex flex-wrap ${gap}`}>
            {visible.map((photo, i) => {
              const ratio = photo.width / Math.max(photo.height, 1);
              return (
                <div
                  key={photo.id}
                  style={{ flexGrow: ratio, flexBasis: `${ratio * 240}px` }}
                  className="relative h-60 sm:h-72"
                >
                  <GalleryItem photo={photo} fill delayMs={revealDelay(i)} {...handlers} />
                </div>
              );
            })}
            <div className="grow-[999]" />
          </div>
        )}

        {layout === "MASONRY" && (
          // Spalten per Round-Robin befüllen, damit die Lesereihenfolge
          // (links→rechts) der Backend-Sortierung entspricht. CSS column-count
          // würde spaltenweise füllen und die Reihenfolge verfälschen.
          <div className={`flex ${gap}`}>
            {Array.from({ length: cols }).map((_, colIdx) => (
              <div key={colIdx} className={`flex flex-1 flex-col ${gap}`}>
                {visible
                  .filter((_, i) => i % cols === colIdx)
                  .map((photo, j) => (
                    <GalleryItem
                      key={photo.id}
                      photo={photo}
                      delayMs={revealDelay(j * cols + colIdx)}
                      {...handlers}
                    />
                  ))}
              </div>
            ))}
          </div>
        )}
      </PhotoSwipeGallery>

      {lightboxPhoto && !autoplay && (
        <LightboxOverlay
          photo={lightboxPhoto}
          showExif={showExif}
          buildDownloadUrl={(q) => singleUrl(lightboxPhoto, q)}
          onLike={onLike}
          commentsOpen={commentsOpen}
          onToggleComments={() => setCommentsOpen((v) => !v)}
          onStartAutoplay={() => {
            setCommentsOpen(false);
            setAutoplay(true);
          }}
          onCommentAdded={(id) =>
            patch(id, {
              commentCount:
                (photos.find((p) => p.id === id)?.commentCount ?? 0) + 1,
            })
          }
        />
      )}

      {/* Autoplay-Vorhang: fängt jede Interaktion ab (beendet die Show) und
          blendet beim Bildwechsel zu Schwarz über. Liegt über der Lightbox. */}
      {autoplay && (
        <div
          onClick={() => setAutoplay(false)}
          role="button"
          aria-label="Slideshow beenden"
          // Sanfte S-Kurve statt Tailwinds ease-in-out: der Anfang der Blende
          // zieht flacher an, dadurch wirkt der Wechsel weniger abgehackt.
          style={{
            transitionDuration: `${SLIDE_FADE_MS}ms`,
            transitionTimingFunction: "cubic-bezier(0.37, 0, 0.63, 1)",
          }}
          className={`fixed inset-0 z-[100060] cursor-pointer bg-black transition-opacity ${
            curtainDark ? "opacity-100" : "opacity-0"
          }`}
        />
      )}

      <AnimatePresence>
        {commentPhoto && (
          <CommentModal
            photo={commentPhoto}
            onClose={() => setCommentPhoto(null)}
            onAdded={() =>
              patch(commentPhoto.id, {
                commentCount: commentPhoto.commentCount + 1,
              })
            }
          />
        )}
      </AnimatePresence>
    </>
  );
}

/** Ansteigender, gedeckelter Einblend-Delay pro Bild (gestaffelte Kaskade). */
function revealDelay(index: number): number {
  return Math.min(index, 14) * 45;
}

function GalleryItem({
  photo,
  square,
  fill,
  delayMs = 0,
  onLike,
  onComments,
  downloadUrl,
}: {
  photo: GalleryPhoto;
  square?: boolean;
  fill?: boolean;
  delayMs?: number;
} & ItemHandlers) {
  const [loaded, setLoaded] = useState(false);

  const wrapperClass = square
    ? "relative aspect-square"
    : fill
      ? "absolute inset-0"
      : "relative";

  return (
    <div
      className={`group overflow-hidden bg-canvas ${wrapperClass}`}
      style={
        !square && !fill && photo.width && photo.height
          ? { aspectRatio: `${photo.width} / ${photo.height}` }
          : undefined
      }
    >
      <Item
        original={mediaUrl(photo.storageKey, "full")}
        thumbnail={mediaUrl(photo.storageKey, "thumb")}
        width={photo.width}
        height={photo.height}
        caption={photo.caption ?? undefined}
      >
        {({ ref, open }) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            ref={(node) => {
              // PhotoSwipe-Ref weiterreichen (Funktions- oder Objekt-Ref)
              if (typeof ref === "function") ref(node);
              else if (ref && "current" in ref)
                (ref as React.MutableRefObject<HTMLImageElement | null>).current =
                  node;
              // Bereits aus dem Cache geladen? -> sofort einblenden (kein onLoadmehr)
              if (node?.complete && node.naturalWidth > 0) setLoaded(true);
            }}
            src={mediaUrl(photo.storageKey, "full")}
            alt={photo.caption ?? ""}
            loading="lazy"
            onClick={open}
            onLoad={() => setLoaded(true)}
            style={{ transitionDelay: `${delayMs}ms` }}
            className={`relative z-10 w-full cursor-pointer transition-all duration-700 ease-out ${
              square || fill ? "h-full object-cover" : "h-auto"
            } ${loaded ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"}`}
          />
        )}
      </Item>

      {/* Video: über dem Poster als stumme Autoplay-Schleife abspielen. Ignoriert
          Klicks (pointer-events-none), damit weiterhin die Lightbox (Poster)
          öffnet. Immer object-cover: füllt die Kachel und wird ggf. angeschnitten
          — so entstehen keine schwarzen Balken. */}
      {photo.mediaType === "VIDEO" && photo.videoKey && (
        <video
          src={videoUrl(photo.videoKey)}
          poster={mediaUrl(photo.storageKey, "full")}
          muted
          loop
          autoPlay
          playsInline
          preload="metadata"
          className="pointer-events-none absolute inset-0 h-full w-full object-cover"
        />
      )}

      {/* Interaktions-Overlay — nur auf Desktop bei Hover. Auf Mobilgeräten
          erscheinen die Icons ausschließlich in der geöffneten Lightbox. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 hidden items-center gap-4 bg-gradient-to-t from-black/40 to-transparent p-2.5 text-white opacity-0 transition-opacity duration-200 group-hover:opacity-100 sm:flex">
        <button
          type="button"
          onClick={() => onLike(photo)}
          aria-label={photo.liked ? "Gefällt mir zurücknehmen" : "Gefällt mir"}
          className="pointer-events-auto flex items-center gap-1.5 text-sm"
        >
          <HeartIcon filled={photo.liked} className="h-[18px] w-[18px]" />
          {photo.likeCount > 0 && <span className="tabular-nums">{photo.likeCount}</span>}
        </button>
        <button
          type="button"
          onClick={() => onComments(photo)}
          aria-label="Kommentare"
          className="pointer-events-auto flex items-center gap-1.5 text-sm"
        >
          <ChatIcon className="h-[18px] w-[18px]" />
          {photo.commentCount > 0 && (
            <span className="tabular-nums">{photo.commentCount}</span>
          )}
        </button>
        <a
          href={downloadUrl(photo)}
          onClick={(e) => e.stopPropagation()}
          aria-label="Bild herunterladen"
          className="pointer-events-auto ml-auto flex items-center"
        >
          <DownloadIcon className="h-[18px] w-[18px]" />
        </a>
      </div>
    </div>
  );
}

function CategoryTab({
  label,
  active,
  onClick,
  icon,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-[11px] uppercase tracking-[0.16em] transition ${
        active
          ? "border-ink bg-ink text-canvas"
          : "border-[hsl(var(--line))] text-muted hover:border-muted/60 hover:text-ink"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function useResponsiveColumns(base: number): number {
  const [cols, setCols] = useState(base);

  useEffect(() => {
    const compute = () => {
      const w = window.innerWidth;
      if (w < 640) setCols(Math.min(2, base));
      else if (w < 1024) setCols(Math.min(3, base));
      else setCols(base);
    };
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, [base]);

  return cols;
}
