import type { BlockComponentProps } from "../types";
import type { BlockOf } from "../schema";
import { HeroScatterView } from "@/components/portfolio/HeroScatterView";

/**
 * Theme-Adapter für den `heroScatter`-Block. Für alle Themes gleich (die
 * Runtime `HeroScatterView` erbt die Theme-Token übers Styling) — daher zentral
 * und in jeder Theme-Registry referenziert.
 */
export function HeroScatter({ block }: BlockComponentProps<BlockOf<"heroScatter">>) {
  const { title, subtitle, items, intensity } = block.data;
  return <HeroScatterView title={title} subtitle={subtitle} items={items} intensity={intensity} />;
}
