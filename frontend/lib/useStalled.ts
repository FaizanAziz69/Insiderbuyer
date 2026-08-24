"use client";
import { useEffect, useState } from "react";

/**
 * True once a fetch has been waiting longer than `ms` without data.
 *
 * The homepage panels used to sit on "Loading…" forever when a request failed
 * or hung — the single most visible bug on the site during the client's review
 * (developer brief, Round 2, Fix 2). SWR reports `error` for a rejected
 * request, but a request that simply never resolves has no error to report, so
 * a plain timer is what turns "still loading" into "something is wrong".
 */
export function useStalled(hasData: boolean, ms = 12_000): boolean {
  const [stalled, setStalled] = useState(false);
  useEffect(() => {
    if (hasData) {
      setStalled(false);
      return;
    }
    const t = setTimeout(() => setStalled(true), ms);
    return () => clearTimeout(t);
  }, [hasData, ms]);
  return stalled;
}

/** The one message these panels show when data cannot be had right now. */
export const DATA_REFRESHING = "Data refreshing — check back shortly.";
