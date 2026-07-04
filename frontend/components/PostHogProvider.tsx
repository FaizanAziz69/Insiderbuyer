"use client";
import { useEffect } from "react";
import { initPostHog } from "@/lib/analytics";

/** Initializes PostHog once on the client (source super-property, attribution,
 *  PII scrubbing, session recording). Renders nothing. */
export function PostHogProvider() {
  useEffect(() => {
    initPostHog();
  }, []);
  return null;
}
