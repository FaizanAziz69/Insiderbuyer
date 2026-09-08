/**
 * ONE place for the site-wide proof numbers (Brief v4 §7, "canonical stats"):
 * every page that quotes how many filings we scan, how many stocks we track
 * or how many investors read us imports from here, so the figures can never
 * drift between pages again.
 *
 * `investors` is the social-proof line. The brief asks for the REAL subscriber
 * count rounded down to the nearest hundred; the live list is still far below
 * the marketing figure, so the page prints `max(live, floor)` — the config
 * floor until the list overtakes it, then the live count, which only ever
 * moves up. Change the floor here when the client changes the claim.
 */
export const SITE_STATS = {
  /** "We scan over 200,000 insider filings" — brief copy, verbatim. */
  filingsScanned: "200,000",
  /** "and 8,000 stock fundamentals" — the screener universe is ~9,600 names. */
  fundamentalsTracked: "8,000",
  /** Social-proof floor: "Join 17,800+ investors". */
  investorsFloor: 17_800,
} as const;

/** "17,800+" style formatting for the social-proof line. */
export const formatInvestors = (n: number): string => `${n.toLocaleString("en-US")}+`;

/** The live count wins only once it exceeds the floor (rounded down to the
 *  hundred, per the brief), so the number can tick up but never read "0+". */
export const investorsLine = (liveRoundedDown: number | null | undefined): string =>
  formatInvestors(Math.max(SITE_STATS.investorsFloor, liveRoundedDown ?? 0));
