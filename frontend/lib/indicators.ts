// Pure technical-indicator math for the stock Technicals section. All functions
// take plain number arrays (close/high/low) so they work for any ticker from the
// /market-stats/history OHLCV feed. No external deps.

export type Signal = "buy" | "sell" | "neutral";

export function sma(v: number[], n: number): number | null {
  if (v.length < n) return null;
  let s = 0;
  for (let i = v.length - n; i < v.length; i++) s += v[i];
  return s / n;
}

export function emaSeries(v: number[], n: number): number[] {
  const k = 2 / (n + 1);
  const out: number[] = [];
  let prev = v[0] ?? 0;
  for (let i = 0; i < v.length; i++) {
    prev = i === 0 ? v[0] : v[i] * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

export function ema(v: number[], n: number): number | null {
  if (v.length < n) return null;
  return emaSeries(v, n)[v.length - 1];
}

export function rsi(v: number[], n = 14): number | null {
  if (v.length <= n) return null;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= n; i++) {
    const d = v[i] - v[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  let ag = gain / n;
  let al = loss / n;
  for (let i = n + 1; i < v.length; i++) {
    const d = v[i] - v[i - 1];
    ag = (ag * (n - 1) + (d > 0 ? d : 0)) / n;
    al = (al * (n - 1) + (d < 0 ? -d : 0)) / n;
  }
  if (al === 0) return 100;
  return 100 - 100 / (1 + ag / al);
}

export function macd(v: number[]): { line: number; signal: number } | null {
  if (v.length < 35) return null;
  const e12 = emaSeries(v, 12);
  const e26 = emaSeries(v, 26);
  const line = v.map((_, i) => e12[i] - e26[i]);
  const sig = emaSeries(line, 9);
  return { line: line[line.length - 1], signal: sig[sig.length - 1] };
}

export function stochasticK(
  highs: number[],
  lows: number[],
  closes: number[],
  n = 14,
): number | null {
  if (closes.length < n) return null;
  const hh = Math.max(...highs.slice(-n));
  const ll = Math.min(...lows.slice(-n));
  if (hh === ll) return 50;
  return ((closes[closes.length - 1] - ll) / (hh - ll)) * 100;
}

// Wilder's ADX (trend strength, 0–100) with +DI/-DI direction.
export function adx(
  highs: number[],
  lows: number[],
  closes: number[],
  n = 14,
): { adx: number; plusDI: number; minusDI: number } | null {
  if (closes.length < n * 2 + 1) return null;
  const tr: number[] = [];
  const plusDM: number[] = [];
  const minusDM: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const up = highs[i] - highs[i - 1];
    const dn = lows[i - 1] - lows[i];
    plusDM.push(up > dn && up > 0 ? up : 0);
    minusDM.push(dn > up && dn > 0 ? dn : 0);
    tr.push(
      Math.max(
        highs[i] - lows[i],
        Math.abs(highs[i] - closes[i - 1]),
        Math.abs(lows[i] - closes[i - 1]),
      ),
    );
  }
  const smooth = (arr: number[]) => {
    let s = arr.slice(0, n).reduce((a, b) => a + b, 0);
    const out = [s];
    for (let i = n; i < arr.length; i++) {
      s = s - s / n + arr[i];
      out.push(s);
    }
    return out;
  };
  const trS = smooth(tr);
  const pS = smooth(plusDM);
  const mS = smooth(minusDM);
  const dx: number[] = [];
  let lastP = 0;
  let lastM = 0;
  for (let i = 0; i < trS.length; i++) {
    const pdi = trS[i] ? (100 * pS[i]) / trS[i] : 0;
    const mdi = trS[i] ? (100 * mS[i]) / trS[i] : 0;
    lastP = pdi;
    lastM = mdi;
    const sum = pdi + mdi;
    dx.push(sum ? (100 * Math.abs(pdi - mdi)) / sum : 0);
  }
  if (dx.length < n) return null;
  let adxv = dx.slice(0, n).reduce((a, b) => a + b, 0) / n;
  for (let i = n; i < dx.length; i++) adxv = (adxv * (n - 1) + dx[i]) / n;
  return { adx: adxv, plusDI: lastP, minusDI: lastM };
}

export interface IndicatorRow {
  name: string;
  value: string;
  signal: Signal;
}

export interface TechnicalsResult {
  movingAverages: IndicatorRow[];
  oscillators: IndicatorRow[];
  maScore: number; // -1..1
  oscScore: number; // -1..1
  overallScore: number; // -1..1
}

const scoreOf = (rows: IndicatorRow[]): number => {
  if (!rows.length) return 0;
  const s = rows.reduce(
    (a, r) => a + (r.signal === "buy" ? 1 : r.signal === "sell" ? -1 : 0),
    0,
  );
  return s / rows.length;
};

export function ratingLabel(score: number): { label: string; key: string } {
  if (score >= 0.5) return { label: "Strong Buy", key: "strong_buy" };
  if (score >= 0.1) return { label: "Buy", key: "buy" };
  if (score <= -0.5) return { label: "Strong Sell", key: "strong_sell" };
  if (score <= -0.1) return { label: "Sell", key: "sell" };
  return { label: "Neutral", key: "neutral" };
}

/** Compute the full TradingView-style technicals summary from OHLC bars. */
export function computeTechnicals(
  closes: number[],
  highs: number[],
  lows: number[],
): TechnicalsResult | null {
  if (closes.length < 30) return null;
  const price = closes[closes.length - 1];
  const maSig = (ma: number | null): Signal =>
    ma == null ? "neutral" : price > ma ? "buy" : price < ma ? "sell" : "neutral";
  const fmt = (v: number | null) => (v == null ? "—" : v.toFixed(2));

  const movingAverages: IndicatorRow[] = [
    ["EMA 20", ema(closes, 20)],
    ["SMA 20", sma(closes, 20)],
    ["EMA 50", ema(closes, 50)],
    ["SMA 50", sma(closes, 50)],
    ["EMA 200", ema(closes, 200)],
    ["SMA 200", sma(closes, 200)],
  ].map(([name, v]) => ({
    name: name as string,
    value: fmt(v as number | null),
    signal: maSig(v as number | null),
  }));

  const oscillators: IndicatorRow[] = [];
  const r = rsi(closes);
  oscillators.push({
    name: "RSI (14)",
    value: fmt(r),
    signal: r == null ? "neutral" : r > 70 ? "sell" : r < 30 ? "buy" : "neutral",
  });
  const m = macd(closes);
  oscillators.push({
    name: "MACD (12,26,9)",
    value: m ? m.line.toFixed(2) : "—",
    signal: !m ? "neutral" : m.line > m.signal ? "buy" : m.line < m.signal ? "sell" : "neutral",
  });
  const st = stochasticK(highs, lows, closes);
  oscillators.push({
    name: "Stochastic %K (14)",
    value: fmt(st),
    signal: st == null ? "neutral" : st > 80 ? "sell" : st < 20 ? "buy" : "neutral",
  });
  const a = adx(highs, lows, closes);
  oscillators.push({
    name: "ADX (14)",
    value: a ? a.adx.toFixed(2) : "—",
    // ADX measures strength; direction from +DI vs -DI, only when trend is real.
    signal: !a || a.adx < 20 ? "neutral" : a.plusDI > a.minusDI ? "buy" : "sell",
  });

  const maScore = scoreOf(movingAverages);
  const oscScore = scoreOf(oscillators);
  return {
    movingAverages,
    oscillators,
    maScore,
    oscScore,
    overallScore: (maScore + oscScore) / 2,
  };
}

/** Average % return per calendar month across all years in the series. */
export function monthlySeasonality(
  bars: { date: string; close: number }[],
): { month: number; avg: number | null; count: number }[] {
  const byYM = new Map<string, { first: number; last: number }>();
  for (const b of bars) {
    const ym = String(b.date).slice(0, 7);
    const e = byYM.get(ym);
    if (!e) byYM.set(ym, { first: b.close, last: b.close });
    else e.last = b.close;
  }
  const perMonth: number[][] = Array.from({ length: 12 }, () => []);
  for (const [ym, { first, last }] of byYM) {
    const m = parseInt(ym.slice(5, 7), 10) - 1;
    if (m >= 0 && m < 12 && first > 0) perMonth[m].push(((last - first) / first) * 100);
  }
  return perMonth.map((arr, month) => ({
    month,
    avg: arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null,
    count: arr.length,
  }));
}
