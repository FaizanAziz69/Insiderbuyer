"use client";
import { useCallback, useEffect, useState } from "react";
import { API_BASE } from "@/lib/api";

/**
 * Access to the B2B promoter datasets (George 2026-09-21: "The Promoter
 * Scores and top IR promoters data sets are not available for purchase. They
 * do not get unlocked with any subscription. Instead, put a Request Access
 * gate").
 *
 * So this deliberately does NOT read `usePremium()`. Access comes from a
 * reviewed request: the desk approves it, the visitor gets an emailed link
 * carrying a token, and the token lives in this browser from then on. A
 * paying subscriber with no approved request sees the gate, which is the
 * point — these datasets are not part of the retail subscription.
 */

const KEY = "ib_data_access_token";

export type DatasetKey = "promoter-score" | "top-ir-promoters" | "both";

function readToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function useDataAccess(dataset: DatasetKey) {
  const [granted, setGranted] = useState(false);
  const [checking, setChecking] = useState(true);
  const [company, setCompany] = useState<string | null>(null);

  const check = useCallback(
    async (token: string | null) => {
      if (!token) {
        setGranted(false);
        setChecking(false);
        return;
      }
      try {
        const res = await fetch(
          `${API_BASE}/data-access/verify?token=${encodeURIComponent(token)}&dataset=${dataset}`,
        );
        const json = (await res.json()) as { granted?: boolean; company?: string };
        setGranted(!!json.granted);
        setCompany(json.company ?? null);
        // A token that no longer opens anything is cleared, so the gate does
        // not sit there checking a dead key on every page load.
        if (!json.granted) {
          try {
            localStorage.removeItem(KEY);
          } catch {
            /* storage blocked */
          }
        }
      } catch {
        setGranted(false);
      } finally {
        setChecking(false);
      }
    },
    [dataset],
  );

  useEffect(() => {
    // The approval email links to ?access=<token>; take it, store it, and
    // strip it from the URL so the key is not left in a shared address bar.
    let token = readToken();
    try {
      const url = new URL(window.location.href);
      const fromLink = url.searchParams.get("access");
      if (fromLink) {
        token = fromLink;
        try {
          localStorage.setItem(KEY, fromLink);
        } catch {
          /* storage blocked — this session still works */
        }
        url.searchParams.delete("access");
        window.history.replaceState({}, "", url.toString());
      }
    } catch {
      /* non-browser or malformed URL */
    }
    void check(token);
  }, [check]);

  return { granted, checking, company };
}
