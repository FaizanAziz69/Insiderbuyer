import Script from "next/script";

/**
 * Google Analytics 4 (client tag, supplied 2026-08-24).
 *
 * The site is an App Router SPA, so client-side navigations are NOT separate
 * document loads. GA4's enhanced measurement counts them through browser
 * history events, which is on by default in the property — so this installs
 * the tag exactly as Google issues it and does NOT fire its own page_view on
 * route change (doing both is the classic way to double-count every page).
 * If history-change measurement is ever switched off in the GA4 property,
 * that is where to turn it back on rather than adding a second page_view here.
 *
 * `afterInteractive` keeps the tag off the critical path — it loads after
 * hydration, so it cannot delay first paint on the stock pages.
 */
const GA_ID = process.env.NEXT_PUBLIC_GA_ID || "G-YMPMV3NJMP";

export function GoogleAnalytics() {
  if (!GA_ID) return null;
  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
        strategy="afterInteractive"
      />
      <Script id="ga-init" strategy="afterInteractive">
        {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GA_ID}');`}
      </Script>
    </>
  );
}
