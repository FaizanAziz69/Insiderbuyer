"use client";
import { useEffect } from "react";

/**
 * Registers the service worker (public/sw.js).
 *
 * Registration is what makes the app installable on Android — Chrome will not
 * offer "Install app" without a worker carrying a fetch handler. Deliberately
 * fire-and-forget: if it fails the site carries on exactly as before, because
 * nothing here depends on the worker.
 *
 * Registered after load so it never competes with the first paint or the
 * market-data fetches, and skipped on localhost so a dev build is never
 * cached into the next session.
 */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (window.location.hostname === "localhost") return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
        /* unsupported, blocked, or private mode — the site is unaffected */
      });
    };
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);

  return null;
}
