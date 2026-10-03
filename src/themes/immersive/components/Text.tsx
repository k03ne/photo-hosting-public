import type { BlockComponentProps } from "../../types";
import type { BlockOf } from "../../schema";

/** Textabschnitt im „immersive"-Theme: editorial, serifige Überschrift. */
export function Text({ block }: BlockComponentProps<BlockOf<"text">>) {
  const { heading, body, align } = block.data;
  return (
    <section className="px-6 py-20 sm:py-28">
      <div className={`mx-auto max-w-2xl ${align === "center" ? "text-center" : "text-left"}`}>
        {heading && (
          <h2 className="mb-6 font-display text-3xl font-normal uppercase tracking-[0.12em] sm:text-4xl">
            {heading}
          </h2>
        )}
        <p className="whitespace-pre-line text-[15px] font-light leading-relaxed tracking-wide text-ink">
          {body}
        </p>
      </div>
    </section>
  );
}
