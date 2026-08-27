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

/** Editorial Playbook v2 §8 — the story types it names as evergreen, mapped to
 *  the kinds this feed actually carries. These fill slots 4–5 ahead of dated
 *  formats when editorial output is thin. */
const EVERGREEN_KINDS = new Set<BlogPostListItem["kind"]>([
  "sector-roundup",
  "topic-roundup",
  "weekly-report",
  "guide-format",
  "cluster-buy",
]);

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

  // Editorial Playbook v2 §4: articles about companies that pay us for IR
  // services "never appear in the organic Top Stories rotation". Enforced here
  // rather than left to whoever is publishing, because the one place it would
  // be forgotten is the place it matters. Sponsored articles still appear in
  // Latest News and the archive — barred from the organic rotation is not the
  // same as hidden.
  const organic = dealable.filter((i) => !i.sponsored);

  // Top Stories IS the Editorial Desk, so it takes editorial first and only
  // tops up from the general feed when editorial is thin. Because the top-up
  // now claims through the same set, whatever it borrows is off the table for
  // the blocks below instead of being silently shown twice.
  //
  // Editorial Playbook v2 §8 is exactly this, with one refinement: the five
  // slots step down automatically (newest editorial is the hero, the rest fall
  // in publish order), and "Slots 4 and 5 can hold evergreen content that does
  // not need to be breaking news". So when editorial runs short, the top-up
  // prefers the EVERGREEN kinds the manual lists for those slots — sector
  // roundups, case studies, weekly summaries, congressional trades — over
  // whatever happens to be newest in the general feed. A daily-summary in
  // slot 4 dates badly; a sector roundup does not.
  const topStories = take(
    organic.filter((i) => i.kind === "editorial"),
    CAPACITY,
  );
  topStories.push(
    ...take(
      organic.filter((i) => EVERGREEN_KINDS.has(i.kind)),
      CAPACITY - topStories.length,
    ),
  );
  // Still short (a genuinely thin feed) — anything current beats a gap, but
  // still nothing sponsored.
  topStories.push(...take(organic, CAPACITY - topStories.length));

  // Order matters: these run top-down so the freshest articles sit highest.
  const latestNews = take(dealable, CAPACITY);
  const popularArticles = take(dealable, CAPACITY);

  return {
    "top-stories": topStories,
    "latest-news": latestNews,
    "popular-articles": popularArticles,
  };
}
