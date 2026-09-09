"use client";
import type { ReactNode } from "react";
import { SWRConfig } from "swr";

/**
 * Seeds SWR with data the server already fetched (see lib/ssr/prefetch.ts).
 *
 * Every page used to be a client component whose hooks fetched after
 * hydration, so the HTML a crawler received had no content (George,
 * 2026-09-09). The server page now fetches each hook's first-render key and
 * passes the results here, and the hooks find them on the very first render —
 * on the server too — so the full content is in the document. The hooks are
 * untouched: same keys, same fetcher, and they still revalidate on mount so the
 * browser gets fresh data exactly as before.
 *
 * Why a seeded CACHE rather than SWR's `fallback` option: SWR does not treat
 * fallback data as "loaded", so `isLoading` stayed true on the first render and
 * every page written as `isLoading || !data ? <Skeleton/>` rendered its
 * skeleton on the server (verified on /companies/NVDA and with a bare
 * renderToString probe). A cache entry carrying the full state — data plus
 * isLoading:false / isValidating:false — counts as loaded: content renders
 * immediately and the mount revalidation runs in the background with no
 * skeleton flash.
 *
 * Server: a fresh Map per request (never the shared module-level cache, which
 * would grow with every ticker ever rendered). Client: the seed goes into the
 * PARENT cache — the app's single global SWR cache — so the page and the shell
 * (ticker tape, nav) keep sharing entries and `mutate()` keeps reaching
 * everything. Only keys not already present are seeded, so navigating to a
 * page whose data is already fresh in memory is never regressed to the
 * server's copy. Both first renders read the same data, so hydration matches.
 */
type Entry = { data: unknown; isLoading: boolean; isValidating: boolean };
type CacheLike = { get(key: string): unknown; set(key: string, value: Entry): void };

export function SwrFallback({ fallback, children }: { fallback: Record<string, unknown>; children: ReactNode }) {
  return (
    <SWRConfig
      value={{
        provider: (parent: unknown) => {
          const entries: [string, Entry][] = Object.entries(fallback).map(([key, data]) => [
            key,
            { data, isLoading: false, isValidating: false },
          ]);
          if (typeof window === "undefined") return new Map(entries);
          const cache = parent as CacheLike;
          for (const [key, entry] of entries) {
            const existing = cache.get(key) as { data?: unknown } | undefined;
            if (existing?.data === undefined) cache.set(key, entry);
          }
          return cache as unknown as Map<string, Entry>;
        },
      }}
    >
      {children}
    </SWRConfig>
  );
}
