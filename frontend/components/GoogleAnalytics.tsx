"use client";
import { useEffect } from "react";
import { isB2bSurface } from "@/lib/b2b-host";

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
 * Injected from an effect rather than with next/script so the decision below
 * can be made at all: the B2B site is a separate GA4 data stream (Round-2
 * brief, Section 4D), and on press.insiderbuying.com the route path is "/" —
 * only the hostname says where we are, and a hostname is not knowable while
 * the server renders. A server-rendered tag would have loaded before the check
 * could run and every B2B visit would have landed in the consumer property.
 */
const GA_ID = process.env.NEXT_PUBLIC_GA_ID || "G-YMPMV3NJMP";

export function GoogleAnalytics() {
  useEffect(() => {
    if (!GA_ID) return;
    // The B2B site reports to its own stream (see app/press/layout.tsx).
    if (isB2bSurface()) return;
    if (document.getElementById("ga-consumer")) return;

    const tag = document.createElement("script");
    tag.id = "ga-consumer";
    tag.async = true;
    tag.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
    document.head.appendChild(tag);

    const init = document.createElement("script");
    init.id = "ga-consumer-init";
    init.text =
      `window.dataLayer = window.dataLayer || [];\n` +
      `function gtag(){dataLayer.push(arguments);}\n` +
      `gtag('js', new Date());\n` +
      `gtag('config', '${GA_ID}');`;
    document.head.appendChild(init);
  }, []);

  return null;
}
