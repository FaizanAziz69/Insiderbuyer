"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * True on standalone pages that opt out of the consumer experience by
 * rendering a [data-bare-page] marker (see AppShell's BARE_ROUTES note).
 *
 * Path checks are not enough for the B2B site: press.insiderbuying.com maps
 * the host root onto /press in nginx, so the browser path is "/" and every
 * pathname gate fails — the funnel popups and the activity toast's cha-ching
 * fired on the B2B page (George, 2026-09-01). The marker is host-agnostic.
 */
export function useBarePage(): boolean {
  const pathname = usePathname();
  const [bare, setBare] = useState(false);
  useEffect(() => {
    setBare(!!document.querySelector("[data-bare-page]"));
  }, [pathname]);
  return bare;
}
