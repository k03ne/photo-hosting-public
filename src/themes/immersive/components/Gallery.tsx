import type { BlockComponentProps } from "../../types";
import type { BlockOf } from "../../schema";
import { mediaUrl } from "@/lib/media";

/**
 * Galerie im „immersive"-Theme: vollflächiges, dichtes Raster (randlos, minimale
 * Fugen). Rendert die aufgelösten `photoKeys`.
 */
export function Gallery({ block }: BlockComponentProps<BlockOf<"gallery">>) {
  const { photoKeys, columns } = block.data;
  if (photoKeys.length === 0) return null;

  return (
    <section className="px-1 py-1 sm:px-1.5 sm:py-1.5">
      <div
        className="grid gap-1 sm:gap-1.5"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {photoKeys.map((key) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={key}
            src={mediaUrl(key, "thumb")}
            alt=""
            loading="lazy"
            className="aspect-square w-full object-cover"
          />
        ))}
      </div>
    </section>
  );
}
