import { gradeCongress, type Grade, type GradeInput } from '../wealth-tracker/badges';

/**
 * Brief v7 member grades, reconstructed as they would have stood on a date.
 *
 * C5 (buyer track record, 12% of the CQS) reads these grades. It sat on the
 * calibration's excluded list, and the reason given was that grades are stored
 * as current state — true of `wt_member_stats`, but not of the evidence
 * underneath it: `wt_trades` carries 84,618 rows with BOTH a transaction_date
 * and a disclosure_date, which is everything needed to ask what a member's
 * record looked like on any past day.
 *
 * WHAT IS REAL HERE AND WHAT IS APPROXIMATED
 *
 * The grading itself is the REAL one — `gradeCongress` from Brief v7, with its
 * own weights, its own percentile ranking and its own curve. Nothing is
 * re-implemented, so a grade produced here is on the same scale as a grade on
 * the live site.
 *
 * Two of its four inputs are approximated. `trades12m` and `avgLagDays` come
 * straight out of the disclosed trades and are exact. `retAll` and `hitRate`
 * are computed as a simple mark-to-market of each disclosed BUY from its
 * transaction-date close to the as-of close, rather than through the v7 FIFO
 * lot engine with its realised/unrealised split and benchmark legs. That is a
 * coarser measure of the same thing, and it is stated rather than hidden —
 * a calibration that quietly substituted a different quantity for C5 would be
 * measuring something the live score does not use.
 *
 * NO LOOKAHEAD. A trade enters a member's record only once `disclosure_date <=
 * asOf`, the same rule §5 imposes on the trades being scored. A member's grade
 * on 2019-06-07 is built from what had been filed by 2019-06-07.
 */

export interface PitTrade {
  member: string;
  ticker: string;
  side: string;
  amountMin: number | null;
  amountMax: number | null;
  transactionMs: number;
  disclosedMs: number;
}

/** Closes as `[epochMs, close, volume]`, ascending — `pit_price_series`. */
export type Series = Array<[number, number, number]>;

/** Last close at or before `ms`, or null when the series starts later. */
function closeAtOrBefore(points: Series | undefined, ms: number): number | null {
  if (!points?.length) return null;
  let lo = 0;
  let hi = points.length - 1;
  let best: number | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid][0] <= ms) {
      best = points[mid][1];
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return best;
}

const DAY = 86_400_000;
/** Brief v7's own floor: a record this thin is not a record. */
const MIN_PRICED_TRADES = 3;

/**
 * Grades for every member whose record can be measured on `asOf`.
 *
 * `trades` is the whole disclosed history, loaded once; this filters it per
 * date rather than re-querying, because the walk asks for 458 dates and the
 * table does not change between them.
 */
export function gradesAsOf(
  trades: PitTrade[],
  prices: Map<string, Series>,
  asOfMs: number,
): Map<string, Grade> {
  interface Acc {
    rets: number[];
    weights: number[];
    wins: number;
    priced: number;
    trades12m: number;
    lags: number[];
  }
  const byMember = new Map<string, Acc>();

  for (const t of trades) {
    if (t.disclosedMs > asOfMs) continue; // not yet public on this date
    let a = byMember.get(t.member);
    if (!a) {
      a = { rets: [], weights: [], wins: 0, priced: 0, trades12m: 0, lags: [] };
      byMember.set(t.member, a);
    }
    if (asOfMs - t.transactionMs <= 365 * DAY) a.trades12m++;
    const lag = (t.disclosedMs - t.transactionMs) / DAY;
    if (lag >= 0) a.lags.push(lag);

    // Only purchases carry a track record: a sale's outcome depends on the
    // buy that opened it, which this mark-to-market does not pair up.
    if (!/buy|purchase/i.test(t.side)) continue;
    const series = prices.get(t.ticker.toUpperCase());
    const p0 = closeAtOrBefore(series, t.transactionMs);
    const p1 = closeAtOrBefore(series, asOfMs);
    if (p0 == null || p1 == null || !(p0 > 0)) continue;
    const ret = (p1 - p0) / p0;
    const size = ((t.amountMin ?? 15_001) + (t.amountMax ?? (t.amountMin ?? 15_001) * 2)) / 2;
    a.rets.push(ret);
    a.weights.push(size);
    a.priced++;
    if (ret > 0) a.wins++;
  }

  const inputs: GradeInput[] = [];
  for (const [key, a] of byMember) {
    const wSum = a.weights.reduce((s, w) => s + w, 0);
    const retAll =
      a.priced >= MIN_PRICED_TRADES && wSum > 0
        ? a.rets.reduce((s, r, i) => s + r * a.weights[i], 0) / wSum
        : null;
    inputs.push({
      key,
      // The v7 floor, applied to what was knowable: a member with fewer than
      // three priced buys on this date has no record to grade.
      qualifies: a.priced >= MIN_PRICED_TRADES,
      retAll,
      hitRate: a.priced >= MIN_PRICED_TRADES ? a.wins / a.priced : null,
      trades12m: a.trades12m,
      avgLagDays: a.lags.length ? a.lags.reduce((s, l) => s + l, 0) / a.lags.length : null,
      // Roster add-dates are not stored historically. Leaving this undefined
      // means the real function's default applies rather than a guess.
      trackedLongEnough: undefined,
    });
  }

  const graded = gradeCongress(inputs);
  const out = new Map<string, Grade>();
  for (const [key, v] of graded) out.set(key, v.grade);
  return out;
}
