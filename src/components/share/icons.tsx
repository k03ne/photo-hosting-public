/**
 * Einheitliche, minimalistische Outline-Icons für die Kundengalerie.
 * Alle nutzen `currentColor`, 24×24-Raster und stroke-width 1.6.
 * Größe/Farbe kommen von außen über `className` (Default: 18×18).
 */
type IconProps = React.SVGProps<SVGSVGElement>;

function Svg({
  className = "h-[18px] w-[18px]",
  children,
  fill = "none",
  ...props
}: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={fill}
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export function HeartIcon({
  filled = false,
  ...props
}: IconProps & { filled?: boolean }) {
  return (
    <Svg fill={filled ? "currentColor" : "none"} {...props}>
      <path d="M12 20.5 4.2 12.6a4.6 4.6 0 0 1 6.5-6.5l1.3 1.3 1.3-1.3a4.6 4.6 0 0 1 6.5 6.5Z" />
    </Svg>
  );
}

export function ChatIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M20 12a7.5 7.5 0 0 1-10.9 6.7L4 20l1.3-4.1A7.5 7.5 0 1 1 20 12Z" />
    </Svg>
  );
}

export function DownloadIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 4v10" />
      <path d="m7.5 10 4.5 4.5 4.5-4.5" />
      <path d="M5 19h14" />
    </Svg>
  );
}

export function ArrowUpIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 20V5" />
      <path d="m6 11 6-6 6 6" />
    </Svg>
  );
}

export function ArrowDownIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 4v15" />
      <path d="m6 13 6 6 6-6" />
    </Svg>
  );
}

export function SunIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </Svg>
  );
}

export function MoonIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M20 14.5A8 8 0 0 1 9.5 4 7 7 0 1 0 20 14.5Z" />
    </Svg>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m6 6 12 12M18 6 6 18" />
    </Svg>
  );
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m6 9 6 6 6-6" />
    </Svg>
  );
}

export function PlayIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M8 5.5v13l11-6.5z" />
    </Svg>
  );
}

/**
 * SVG-Markup für die eingebauten PhotoSwipe-Buttons (Schließen, Zoom, Pfeile).
 * PhotoSwipe fügt diese Strings direkt als Button-Inhalt ein; über die Klasse
 * `pswp-outline` (siehe globals.css) werden sie als Outline gerendert, damit sie
 * zum restlichen Icon-Set passen. Der vertikale Zoom-Balken trägt die Original-
 * Klasse `pswp__zoom-icn-bar-v`, damit PhotoSwipe im Zoom das Plus zum Minus macht.
 */
const pswpSvg = (inner: string) =>
  `<svg aria-hidden="true" class="pswp__icn pswp-outline" viewBox="0 0 24 24" width="24" height="24">${inner}</svg>`;

export const pswpIcons = {
  closeSVG: pswpSvg('<path d="m6 6 12 12M18 6 6 18"/>'),
  arrowPrevSVG: pswpSvg('<path d="m14.5 6-6 6 6 6"/>'),
  arrowNextSVG: pswpSvg('<path d="m9.5 6 6 6-6 6"/>'),
  zoomSVG: pswpSvg(
    '<circle cx="11" cy="11" r="6.5"/>' +
      '<path d="m20.5 20.5-4.2-4.2"/>' +
      '<path d="M8 11h6"/>' +
      '<path class="pswp__zoom-icn-bar-v" d="M11 8v6"/>',
  ),
};
