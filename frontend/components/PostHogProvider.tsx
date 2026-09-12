"use client";
import { useEffect } from "react";
import { initPostHog } from "@/lib/analytics";
import { isB2bSurface } from "@/lib/b2b-host";

/** Initializes PostHog once on the client (source super-property, attribution,
 *  PII scrubbing, session recording). Renders nothing. */
export function PostHogProvider() {
  useEffect(() => {
    // The B2B site is measured separately (brief 4D) — keep IR traffic out of
    // the consumer product analytics.
    if (isB2bSurface()) return;

    // After the page is up, not during it. array.js plus the session recorder
    // measured 1.4s on a cold load from Pakistan, on the same connection the
    // page's own chunks were still fighting for. The idle timeout keeps it
    // within ~2s either way, which is what the flag-gated UI waits on.
    let idle = 0;
    let timer = 0;
    const schedule = () => {
      const w = window as Window & {
        requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      };
      if (typeof w.requestIdleCallback === "function") {
        idle = w.requestIdleCallback(() => initPostHog(), { timeout: 2000 });
      } else {
        timer = window.setTimeout(() => initPostHog(), 1200);
      }
    };
    if (document.readyState === "complete") schedule();
    else window.addEventListener("load", schedule, { once: true });

    return () => {
      window.removeEventListener("load", schedule);
      const w = window as Window & { cancelIdleCallback?: (h: number) => void };
      if (idle && typeof w.cancelIdleCallback === "function") w.cancelIdleCallback(idle);
      if (timer) clearTimeout(timer);
    };
  }, []);
  return null;
}
