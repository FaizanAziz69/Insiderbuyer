"use client";
import { createContext, useContext, useRef } from "react";
import { candidatesForClaim } from "@/lib/editorial-thumbs";

/**
 * One thumbnail registry for the WHOLE home page.
 *
 * George's rule (2026-09-03): every cover must match its article's topic, must
 * come from the editorial-thumbs library, and **no image may appear twice on
 * the home page**. `assignEditorialThumbs` already does topic matching and
 * dedupe, but it works on one list — and the home page is four sections that
 * each fetch their own data, so nothing could see the whole page at once and
 * duplicates were unavoidable.
 *
 * This is that missing shared view. Sections claim covers as they render; a
 * claim is memoised per slug, so re-renders and SWR revalidations never
 * reshuffle the page. Render order decides priority, which is why Top Stories
 * — rendered first in app/page.tsx — gets first pick of the best-matching
 * image, and later sections fall to their next-best unused candidate.
 */
export interface ThumbClaim {
  slug: string;
  ticker?: string | null;
  sector?: string | null;
  title?: string | null;
  tags?: string[] | null;
}

interface Registry {
  claim: (item: ThumbClaim) => string | null;
}

const Ctx = createContext<Registry | null>(null);

export function HomeThumbRegistry({ children }: { children: React.ReactNode }) {
  // Refs, not state: claiming happens during render and must not re-render the
  // tree. The assignment for a slug is stable once made, so reading it again
  // is pure from React's point of view.
  const assigned = useRef(new Map<string, string | null>());
  const used = useRef(new Set<string>());

  const claim = (item: ThumbClaim): string | null => {
    const key = (item.slug || "").toLowerCase();
    if (!key) return null;
    if (assigned.current.has(key)) return assigned.current.get(key) ?? null;

    const cands = candidatesForClaim({
      seed: key,
      ticker: item.ticker,
      sector: item.sector,
      // The headline is folded into the tag list so keyword matching sees the
      // subject's name — "Buffett", "Pelosi", "Uber" — and not just the slug.
      tags: [...(item.tags || []), ...(item.title ? item.title.split(/\s+/) : [])],
    });
    const free = cands.find((c) => !used.current.has(c));
    // Every candidate already on the page: take the best match anyway rather
    // than render nothing. A repeat is better than an empty card, and this
    // only happens once the library is exhausted.
    const chosen = free ?? cands[0] ?? null;
    if (chosen) used.current.add(chosen);
    assigned.current.set(key, chosen);
    return chosen;
  };

  return <Ctx.Provider value={{ claim }}>{children}</Ctx.Provider>;
}

/**
 * Returns the page-unique cover for an article, or `undefined` when there is
 * no registry above (any page that is not the home page), which tells
 * AiCoverImage to compute its own as before.
 */
export function useHomeThumb(item: ThumbClaim | null | undefined): string | null | undefined {
  const reg = useContext(Ctx);
  if (!reg || !item?.slug) return undefined;
  return reg.claim(item);
}
