import type { BlockComponentProps } from "../../types";
import type { BlockOf } from "../../schema";
import { mediaUrl } from "@/lib/media";

/**
 * Hero im „immersive"-Theme: bildschirmfüllendes Bild mit großem, gesperrtem
 * Versal-Display-Titel (kontrastreiche Serife). Ohne Bild ein ruhiger,
 * typografischer Vollflächen-Titel.
 */
export function Hero({ block }: BlockComponentProps<BlockOf<"hero">>) {
  const { headline, subline, imageKey, align } = block.data;
  const alignClass =
    align === "left" ? "items-start text-left" : align === "right" ? "items-end text-right" : "items-center text-center";

  return (
    <section
      className={`relative flex min-h-[92vh] flex-col justify-end overflow-hidden px-4 pb-[8vh] pt-24 sm:px-8 ${alignClass}`}
    >
      {imageKey && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={mediaUrl(imageKey, "full")}
            alt=""
            className="absolute inset-0 -z-10 h-full w-full object-cover"
          />
          <div className="absolute inset-0 -z-10 bg-gradient-to-t from-black/45 via-black/5 to-black/10" />
        </>
      )}
      <div className={`flex max-w-4xl flex-col ${imageKey ? "text-white" : "text-ink"}`}>
        <h1 className="font-display text-5xl font-normal uppercase leading-[0.95] tracking-[0.1em] drop-shadow-sm sm:text-8xl">
          {headline}
        </h1>
        {subline && (
          <p
            className={`mt-6 max-w-xl text-sm font-light uppercase tracking-[0.22em] ${
              imageKey ? "text-white/85" : "text-muted"
            }`}
          >
            {subline}
          </p>
        )}
      </div>
    </section>
  );
}
