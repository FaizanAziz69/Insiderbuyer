/**
 * Static assets come from CloudFront, not from the origin box.
 *
 * Measured 2026-09-12 from Pakistan, the same chunk at the same minute: TTFB
 * 0.27-0.39s from the edge against 0.86-1.02s from the origin, because
 * connect + TLS to Virginia costs ~600ms before a byte moves. The homepage
 * pulls 19 files / 339 KB of JS and CSS, so that tax was being paid 19 times
 * on a first visit.
 *
 * No new infrastructure: distribution E26GMBXEUIC7CO (img.insiderbuying.com)
 * already has this nginx as its origin, so /_next/static/* is simply another
 * path on it. The one thing it needed is a CORS response-headers policy —
 * the font URLs inside the CSS are root-relative, so once the CSS is served
 * from the CDN the fonts are a cross-origin fetch and the origin sends no
 * Access-Control-Allow-Origin.
 *
 * next/image is not used anywhere in this app, which matters: the managed
 * CachingOptimized policy on that distribution strips query strings, and
 * /_next/image is the one asset path that needs them. /_next/static/* files
 * are hash-named and query-free.
 *
 * Roll back by setting this to "" and redeploying.
 */
const ASSET_CDN = "https://img.insiderbuying.com";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  assetPrefix: ASSET_CDN || undefined,
  // Link previews (WhatsApp, iMessage, Telegram, X, Slack…) read <head> only.
  // Next 15 streams metadata into the body on dynamically rendered pages
  // unless the UA is in this list, so the og:image never reached WhatsApp
  // (2026-09-10, the Thiel story unfurled without a picture). Broad on
  // purpose; nginx bypasses the HTML cache for the same UAs so a browser's
  // cached copy is never handed to a bot.
  htmlLimitedBots:
    /WhatsApp|facebookexternalhit|Facebot|Twitterbot|LinkedInBot|Slackbot|Discordbot|TelegramBot|SkypeUriPreview|Applebot|iMessage|Googlebot|bingbot|DuckDuckBot|redditbot|Pinterest|Embedly|vkShare|Snapchat|Viber|Line\//i,
  // NOTE: /api/backend/* is proxied by app/api/backend/[...path]/route.ts, not
  // by a rewrite. rewrites() runs at build time, which baked BACKEND_URL into
  // the deployment and made env-var changes take effect only after a rebuild.
  // Static images live in /public and were being served by the Node process
  // with Cache-Control: max-age=0 — every card image was re-fetched on every
  // page view (measured 2026-08-24: ~1.2s TTFB per image). nginx now serves
  // these paths straight from disk; this is the same promise for any request
  // that still reaches Next.
  async headers() {
    const cache = (value) => [{ key: "Cache-Control", value }];
    return [
      { source: "/editorial-thumbs/:path*", headers: cache("public, max-age=2592000") },
      { source: "/sales/:path*", headers: cache("public, max-age=2592000") },
      { source: "/investors/:path*", headers: cache("public, max-age=2592000") },
      { source: "/sounds/:path*", headers: cache("public, max-age=2592000") },
      { source: "/og-image.png", headers: cache("public, max-age=604800") },
      { source: "/logo-wordmark-dark-text.png", headers: cache("public, max-age=604800") },
      { source: "/logo-wordmark-light-text.png", headers: cache("public, max-age=604800") },
    ];
  },

  async redirects() {
    return [
      // "Top Research Firms" page retired (client spec: individual analysts
      // only) — old links land on the consolidated Top Analysts view.
      { source: "/top-analysts", destination: "/analyst-ratings", permanent: true },
      // The beehiiv-style sales draft was approved and now IS /premium
      // (client 2026-08-24) — the review URL keeps working.
      { source: "/premium-preview", destination: "/premium", permanent: false },
    ];
  },
};

module.exports = nextConfig;
