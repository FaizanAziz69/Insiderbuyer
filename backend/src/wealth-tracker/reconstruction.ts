/**
 * The Wealth Tracker — disclosed-portfolio reconstruction (Brief v7 §2.1).
 *
 * Pure functions. Nothing here touches the network or the database, so the
 * whole engine can be checked against hand-built cases
 * (node dist/wealth-tracker/wealth-tracker.spec.js).
 *
 * The model, in the brief's words: "each buy opens/extends a lot at the range
 * midpoint on the transaction date; each sale reduces lots FIFO; positions
 * are marked to market daily." From that we get, per member, the estimated
 * cost basis per holding, current value, realized and unrealized P&L, and a
 * time-weighted return series — the 'Disclosed Portfolio Growth (est.)' curve.
 *
 * Everything is an estimate and the caller says so on every surface:
 *   • PTR amounts are ranges. We use the midpoint.
 *   • A buy's share count is midpoint ÷ the adjusted close on the trade date
 *     (last session on or before it — a weekend-dated filing prices at
 *     Friday's close).
 *   • A sale marked "Full" closes the whole position regardless of the range.
 *     A partial sale sells midpoint ÷ close shares, FIFO, and never more than
 *     we hold — a sale of shares we never saw bought (a position that predates
 *     the record) is counted in activity but cannot move P&L.
 *   • Only stock-like assets (stock / ETF / REIT / ADR) with a ticker are
 *     reconstructed. Options, bonds, funds without a ticker, crypto and
 *     "Other" count toward activity (trade counts, filing speed) only. That is
 *     the v1 simplification table; dividends are excluded in v1.
 *   • Prices are dividend-adjusted closes, which also absorb splits.
 *
 * Time-weighted return: for each session, the portfolio's return is the
 * change in value of the shares held at the previous close, BEFORE the day's
 * trades are applied; trades then land at that day's close. Chaining those
 * daily returns gives an index that a deposit or a withdrawal cannot move —
 * a member who buys $1M of stock does not "gain" $1M.
 */

export type AssetClass = 'stock' | 'option' | 'bond' | 'fund' | 'crypto' | 'other';
export type TradeSide = 'buy' | 'sell' | 'exchange';

export interface PtrTrade {
  id: string;
  ticker: string | null;
  assetClass: AssetClass;
  side: TradeSide;
  /** "Sale (Full)" — the filer says the whole position went. */
  full: boolean;
  amountMin: number | null;
  amountMax: number | null;
  /** Transaction date, YYYY-MM-DD. */
  date: string;
  /** Disclosure (filing) date, YYYY-MM-DD, when known. */
  disclosed: string | null;
}

/** A dividend-adjusted close series, ascending. */
export interface Series {
  t: number[];
  c: number[];
}

/**
 * A series laid onto the trading calendar: `c[i]` is the close on calendar
 * day i, forward-filled after the last real bar, NaN before the first one.
 * `lastReal` is the calendar index of the last real bar, so a caller can tell
 * a live price from a stale one (delisted / halted / vendor gap).
 */
export interface Aligned {
  c: Float64Array;
  firstReal: number;
  lastReal: number;
}

export interface Lot {
  tradeId: string;
  ticker: string;
  /** Calendar index the lot opened on. */
  openIdx: number;
  shares: number;
  costPerShare: number;
  remaining: number;
  soldProceeds: number;
  soldShares: number;
}

export interface Position {
  ticker: string;
  shares: number;
  costBasis: number;
  avgCost: number;
  firstBoughtIdx: number;
  lastActionIdx: number;
  buys: number;
  sells: number;
  realized: number;
  /** Price used for the current value, and the calendar index it is from. */
  price: number;
  priceIdx: number;
  /** 'live' when the last bar is recent; 'stale' when the vendor series ended
   *  more than STALE_AFTER_DAYS ago (delisted, renamed, halted). */
  status: 'live' | 'stale';
}

export interface CurvePoint {
  /** Calendar index. */
  i: number;
  /** Estimated value of the disclosed stock portfolio at the close. */
  v: number;
  /** Time-weighted return index, 100 at the first trade. */
  idx: number;
  /** Benchmark index, 100 at the first trade. */
  b: number;
}

export interface EngineInput {
  trades: PtrTrade[];
  /** Trading calendar, ascending UTC-midnight epoch ms (the benchmark's sessions). */
  calendar: number[];
  price: (ticker: string) => Aligned | null;
  benchmark: Aligned;
  /** Calendar index to mark to (normally the last session). */
  todayIdx: number;
}

