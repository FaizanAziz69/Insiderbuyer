"use client";

/**
 * Reading a board the API now shapes by subscription.
 *
 * George 2026-09-24: "plesae paygate the new wealth tracker and CQS data."
 * Those endpoints used to hand the same payload to everyone and the gate lived
 * only in the browser, so the values a subscription pays for were one `curl`
 * away. The backend shapes the response now — which means a subscriber's
 * request has to carry their token, and the shared `fetcher` in lib/api.ts
 * deliberately sends no headers at all.
 *
 * Two things therefore have to change together, and this file holds both:
 *
 *  1. The fetch attaches `Authorization`.
 *  2. The SWR KEY changes once a token is known. Signed-out keys stay exactly
 *     as they are, so the SSR seed in lib/ssr/manifest.json still matches and
 *     the free board still paints instantly in the document (and for
 *     Googlebot). A signed-in reader asks under a different key, which the seed
 *     does not cover — so it is fetched fresh rather than inheriting the free
 *     payload. That last part is not a nicety: `SwrFallback` exempts a seeded
 *     key from its FIRST revalidation, so without a distinct key a paying
 *     subscriber would sit looking at locks until the ISR window turned over.
 *
 * The key is an array, not a URL with `&auth=1` bolted on: SWR hashes array
 * keys, it cannot collide with a seeded string key, and no stray parameter
 * reaches the API or the access logs.
 *
 * The token is read in an EFFECT, never during render. Reading localStorage
 * while rendering makes the server's markup and the client's first render
 * disagree and hydration throws the result away — the same failure that kept
 * the theme from sticking (ThemeSync.tsx) and that lib/score-window.ts is
 * written around. So the first client render asks under the signed-out key,
 * exactly as the server did, and switches to the authenticated one a tick
 * later.
 */

import { useEffect, useState } from "react";
import useSWR, { SWRConfiguration } from "swr";
import { getAuthToken, useAuth } from "@/lib/auth";

export type PremiumKey = [string, string] | string | null;

/** Fetcher for `usePremiumSWR`. Handles both key shapes, so one fetcher serves
 *  a page whether or not anyone is signed in. */
export async function premiumFetcher<T>(key: [string, string] | string): Promise<T> {
  const [url, token] = Array.isArray(key) ? key : [key, null];
  const res = await fetch(url, {
    cache: "no-store",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

/** The bearer token, once the browser has one. Null on the server and on the
 *  first client render, so hydration matches. Re-read whenever the signed-in
 *  user changes, which is what makes a board flip on sign-in and sign-out
 *  without a refresh. */
function useBearerToken(): string | null {
  const { user } = useAuth();
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    setToken(user ? getAuthToken() : null);
  }, [user]);
  return token;
}

/**
 * `useSWR` for an entitlement-shaped endpoint. Same signature as a normal
 * `useSWR(url, fetcher, opts)` call; pass `null` as the url to skip the fetch.
 */
export function usePremiumSWR<T>(url: string | null, config?: SWRConfiguration) {
  const token = useBearerToken();
  const key: PremiumKey = url ? (token ? [url, token] : url) : null;
  return useSWR<T>(key, premiumFetcher as (k: PremiumKey) => Promise<T>, config);
}
