"use client";

import dynamic from "next/dynamic";
import type { ReelThemeProps } from "./ReelTheme";

/**
 * Lädt das Startseiten-Theme (R3F/Three.js) ausschließlich clientseitig und erst
 * bei Bedarf: `next/dynamic({ ssr:false })` hält Three.js aus dem Server-/Haupt-
 * Bundle heraus (nur in Client-Komponenten erlaubt). Der äußere Container trägt
 * bereits die gewählte Hintergrundfarbe, damit sie schon während des Ladens (vor
 * dem Mount der Canvas) sichtbar ist.
 */
const ReelTheme = dynamic(() => import("./ReelTheme"), {
  ssr: false,
  loading: () => (
    <div className="grid h-full place-items-center">
      <span className="animate-pulse text-3xl font-extralight tracking-[0.3em] opacity-30">
        ···
      </span>
    </div>
  ),
});

export default function ReelThemeLoader(props: ReelThemeProps) {
  const bg = props.background?.color ?? "#0b0b0d";
  return (
    <div className="fixed inset-0" style={{ background: bg }}>
      <ReelTheme {...props} />
    </div>
  );
}
