"use client";

/**
 * The Insider Score lookback, shared by every board that shows the score.
 *
 * George 2026-09-22: "jis jis jagha list mein insider score wahan karna ha" —
 * the toggle belongs on every list carrying the Insider Score, not just
 * /companies. Once it is on many pages the choice has to FOLLOW the reader:
 * picking 12 months on the screener and landing back on the 90-day board one
 * click later would read as a bug. So the value lives in localStorage and every
 * mounted toggle listens for changes — including from another tab.
 *
 * Why not the URL? These pages already server-render their first payload from
 * `lib/ssr/manifest.json`, which is keyed on the exact request URL. Keeping the
 * default OUT of the query string means the 90-day view stays seeded (and the
 * page still paints its data instantly); only an explicit 12-month choice adds
 * `?window=365` to the API call, which is a client fetch either way.
 */

import { useCallback, useEffect, useState } from "react";
import type { ScoreWindow } from "@/components/ScoreWindowToggle";

const KEY = "ib-score-window";
const EVENT = "ib-score-window-change";
export const DEFAULT_SCORE_WINDOW: ScoreWindow = 90;

function read(): ScoreWindow {
  try {
    return window.localStorage.getItem(KEY) === "365" ? 365 : 90;
  } catch {
    // Private mode / storage disabled — the default is a working answer.
    return DEFAULT_SCORE_WINDOW;
  }
}

/** The query suffix for an API call: empty for the default, so the seeded SSR
 *  key is untouched (see the note above). */
export function windowParam(w: ScoreWindow, leading: "?" | "&" = "&"): string {
  return w === DEFAULT_SCORE_WINDOW ? "" : `${leading}window=${w}`;
}

export function useScoreWindow(): [ScoreWindow, (w: ScoreWindow) => void] {
  // Always start at the default: reading localStorage during render would make
  // the server and client markup disagree, and hydration would throw the
  // attribute away — the exact failure that kept the theme from sticking
  // (ThemeSync.tsx, 2026-09-12). The stored value is applied on mount instead.
  const [value, setValue] = useState<ScoreWindow>(DEFAULT_SCORE_WINDOW);

  useEffect(() => {
    setValue(read());
    const sync = () => setValue(read());
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const set = useCallback((w: ScoreWindow) => {
    setValue(w);
    try {
      window.localStorage.setItem(KEY, String(w));
    } catch {
      /* the choice still holds for this page */
    }
    // `storage` does not fire in the tab that wrote it, so tell this one too.
    window.dispatchEvent(new Event(EVENT));
  }, []);

  return [value, set];
}