export interface EngineOutput {
  curve: CurvePoint[];
  positions: Position[];
  lots: Lot[];
  /** Open cost basis across positions. */
  investedCost: number;
  realized: number;
  unrealized: number;
  value: number;
  /** Buys that could be priced and therefore moved the reconstruction. */
  buysPriced: number;
  buysUnpriced: number;
  sellsPriced: number;
  /** Sales (or the part of one) that found no lot to reduce. */
  sellsUnmatched: number;
  /** Sessions where the portfolio's daily move was clamped as a bad print. */
  clampedDays: number;
  /** Per priced buy: did it make money (realized part + what remains at today's price)? */
  hits: number;
  hitSample: number;
}

export const STALE_AFTER_DAYS = 30;
/** A single session move outside this band, for the whole portfolio, is a bad print. */
const DAY_CLAMP_LO = -0.6;
const DAY_CLAMP_HI = 1.5;
const DAY = 86_400_000;
const EPS = 1e-9;

export function midpoint(min: number | null, max: number | null): number | null {
  const lo = min != null && Number.isFinite(min) ? min : null;
  const hi = max != null && Number.isFinite(max) ? max : null;
  if (lo == null && hi == null) return null;
  if (lo == null) return hi;
  if (hi == null) return lo;
  return (lo + hi) / 2;
}

