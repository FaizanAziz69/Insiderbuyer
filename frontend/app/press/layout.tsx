import type { Metadata } from "next";
import Script from "next/script";

export const metadata: Metadata = {
  title: "InsiderBuying.com for Public Companies & Investor Relations",
  description:
    "Reach 50,000+ investors who actually follow insider buying. Press release distribution, IR campaigns and sponsored editorial from InsiderBuying.com.",
};

/** Brief 4D: "GA4 separate data stream for this subdomain so B2B traffic is
 *  tracked independently from consumer traffic." Set NEXT_PUBLIC_GA_ID_B2B to
 *  the B2B stream's measurement id; until then this page reports nothing of
 *  its own rather than polluting the consumer property. */
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
      {children}
    </>
  );
}
