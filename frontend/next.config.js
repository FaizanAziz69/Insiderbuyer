/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // NOTE: /api/backend/* is proxied by app/api/backend/[...path]/route.ts, not
  // by a rewrite. rewrites() runs at build time, which baked BACKEND_URL into
  // the deployment and made env-var changes take effect only after a rebuild.
};

module.exports = nextConfig;
