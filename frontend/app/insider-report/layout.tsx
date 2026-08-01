import type { Metadata } from "next";
import { Archivo, Nunito_Sans, IBM_Plex_Mono } from "next/font/google";

export const metadata: Metadata = {
  title: "Insider Buying — Find out what insiders are really doing",
  description:
    "Search any stock and get its Insider Quality Score plus a full insider report, built from live SEC Form 4 filings.",
};

/* The landing page reproduces the approved static mock exactly, including its
 * typefaces — scoped here so the rest of the site keeps its own fonts. */
const archivo = Archivo({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800", "900"],
  variable: "--irl-archivo",
  display: "swap",
});
const nunito = Nunito_Sans({
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
  variable: "--irl-nunito",
  display: "swap",
});
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--irl-mono",
  display: "swap",
});

export default function InsiderReportLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={`${archivo.variable} ${nunito.variable} ${plexMono.variable}`}>
      {children}
    </div>
  );
}
