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
  "top-iqs",
  "sector-roundup",
  "topic-roundup",
  "weekly-report",
  "guide-format",
  "cluster-buy",
]);

/** Editorial articles eligible for the hero rotation: the newest this many. */
const ROTATION_POOL = 7;
/** A story published inside this window is fresh news and takes the hero
 *  regardless of the rotation — rotation exists for the days nothing new lands. */
// George (2026-08-30): the newest editorial must lead for its first few days,
// not just 24h — the Durant/HF story dropped to a card on day 2.
const FRESH_MS = 3 * 24 * 60 * 60_000;
/** Oldest an editorial may be and still take the hero slot. The first rotation
 *  (2026-08-29, day % 6 = 5) put a 7-day-old story in the hero — George: "yeh
 *  wala kafi days se ha". Older stories stay in the cards, never the hero. */
const HERO_MAX_AGE_MS = 5 * 24 * 60 * 60_000;

/**
 * George (2026-08-29): "every 24 hours we need to rotate the articles so that
 * there is a new story where the big one is and shift everything below it. If
 * we have the same story there for too long it will affect our brand."
 *
 * The pool is the newest ROTATION_POOL editorial articles. If the newest one
 * landed in the last 24 hours it is the hero (fresh news always wins). Otherwise
 * the hero walks through the pool one step per UTC day, and the other stories
 * keep publish order beneath it — so the block reads differently every day
 * without hiding anything. Keyed on the UTC day so server and client agree.
 */
/** Hard hero pin (George, 2026-08-30: "top stories per top per aana chahiye").
 *  While this slug is in the pool it leads regardless of rotation; the rest of
 *  the block still rotates beneath it. Clear it (null) to go back to pure rotation.
 *
 *  2026-09-01: repointed to the Anthropic/Lambda story on request — the Durant
 *  pin was still holding the hero on day 3 even though a newer editorial had
 *  published, because a pin beats both the freshness rule and HERO_MAX_AGE_MS.
 *  That is the pin's whole point, so it has to be MOVED when a new lead story
 *  lands; it does not expire on its own.
 *
 *  2026-09-04: repointed to the Markiplier/GoPro story, the new lead, then
 *  again the same day to the Vistra story (Pelosi / Thiel / Burke).
 *
 *  2026-09-05: repointed to the Burry / Lululemon story. */
export const HERO_PIN: string | null = "editorial-lulu-burry-buy-under-100-2026-09-05";

export function rotateHero(editorial: BlogPostListItem[], nowMs = Date.now()): BlogPostListItem[] {
  if (editorial.length < 2) return editorial;
  const pool = editorial.slice(0, ROTATION_POOL);
  const rest = editorial.slice(ROTATION_POOL);
  // The pin holds the hero, but it YIELDS to a strictly newer editorial
  // (2026-09-03, client: "har roz top stories update hoon"). Before this the
  // pin outranked freshness forever, so the block froze on whatever story was
  // pinned last and a newly published article could never lead — someone had
  // to edit this file every day. Now the pin only decides between stories of
  // the same or older vintage, which is what it was for.
  const pinned = HERO_PIN ? pool.find((i) => i.slug === HERO_PIN) : undefined;
  if (pinned) {
    const pinnedAt = new Date(pinned.generatedAt).getTime();
    const newer = pool.filter(
      (i) => i.slug !== pinned.slug && new Date(i.generatedAt).getTime() > pinnedAt,
    );
    if (!newer.length) return [pinned, ...pool.filter((i) => i.slug !== pinned.slug), ...rest];
  }
  const ageOf = (i: BlogPostListItem) => nowMs - new Date(i.generatedAt).getTime();
  // Hero candidates: the pool, minus anything older than HERO_MAX_AGE_MS. If
  // everything is old (a quiet week), the newest still leads rather than a gap.
  const eligible = pool.filter((i) => Number.isFinite(ageOf(i)) && ageOf(i) <= HERO_MAX_AGE_MS);
  const candidates = eligible.length ? eligible : [pool[0]];
  let heroIdx = 0;
  const newestAge = ageOf(candidates[0]);
  if (!(Number.isFinite(newestAge) && newestAge < FRESH_MS)) {
    const day = Math.floor(nowMs / 86_400_000);
    heroIdx = day % candidates.length;
  }
  const hero = candidates[heroIdx];
  return [hero, ...pool.filter((i) => i.slug !== hero.slug), ...rest];
}

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
  const topStories = take(rotateHero(organic.filter((i) => i.kind === "editorial")), CAPACITY);
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