/** UTC midnight for a YYYY-MM-DD string. */
export function dayMs(iso: string): number {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

/** Index of the last calendar day on or before `ms`; -1 when before the first. */
export function calendarIndex(calendar: number[], ms: number): number {
  let lo = 0;
  let hi = calendar.length - 1;
  let best = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (calendar[mid] <= ms) {
      best = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return best;
}

/**
 * Lay a series onto the calendar. A one-session spike that fully reverts the
 * next session (a bad vendor print, or a split the adjustment missed for a
 * day) is replaced with the previous close so it cannot show up as a
 * +300% day for whoever held it.
 */
export function alignSeries(series: Series, calendar: number[]): Aligned | null {
  const n = calendar.length;
  if (!n || !series.t.length) return null;
  const c = new Float64Array(n).fill(NaN);
  let j = 0;
  let last = NaN;
  let firstReal = -1;
  let lastReal = -1;
  for (let i = 0; i < n; i++) {
    const day = calendar[i];
    while (j < series.t.length && series.t[j] <= day) {
      const px = series.c[j];
      if (Number.isFinite(px) && px > 0) {
        last = px;
        if (firstReal < 0) firstReal = i;
        // The bar belongs to this calendar day (or a non-session day folded
        // into it); either way it is the freshest real print.
        lastReal = i;
      }
      j++;
    }
    c[i] = last;
  }
  if (firstReal < 0) return null;
  // Spike repair.
  for (let i = firstReal + 1; i < lastReal; i++) {
    const prev = c[i - 1];
    const cur = c[i];
    const next = c[i + 1];
    if (!(prev > 0) || !(cur > 0) || !(next > 0)) continue;
    const up = cur / prev;
    const back = next / cur;
    if ((up > 3 && back < 1 / 2.5) || (up < 1 / 3 && back > 2.5)) c[i] = prev;
  }
  return { c, firstReal, lastReal };
}

const RECONSTRUCTED: ReadonlySet<AssetClass> = new Set<AssetClass>(['stock']);

export function reconstruct(input: EngineInput): EngineOutput {
  const { calendar, price, benchmark, todayIdx } = input;
  const empty: EngineOutput = {
    curve: [],
    positions: [],
    lots: [],
    investedCost: 0,
    realized: 0,
    unrealized: 0,
    value: 0,
    buysPriced: 0,
    buysUnpriced: 0,
    sellsPriced: 0,
    sellsUnmatched: 0,
    clampedDays: 0,
    hits: 0,
    hitSample: 0,
  };
  if (!calendar.length || todayIdx < 0) return empty;

  // Only the trades the engine can act on, in date order, bucketed by session.
  type Dated = PtrTrade & { idx: number; mid: number };
  const byDay = new Map<number, Dated[]>();
  let firstIdx = Infinity;
  for (const t of input.trades) {
    if (!t.ticker || !RECONSTRUCTED.has(t.assetClass)) continue;
    if (t.side !== 'buy' && t.side !== 'sell') continue;
    const mid = midpoint(t.amountMin, t.amountMax);
    if (mid == null || (!t.full && mid <= 0)) continue;
    const idx = calendarIndex(calendar, dayMs(t.date));
    if (idx < 0 || idx > todayIdx) continue;
    const arr = byDay.get(idx) || [];
    arr.push({ ...t, idx, mid: mid ?? 0 });
    byDay.set(idx, arr);
    if (idx < firstIdx) firstIdx = idx;
  }
  if (!Number.isFinite(firstIdx)) return empty;

  const aligned = new Map<string, Aligned | null>();
  const px = (ticker: string): Aligned | null => {
    if (!aligned.has(ticker)) aligned.set(ticker, price(ticker));
    return aligned.get(ticker) || null;
  };

  const shares = new Map<string, number>();
  const lots: Lot[] = [];
  const openLots = new Map<string, Lot[]>();
  const posMeta = new Map<
    string,
    { firstBoughtIdx: number; lastActionIdx: number; buys: number; sells: number; realized: number }
  >();
  const out: EngineOutput = { ...empty, curve: [], positions: [], lots };

  const valueAt = (i: number): number => {
    let v = 0;
    for (const [sym, sh] of shares) {
      if (sh <= EPS) continue;
      const a = px(sym);
      if (!a) continue;
      const p = a.c[i];
      if (p > 0) v += sh * p;
    }
    return v;
  };

  const bench0 = benchmark.c[firstIdx];
  let prevV = 0;
  let index = 100;

  for (let i = firstIdx; i <= todayIdx; i++) {
    // 1. Mark yesterday's shares at today's close: the day's return.
    if (prevV > 0) {
      const pre = valueAt(i);
      let r = pre / prevV - 1;
      if (r < DAY_CLAMP_LO || r > DAY_CLAMP_HI) {
        r = Math.max(DAY_CLAMP_LO, Math.min(DAY_CLAMP_HI, r));
        out.clampedDays++;
      }
      index *= 1 + r;
    }
    // 2. Apply the day's trades at the close.
    const todays = byDay.get(i);
    if (todays) {
      for (const t of todays) {
        const sym = t.ticker as string;
        const a = px(sym);
        const p = a ? a.c[i] : NaN;
        const meta = posMeta.get(sym) || {
          firstBoughtIdx: -1,
          lastActionIdx: -1,
          buys: 0,
          sells: 0,
          realized: 0,
        };
        if (t.side === 'buy') {
          if (!(p > 0)) {
            out.buysUnpriced++;
            continue;
          }
          const sh = t.mid / p;
          const lot: Lot = {
            tradeId: t.id,
            ticker: sym,
            openIdx: i,
            shares: sh,
            costPerShare: p,
            remaining: sh,
            soldProceeds: 0,
            soldShares: 0,
          };
          lots.push(lot);
          const ol = openLots.get(sym) || [];
          ol.push(lot);
          openLots.set(sym, ol);
          shares.set(sym, (shares.get(sym) || 0) + sh);
          meta.buys++;
          if (meta.firstBoughtIdx < 0) meta.firstBoughtIdx = i;
          meta.lastActionIdx = i;
          out.buysPriced++;
        } else {
          const held = shares.get(sym) || 0;
          if (!(p > 0)) {
            out.sellsUnmatched++;
            continue;
          }
          const want = t.full ? held : Math.min(held, t.mid / p);
          let toSell = want;
          if (held <= EPS) {
            out.sellsUnmatched++;
            meta.sells++;
            meta.lastActionIdx = i;
            posMeta.set(sym, meta);
            continue;
          }
          if (!t.full && t.mid / p > held + EPS) out.sellsUnmatched++;
          out.sellsPriced++;
          const ol = openLots.get(sym) || [];
          while (toSell > EPS && ol.length) {
            const lot = ol[0];
            const take = Math.min(lot.remaining, toSell);
            lot.remaining -= take;
            lot.soldShares += take;
            lot.soldProceeds += take * p;
            meta.realized += take * (p - lot.costPerShare);
            toSell -= take;
            if (lot.remaining <= EPS) {
              lot.remaining = 0;
              ol.shift();
            }
          }
          const left = Math.max(0, held - want);
          shares.set(sym, left <= EPS ? 0 : left);
          meta.sells++;
          meta.lastActionIdx = i;
        }
        posMeta.set(sym, meta);
      }
    }
    // 3. Close the day.
    const v = valueAt(i);
    out.curve.push({
      i,
      v,
      idx: index,
      b: bench0 > 0 && benchmark.c[i] > 0 ? (benchmark.c[i] / bench0) * 100 : 100,
    });
    prevV = v;
  }

  // Positions as of today.
  const staleBefore = todayIdx - Math.ceil(STALE_AFTER_DAYS * (252 / 365));
  for (const [sym, sh] of shares) {
    const meta = posMeta.get(sym);
    if (!meta) continue;
    out.realized += meta.realized;
    if (sh <= EPS) continue;
    const a = px(sym);
    if (!a) continue;
    const priceIdx = Math.min(todayIdx, a.lastReal);
    const p = a.c[priceIdx];
    if (!(p > 0)) continue;
    const ol = openLots.get(sym) || [];
    const costBasis = ol.reduce((s, l) => s + l.remaining * l.costPerShare, 0);
    out.positions.push({
      ticker: sym,
      shares: sh,
      costBasis,
      avgCost: sh > 0 ? costBasis / sh : 0,
      firstBoughtIdx: meta.firstBoughtIdx,
      lastActionIdx: meta.lastActionIdx,
      buys: meta.buys,
      sells: meta.sells,
      realized: meta.realized,
      price: p,
      priceIdx,
      status: a.lastReal < staleBefore ? 'stale' : 'live',
    });
    out.investedCost += costBasis;
    out.value += sh * p;
    out.unrealized += sh * p - costBasis;
  }
  out.positions.sort((x, y) => y.shares * y.price - x.shares * x.price);

  // Hit rate: every priced buy, judged on what it has returned so far.
  for (const lot of lots) {
    const a = px(lot.ticker);
    if (!a) continue;
    const p = a.c[Math.min(todayIdx, a.lastReal)];
    if (!(p > 0)) continue;
    const pnl = lot.soldProceeds + lot.remaining * p - lot.shares * lot.costPerShare;
    out.hitSample++;
    if (pnl > 0) out.hits++;
  }
  return out;
}

// ── Reading the curve ────────────────────────────────────────────────────

/** Curve point at or before calendar day `i`; null when the curve starts later. */
export function pointAtOrBefore(curve: CurvePoint[], i: number): CurvePoint | null {
  if (!curve.length || curve[0].i > i) return null;
  let lo = 0;
  let hi = curve.length - 1;
  let best = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (curve[mid].i <= i) {
      best = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return curve[best];
}

/** Return (fraction) of the TWR index from the last point on/before `fromIdx` to the end. */
export function trailingReturn(curve: CurvePoint[], fromIdx: number): number | null {
  if (!curve.length) return null;
  const from = pointAtOrBefore(curve, fromIdx);
  if (!from || !(from.idx > 0)) return null;
  const last = curve[curve.length - 1];
  return last.idx / from.idx - 1;
}

/** Benchmark return over the same span, for the "vs SPY" line. */
export function trailingBenchmark(curve: CurvePoint[], fromIdx: number): number | null {
  if (!curve.length) return null;
  const from = pointAtOrBefore(curve, fromIdx);
  if (!from || !(from.b > 0)) return null;
  const last = curve[curve.length - 1];
  return last.b / from.b - 1;
}

/**
 * Thin a daily curve for transport: keep every k-th point plus the last one,
 * never more than `max` points. The chart draws the shape; the leaderboard
 * reads the stored stats, not the curve.
 */
export function thinCurve<T>(points: T[], max: number): T[] {
  if (points.length <= max) return points;
  const step = Math.ceil(points.length / max);
  const out: T[] = [];
  for (let i = 0; i < points.length; i += step) out.push(points[i]);
  if (out[out.length - 1] !== points[points.length - 1]) out.push(points[points.length - 1]);
  return out;
}

/** Calendar index `days` calendar days before day `i` (not sessions). */
export function indexDaysBefore(calendar: number[], i: number, days: number): number {
  return calendarIndex(calendar, calendar[i] - days * DAY);
}

/** Last session of the calendar year before the one containing day `i`. */
export function indexYearStart(calendar: number[], i: number): number {
  const y = new Date(calendar[i]).getUTCFullYear();
  return calendarIndex(calendar, Date.UTC(y, 0, 1) - 1);
}

// ── Normalising the filing vocabulary ────────────────────────────────────

/** FMP's `assetType` strings, folded to the classes the engine knows. */
export function assetClassOf(raw: string | null | undefined, ticker: string | null): AssetClass {
  const s = String(raw || '').toLowerCase();
  if (s.includes('option')) return 'option';
  if (s.includes('bond') || s.includes('municipal') || s.includes('government sec') || s.includes('treasur')) return 'bond';
  if (s.includes('crypto')) return 'crypto';
  if (s.includes('non-public') || s.includes('private')) return 'other';
  if (s === 'stock' || s.includes('etf') || s.includes('reit') || s.includes('adr') || s.includes('exchange traded')) return 'stock';
  if (s.includes('mutual') || s.includes('fund')) return 'fund';
  // Blank asset type with a ticker: the House feed leaves it empty on plain
  // stock rows often enough that dropping them would hollow out the record.
  if (!s && ticker) return 'stock';
  return 'other';
}

export function sideOf(rawType: string | null | undefined): { side: TradeSide; full: boolean } {
  const s = String(rawType || '').toLowerCase();
  if (s.includes('purchase') || s.includes('buy')) return { side: 'buy', full: false };
  if (s.includes('sale') || s.includes('sell')) return { side: 'sell', full: s.includes('full') };
  return { side: 'exchange', full: false };
}

/** The disclosure lag in days; null when either date is missing or the order is impossible. */
export function disclosureLagDays(transaction: string, disclosed: string | null): number | null {
  if (!disclosed) return null;
  const d = (dayMs(disclosed) - dayMs(transaction)) / DAY;
  return Number.isFinite(d) && d >= 0 && d < 3650 ? d : null;
}
