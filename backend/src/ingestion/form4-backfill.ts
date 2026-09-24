/**
 * Twelve months of Form 4 history for every issuer we already track.
 *
 * George 2026-09-24: "something not right with the new 12 month score feature
 * … the insider buys are all the same … its not picking up other buys
 * throughout the period." The toggle was right; the history behind it was not.
 * Measured on prod that day: of 423 companies scored in BOTH windows, 368 (87%)
 * returned byte-identical buyer counts, filing counts and dollars at 90 days
 * and at 12 months. The reason is coverage, not code — 2,704 of the 4,308 open
 * market buys on file (63%) were filed in the eight weeks to 2026-09-24, while
 * the eleven months before them held 1,238 between them (~112/month against a
 * current ~1,350/month). For most tickers the 12-month window had nothing older
 * to find.
 *
 * The daily cron reads the market-wide EFTS feed, which is capped per 4-day
 * chunk and silently drops busy filers (the same failure that left NVIDIA with
 * 3 rows for 2018–2026 and prompted `ingestCompany`). This walks our own
 * issuer list instead and pulls each one's EDGAR submissions index, which is
 * complete per company.
 *
 * Chunked like every other backfill in this file: call with `after` until
 * `remaining` is 0, then rescore BOTH windows. It never deletes; a filing
 * already in `processed_filings` is skipped, so re-running is free.
 */
export type Form4BackfillResult = {
  /** Companies whose EDGAR index we read this call. */
  scanned: number;
  /** Form 4s those companies had inside the window. */
  filings: number;
  /** Form 4s already in `processed_filings` (previous runs, daily cron). */
  skipped: number;
  /** Qualifying insider transactions written this call. */
  transactions: number;
  /** Companies whose EDGAR index could not be read (no CIK match, 403, 404). */
  failed: number;
  /** Companies still to go after this call. */
  remaining: number;
  /** Pass back as `after` on the next call. Null when the sweep is done. */
  cursor: string | null;
  /** True once `remaining` is 0 — the caller stops here and rescores. */
  done: boolean;
};

/** SEC asks for ≤10 requests/second and a declared user agent. The submissions
 *  index is one request per company, so the sweep is paced by the per-FILING
 *  fetch below, not by this. */
export const BACKFILL_COMPANY_DELAY_MS = 150;
export const BACKFILL_FILING_DELAY_MS = 120;

/** Default issuers per call. Sized so one HTTP call stays well inside the
 *  60s proxy timeout even when a company turns out to have 200 unseen
 *  filings — the per-call budget below is the real stop. */
export const BACKFILL_DEFAULT_LIMIT = 25;

/** Wall-clock budget for one call. A company mid-flight finishes; the cursor
 *  then stops on the LAST COMPLETED company so nothing is half-ingested. */
export const BACKFILL_BUDGET_MS = 45_000;
