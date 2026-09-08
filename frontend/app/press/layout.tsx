import type { Metadata } from "next";
import Script from "next/script";
import { Archivo, IBM_Plex_Mono, Nunito_Sans } from "next/font/google";

/** Brief v3 §3 design system: Archivo display / Nunito Sans body / IBM Plex
 *  Mono for data. Loaded only on the B2B routes, exposed as CSS variables. */
const archivo = Archivo({ subsets: ["latin"], weight: ["600", "700", "800", "900"], variable: "--b2b-display", display: "swap" });
const nunito = Nunito_Sans({ subsets: ["latin"], weight: ["400", "600", "700", "800"], variable: "--b2b-body", display: "swap" });
const plex = IBM_Plex_Mono({ subsets: ["latin"], weight: ["500", "600"], variable: "--b2b-mono", display: "swap" });

export const metadata: Metadata = {
  title: "Build Instant Authority — Press Publishing for Public Companies | InsiderBuying.com",
  description:
    "Announce your company news to global investors, financial advisors and analysts. Get your story published on major news sites and on InsiderBuying.com — order today, published by Sunday.",
};

const GA_B2B = process.env.NEXT_PUBLIC_GA_ID_B2B || "";

export default function PressLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {GA_B2B && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_B2B}`} strategy="afterInteractive" />
          <Script id="ga4-b2b" strategy="afterInteractive">
            {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GA_B2B}');`}
          </Script>
        </>
      )}
      {/* Marks the route as chrome-free — see AppShell and globals.css. */}
      <div data-bare-page className={`${archivo.variable} ${nunito.variable} ${plex.variable}`}>
        {children}
      </div>
    </>
  );
}
