/*
 * InsiderBuying service worker.
 *
 * Deliberately conservative. This site is a live market-data product: a stale
 * price or a cached Insider Score is worse than a slow one, so NOTHING from
 * /api is ever served from cache. The worker exists for two reasons only:
 *
 *   1. Android will not offer "Install app" without a fetch handler.
 *   2. An installed app that opens to a blank page on a dropped connection
 *      looks broken, so navigations fall back to a tiny offline shell.
 *
 * Static build assets are cache-first because Next.js fingerprints their
 * filenames — a changed file is a changed URL, so it can never go stale.
 */
const VERSION = "ib-v1";
const SHELL = `${VERSION}-shell`;
const ASSETS = `${VERSION}-assets`;
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((c) => c.addAll([OFFLINE_URL, "/pwa/icon-192.png"]))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin) return;

  // Never cache data, auth or billing. Freshness is the product here.
  if (
    url.pathname.startsWith("/api") ||
    url.pathname.startsWith("/auth") ||
    url.pathname.includes("/billing")
  ) {
    return;
  }

  // Fingerprinted build output: cache-first, safe by construction.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(ASSETS).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  // Page navigations: network first, offline shell as the last resort.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() =>
        caches.match(OFFLINE_URL).then((hit) => hit || new Response("", { status: 504 })),
      ),
    );
  }
});
