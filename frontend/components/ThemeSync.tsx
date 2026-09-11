"use client";

import { useEffect } from "react";

/**
 * Puts the reader's saved theme back on <html> after hydration.
 *
 * WHY THIS EXISTS. The inline script in the root layout sets data-theme before
 * first paint, which is the only place it can go without a flash. But <html> is
 * React's own root element and the server markup carries no data-theme, so
 * hydration reconciles the attribute away again: measured on prod 2026-09-12,
 * localStorage held "dark" while the live document had only lang and class on
 * <html>, and :root fell back to the light palette. The home page hid it — its
 * surface is dark whatever the token says — so the bug read as "dark works,
 * then the article opens white" (client, 2026-09-12).
 *
 * Re-applying on mount happens after hydration, so nothing strips it. The
 * inline script still runs first and still does the flash prevention; this is
 * only the belt that puts the attribute back when React takes it off.
 */
export function ThemeSync() {
  useEffect(() => {
    const apply = () => {
      let saved: string | null = null;
      try {
        saved = localStorage.getItem("ib-theme");
      } catch {
        saved = null;
      }
      // Anything unrecognised means no choice has been made: :root is the
      // light palette, so light is the honest default.
      const theme = saved === "dark" || saved === "light" ? saved : "light";
      if (document.documentElement.getAttribute("data-theme") !== theme) {
        document.documentElement.setAttribute("data-theme", theme);
      }
    };

    apply();
    // A second tab toggled the theme, or this page came back from bfcache
    // after the reader changed it somewhere else.
    const onStorage = (e: StorageEvent) => {
      if (e.key === "ib-theme") apply();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("pageshow", apply);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("pageshow", apply);
    };
  }, []);

  return null;
}
