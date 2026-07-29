/**
 * Wall Street research-firm league table — pure scoring math.
 *
 * Every sell-side rating we can source for free is attributed to a FIRM
 * ("Morgan Stanley", "BMO Capital"), never to a named individual: Yahoo's
 * upgradeDowngradeHistory module carries `firm` but no analyst name, and
 * per-analyst track records are proprietary (TipRanks et al). So the league
 * table ranks firms, and every number below is derived from real ratings
 * joined to real price history — nothing is estimated or filled in.
 *
 * Scoring mirrors the four factors the industry publishes: success rate,
 * average return, rating count and recency.
 */

export type RatingDirection = 'bull' | 'bear' | 'neutral';

/** One firm rating on one ticker, already joined to its forward outcome. */
export interface RatingOutcome {
  firm: string;
  symbol: string;
  dateMs: number;
  direction: RatingDirection;
  /** Return in the DIRECTION of the call, % — null when not yet scorable. */
  directionalReturn: number | null;
}

export interface AnalystFirmRow {
  firm: string;
  slug: string;
  mainSector: string | null;
  /** % of scored calls that went the way the firm called it. */
  successRate: number | null;
  /** Mean directional return over the scoring window, %. */
  avgReturn: number | null;
  /** Every rating we hold for the firm, scored or not. */
  ratings: number;
  /** Ratings old enough to have an outcome — the successRate/avgReturn base. */
  scoredRatings: number;
  lastRatingMs: number | null;
  /** 0–5 star composite, 2dp. */
  stars: number;
  /** Most-rated tickers, for the coverage column. */
  topSymbols: string[];
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const round2 = (x: number) => Math.round(x * 100) / 100;

// Yahoo's grade vocabulary is long-tailed and inconsistent between firms, so we
// match on normalized substrings rather than an exact enum.
const BULL_GRADES = [
  'strong buy', 'buy', 'outperform', 'overweight', 'accumulate', 'add',
  'positive', 'conviction buy', 'top pick', 'long term buy', 'speculative buy',
];
const BEAR_GRADES = [
  'strong sell', 'sell', 'underperform', 'underweight', 'reduce', 'negative',
];
// NB: no bare 'perform' here — it would swallow "outperform"/"underperform",
// which are directional calls, not neutral ones.
const NEUTRAL_GRADES = [
  'hold', 'neutral', 'market perform', 'mkt perform', 'sector perform',
  'equal weight', 'equalweight', 'in line', 'inline', 'peer perform',
  'sector weight', 'market weight',
];

const normalizeGrade = (g: string): string =>
  (g || '').toLowerCase().replace(/[^a-z ]+/g, ' ').replace(/\s+/g, ' ').trim();

/** Map a Yahoo `toGrade` onto a directional call. Neutral is checked FIRST so
 *  "market perform" isn't caught by the bullish "perform"-family substrings. */
export function classifyGrade(grade: string): RatingDirection {
  const g = normalizeGrade(grade);
  if (!g) return 'neutral';
  if (NEUTRAL_GRADES.some((n) => g === n || g.includes(n))) return 'neutral';
  if (BEAR_GRADES.some((n) => g.includes(n))) return 'bear';
  if (BULL_GRADES.some((n) => g.includes(n))) return 'bull';
  return 'neutral';
}

/** Firms report under slightly different names across tickers; fold the common
 *  suffixes so one firm doesn't split into three table rows. */
export function canonicalFirm(raw: string): string {
  let f = (raw || '').trim().replace(/\s+/g, ' ');
  if (!f) return '';
  f = f.replace(/[.,]+$/, '');
  f = f.replace(/\s*&\s*/g, ' & ');
  // Drop corporate-form noise that varies by filing ("Inc", "LLC", "Securities").
  f = f.replace(/\b(inc|incorporated|llc|l\.l\.c|ltd|limited|corp|corporation|plc|group|securities|research|and co|& co)\b\.?/gi, '');
  f = f.replace(/\s+/g, ' ').trim();
  return f;
}

export const firmSlug = (firm: string): string =>
  firm.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** A rating needs this much elapsed time before its outcome means anything. */
export const MIN_SEASONING_DAYS = 30;
/** Outcome horizon — the industry-standard one year from the rating date. */
export const SCORING_HORIZON_DAYS = 365;
/** Firms below this many scored calls are dropped rather than shown on noise. */
export const MIN_SCORED_RATINGS = 6;

const DAY_MS = 86_400_000;

/**
 * Turn a firm's rating date + the ticker's close history into the return in the
 * direction of the call. Bearish calls invert the price return, so "average
 * return" reads the same way for a sell call that worked as for a buy call.
 * Returns null when the call is too fresh or prices are missing.
 */
export function scoreRating(
  direction: RatingDirection,
  dateMs: number,
  nowMs: number,
  priceAt: (ms: number) => number | null,
): number | null {
  if (direction === 'neutral') return null;
  const ageDays = (nowMs - dateMs) / DAY_MS;
  if (!Number.isFinite(ageDays) || ageDays < MIN_SEASONING_DAYS) return null;
  const endMs = Math.min(dateMs + SCORING_HORIZON_DAYS * DAY_MS, nowMs);
  const start = priceAt(dateMs);
  const end = priceAt(endMs);
  if (start == null || end == null || !(start > 0) || !(end > 0)) return null;
  const priceReturn = (end / start - 1) * 100;
  return direction === 'bear' ? -priceReturn : priceReturn;
}

/** 0–5 stars from the four published factors. */
export function starScore(
  successRate: number | null,
  avgReturn: number | null,
  scoredRatings: number,
  lastRatingMs: number | null,
  ratingsPastYearShare: number,
  nowMs: number,
): number {
  // Success rate: a coin flip is ~50%, so anchor 40% → 0 and 75% → 1.
  const nSuccess = successRate == null ? 0 : clamp01((successRate - 40) / 35);
  // Average return: -5% → 0, +25% → 1.
  const nReturn = avgReturn == null ? 0 : clamp01((avgReturn + 5) / 30);
  // Rating count: log-damped so a prolific firm can't run away with the table.
  const nCount = clamp01(Math.log1p(scoredRatings) / Math.log1p(400));
  // Recency: half how recent the LAST call is, half how much of the firm's
  // record was laid down in the past year.
  const daysSince =
    lastRatingMs == null ? Infinity : (nowMs - lastRatingMs) / DAY_MS;
  const nFresh = Number.isFinite(daysSince) ? clamp01(1 - daysSince / 365) : 0;
  const nRecency = 0.5 * nFresh + 0.5 * clamp01(ratingsPastYearShare);

  const composite =
    0.35 * nSuccess + 0.3 * nReturn + 0.2 * nCount + 0.15 * nRecency;
  return round2(clamp01(composite) * 5);
}

/**
 * Fold per-rating outcomes into the ranked firm table, best first.
 * `sectorOf` supplies each ticker's sector so we can name the firm's most-rated
 * sector; firms with too few scored calls are dropped entirely.
 */
export function aggregateFirms(
  outcomes: RatingOutcome[],
  sectorOf: (symbol: string) => string | null,
  nowMs: number,
): AnalystFirmRow[] {
  interface Acc {
    firm: string;
    ratings: number;
    scored: number;
    wins: number;
    retSum: number;
    lastMs: number | null;
    pastYear: number;
    sectors: Map<string, number>;
    symbols: Map<string, number>;
  }
  const byFirm = new Map<string, Acc>();

  for (const o of outcomes) {
    const firm = canonicalFirm(o.firm);
    if (!firm) continue;
    let a = byFirm.get(firm);
    if (!a) {
      a = {
        firm,
        ratings: 0,
        scored: 0,
        wins: 0,
        retSum: 0,
        lastMs: null,
        pastYear: 0,
        sectors: new Map(),
        symbols: new Map(),
      };
      byFirm.set(firm, a);
    }
    a.ratings += 1;
    if (a.lastMs == null || o.dateMs > a.lastMs) a.lastMs = o.dateMs;
    if (nowMs - o.dateMs <= 365 * DAY_MS) a.pastYear += 1;

    const sector = sectorOf(o.symbol);
    if (sector) a.sectors.set(sector, (a.sectors.get(sector) || 0) + 1);
    a.symbols.set(o.symbol, (a.symbols.get(o.symbol) || 0) + 1);

    if (o.directionalReturn != null) {
      a.scored += 1;
      a.retSum += o.directionalReturn;
      if (o.directionalReturn > 0) a.wins += 1;
    }
  }

  const rows: AnalystFirmRow[] = [];
  for (const a of byFirm.values()) {
    if (a.scored < MIN_SCORED_RATINGS) continue;
    const successRate = (a.wins / a.scored) * 100;
    const avgReturn = a.retSum / a.scored;
    const mainSector =
      Array.from(a.sectors.entries()).sort((x, y) => y[1] - x[1])[0]?.[0] ?? null;
    const topSymbols = Array.from(a.symbols.entries())
      .sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))
      .slice(0, 3)
      .map(([s]) => s);
    rows.push({
      firm: a.firm,
      slug: firmSlug(a.firm),
      mainSector,
      successRate: round2(successRate),
      avgReturn: round2(avgReturn),
      ratings: a.ratings,
      scoredRatings: a.scored,
      lastRatingMs: a.lastMs,
      stars: starScore(
        successRate,
        avgReturn,
        a.scored,
        a.lastMs,
        a.ratings > 0 ? a.pastYear / a.ratings : 0,
        nowMs,
      ),
      topSymbols,
    });
  }

  rows.sort(
    (x, y) =>
      y.stars - x.stars ||
      (y.successRate ?? 0) - (x.successRate ?? 0) ||
      y.scoredRatings - x.scoredRatings,
  );
  return rows;
}
