import { BlogPostListItem } from "./api";

/**
 * Deals the one shared /content/blogs feed out to the homepage blocks that draw
 * from it, so no article — and therefore no headline — can appear in two blocks
 * on the same page.
 *
 * THE BUG THIS REPLACES: Top Stories, Latest Financial News and Popular
 * Articles each fetched the feed and tried to avoid each other with a hardcoded
 * index offset — `all.slice(1)` in one, `pool.slice(6)` in another — computed
 * against DIFFERENTLY FILTERED pools (one dropped `editorial`, the other kept
 * it). The windows therefore did not line up, and three cases collapsed them
 * onto the same articles:
 *   1. Top Stories topped itself up from the general feed whenever `editorial`
 *      returned fewer than 5 items, landing on the exact articles Latest News
 *      was about to show;
 *   2. Popular Articles' pool included `editorial`, so its `slice(6)` cut point
 *      drifted relative to Latest News' pool;
 *   3. `pool.length > 11 ? pool.slice(6) : pool` fell back to offset 0 on a
 *      short feed, re-rendering the articles already shown above it.
 * That is the "multiple articles showing the same headline" the client saw.
 *
 * The fix is to stop guessing at offsets: claim articles explicitly, in the
 * order the blocks appear down the page, and let each block have what is left.
 * A block rendering short is the correct outcome on a thin feed — a duplicate
 * headline is not.
 */

/** The homepage blocks that share the feed. Stock Ideas is absent on purpose:
 *  it queries `kind=stock-idea` directly and owns that kind outright. */
export type HomeSection = "top-stories" | "latest-news" | "popular-articles";

/** Each block renders one lead plus four cards. */
const CAPACITY = 5;

/**
 * @param items the raw `/content/blogs` list — pass the SAME query from every
 *              block (SWR dedupes the identical key into one request) so all
 *              three deal from an identical ordering.
 */
export function dealHomeFeed(
  items: BlogPostListItem[] | undefined,
): Record<HomeSection, BlogPostListItem[]> {
  const feed = items ?? [];
  const claimed = new Set<string>();

  /** Take up to `n` unclaimed articles from `pool`, marking them claimed. */
  const take = (pool: BlogPostListItem[], n: number): BlogPostListItem[] => {
    const out: BlogPostListItem[] = [];
    for (const item of pool) {
      if (out.length >= n) break;
      if (claimed.has(item.slug)) continue;
      claimed.add(item.slug);
      out.push(item);
    }
    return out;
  };

  // Stock ideas are never dealt here — they belong to their own section.
  const dealable = feed.filter((i) => i.kind !== "stock-idea");

  // Top Stories IS the Editorial Desk, so it takes editorial first and only
  // tops up from the general feed when editorial is thin. Because the top-up
  // now claims through the same set, whatever it borrows is off the table for
  // the blocks below instead of being silently shown twice.
  const topStories = take(
    dealable.filter((i) => i.kind === "editorial"),
    CAPACITY,
  );
  topStories.push(...take(dealable, CAPACITY - topStories.length));

  // Order matters: these run top-down so the freshest articles sit highest.
  const latestNews = take(dealable, CAPACITY);
  const popularArticles = take(dealable, CAPACITY);

  return {
    "top-stories": topStories,
    "latest-news": latestNews,
    "popular-articles": popularArticles,
  };
}
