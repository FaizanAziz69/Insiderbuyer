/*
 * InsiderBuying service worker — deliberately caches NOTHING.
 *
 * The first version cached fingerprinted /_next/static cache-first, which is
 * safe in theory (a changed file is a changed URL) but was not in practice:
 * across a day of frequent deploys a visitor could hold chunks from an older
 * build while being served newer HTML, and a chunk mismatch makes App Router
 * client navigation fail silently — clicks that do nothing. That is exactly
 * what was reported, so the caching is gone rather than tuned.
 *
 * A fetch handler still has to exist, because Chrome will not offer "Install"
 * without one. This one only adds an offline fallback for navigations and is
 * otherwise a pass-through, so the worker cannot serve anything stale.
 *
 * Bumping VERSION also deletes every cache the previous worker created, which
 * is what releases anyone currently stuck.
 */
const VERSION = "ib-v2-nocache";
const SHELL = `${VERSION}-shell`;
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((c) => c.add(OFFLINE_URL))
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
  // Everything except a page navigation is left entirely alone — no
  // respondWith, so the browser's own cache and network path are untouched.
  if (req.method !== "GET" || req.mode !== "navigate") return;
  event.respondWith(
    fetch(req).catch(() =>
      caches.match(OFFLINE_URL).then((hit) => hit || new Response("", { status: 504 })),
    ),
  );
});
