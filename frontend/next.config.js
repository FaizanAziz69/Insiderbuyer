/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // NOTE: /api/backend/* is proxied by app/api/backend/[...path]/route.ts, not
  // by a rewrite. rewrites() runs at build time, which baked BACKEND_URL into
  // the deployment and made env-var changes take effect only after a rebuild.
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
