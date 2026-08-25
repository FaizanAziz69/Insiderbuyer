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
    initPostHog();
  }, []);
  return null;
}
