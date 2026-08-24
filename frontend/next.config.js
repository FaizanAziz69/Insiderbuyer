/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
