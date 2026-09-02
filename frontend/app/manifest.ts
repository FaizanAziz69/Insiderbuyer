import type { MetadataRoute } from "next";

/**
 * Web app manifest — the installable app on Android and (with the meta tags in
 * layout.tsx) iOS.
 *
 * `display: "standalone"` is what removes the browser chrome once installed.
 * Icons ship in two purposes because the platforms mask differently: "any"
 * keeps the shaped monogram, "maskable" carries the safe-zone inset Android
 * launchers crop to. Shortcuts are the long-press menu on the home-screen
 * icon; they point at the pages a returning user actually opens.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "InsiderBuying.com — Insider Buying & IQ Scores",
    short_name: "InsiderBuying",
    description:
      "Track every open-market purchase by CEOs, CFOs and directors, scored by the Insider Quality Score.",
    id: "/",
    start_url: "/?source=pwa",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    // The dark brand surface: the splash and status bar match the app's own
    // chrome, so a cold launch does not flash white.
    background_color: "#070d1f",
    theme_color: "#005882",
    categories: ["finance", "business", "news"],
    lang: "en-US",
    dir: "ltr",
    icons: [
      { src: "/pwa/icon-96.png", sizes: "96x96", type: "image/png", purpose: "any" },
      { src: "/pwa/icon-128.png", sizes: "128x128", type: "image/png", purpose: "any" },
      { src: "/pwa/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa/icon-256.png", sizes: "256x256", type: "image/png", purpose: "any" },
      { src: "/pwa/icon-384.png", sizes: "384x384", type: "image/png", purpose: "any" },
      { src: "/pwa/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/pwa/icon-192-maskable.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/pwa/icon-512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "Top Insider Scores",
        short_name: "Scores",
        url: "/insiders/hot?source=pwa",
        icons: [{ src: "/pwa/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "Top Insider Buys",
        short_name: "Buys",
        url: "/insiders/top-buys?source=pwa",
        icons: [{ src: "/pwa/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "Insider Trades",
        short_name: "Trades",
        url: "/trades?source=pwa",
        icons: [{ src: "/pwa/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "My Portfolio",
        short_name: "Portfolio",
        url: "/portfolio?source=pwa",
        icons: [{ src: "/pwa/icon-192.png", sizes: "192x192" }],
      },
    ],
  };
}
