import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

import { buildSiteMetadata } from "@/lib/seo";

// Schriften kommen aus npm (`@fontsource-variable/*`), nicht von Google: der
// Build lud sie vorher über `next/font/google` zur BUILDZEIT aus dem Netz, und
// jeder Aussetzer bei Google ließ den Deploy mit
// „TypeError: Cannot read properties of null (reading '1')" scheitern. Mit
// `next/font/local` bleiben CSS-Variablen, Preload und Fallback-Metriken wie
// gehabt, der Build braucht aber kein Netz mehr. Es sind variable Fonts
// (Achse `wght`), nur Subset „latin" — wie zuvor.
const inter = localFont({
  src: "../../node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2",
  weight: "100 900",
  variable: "--font-sans",
  display: "swap",
});

const spaceGrotesk = localFont({
  src: "../../node_modules/@fontsource-variable/space-grotesk/files/space-grotesk-latin-wght-normal.woff2",
  weight: "300 700",
  variable: "--font-display",
  display: "swap",
});

// Elegante Serife für den Header-Font-Preset "SERIF".
const fraunces = localFont({
  src: "../../node_modules/@fontsource-variable/fraunces/files/fraunces-latin-wght-normal.woff2",
  weight: "100 900",
  variable: "--font-serif",
  display: "swap",
});

// Hohe, schmale, kontrastreiche Fashion-Serife für den Display-Schriftzug des
// „immersive"-Themes (großer Wortmark-Hero). Bewusst separat von --font-serif,
// damit der globale SERIF-Header-Preset (Fraunces) unberührt bleibt.
const cormorant = localFont({
  src: "../../node_modules/@fontsource-variable/cormorant/files/cormorant-latin-wght-normal.woff2",
  weight: "300 700",
  variable: "--font-editorial",
  display: "swap",
});

/**
 * Titel, Beschreibung, Favicon und Suchmaschinen-Freigabe kommen aus den
 * Website-Einstellungen (`/admin/pages` → Auffindbarkeit). Deshalb hier eine
 * Funktion statt eines Konstanten-Objekts — der Preis ist eine DB-Abfrage pro
 * gerendertem Dokument (gecacht wie jede andere Server-Abfrage).
 */
export async function generateMetadata(): Promise<Metadata> {
  return buildSiteMetadata();
}

// Setzt das Theme vor dem ersten Paint (kein Flash).
const themeScript = `
(function(){try{
  var t = localStorage.getItem('theme');
  var d = t ? t === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  if (d) document.documentElement.classList.add('dark');
}catch(e){}})();
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="de"
      className={`${inter.variable} ${spaceGrotesk.variable} ${fraunces.variable} ${cormorant.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}
