"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Maximize2, Plus, Bell, Copy, ArrowRight } from "lucide-react";
import { API_BASE, fetcher } from "@/lib/api";
import { useWatchlist } from "@/lib/watchlist";

/* ────────────────────────────────────────────────────────────────────────
   stockanalysis.com-style profile head.

   Every literal size/weight/colour below was read off the live reference
   (stockanalysis.com/stocks/a/) with getComputedStyle, and the light-theme
   colours live as tokens in `.sa-head` (app/globals.css) so dark mode can
   re-point them at the site palette instead of being overridden here.

     h1               26px / 700 / 32px       rgb(17,24,39)
     subtitle         12.8px / 400 / 18.4px   rgb(55,65,81)
     price            36px / 700 / 40px
     price change     24px / 600
     market clock     14px / 400              rgb(55,65,81)
     tab              16px, padding 8px 20px, radius 0
       active         600, rgb(17,24,39) on rgb(238,238,238)
       inactive       400, rgb(30,115,186), transparent
     nav rule         2px solid rgb(44,98,136)
     stat row         <tr> border-bottom 1px rgb(229,231,235), height 37.3px
     stat cell        <td> 14.4px / 20.8px, px-1 py-2
     stat label       <a> 400, rgb(17,24,39), underline solid rgb(107,114,128)
     growth badge     14.4px / 600, rgb(21,128,61) up / rgb(220,38,38) down
     range button     15.2px, padding 4px 10px, radius 6px
   ──────────────────────────────────────────────────────────────────────── */

/** The reference runs Tailwind's default `font-sans`. */
const SA_FONT =
  'ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"';

/** "HARLEY-DAVIDSON, INC." -> "Harley-Davidson, Inc." (SA shows title case). */
function titleCase(name: string): string {
  if (name !== name.toUpperCase()) return name;
  return name
    .toLowerCase()
    .replace(/(^|[\s\-\/&.,(])([a-z])/g, (m, pre, ch) => pre + ch.toUpperCase())
    .replace(/\b(Inc|Corp|Ltd|Plc|Llc|Lp|Etf|Reit|Usa|Ii|Iii|Iv)\b/g, (w) =>
      ["Ii", "Iii", "Iv", "Usa", "Etf", "Reit", "Llc", "Plc", "Lp"].includes(w)
        ? w.toUpperCase()
        : w,
    );
}

/** Yahoo exchange code/name -> the short label SA prints (NYSE / NASDAQ). */
function exchangeLabel(x: string | null | undefined): string | null {
  const v = (x || "").toLowerCase();
  if (!v) return null;
  if (v.includes("nasdaq") || v === "nms" || v === "ngm" || v === "ncm") return "NASDAQ";
  if (v.includes("nyse") || v === "nyq") return "NYSE";
  if (v === "ase" || v.includes("amex") || v.includes("american")) return "NYSE American";
  if (v === "pnk" || v.includes("otc")) return "OTC";
  return x || null;
}

/** New York market clock: "Aug 12, 2026, 10:35 AM EDT - Market open". */
function nyLine(): string {
  const now = new Date();
  const dt = now.toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
  const mins = etMinutes(now.getTime());
  const wd = etWeekday(now.getTime());
  const open = wd >= 1 && wd <= 5 && mins >= SESSION_OPEN && mins < SESSION_CLOSE;
  return `${dt} - Market ${open ? "open" : "closed"}`;
}

interface Stats {
  symbol: string;
  name: string | null;
  currency: string;
  price: number | null;
  change: number | null;
  changePct: number | null;
  marketCap: number | null;
  revenue: number | null;
  netIncome: number | null;
  eps: number | null;
  sharesOut: number | null;
  peRatio: number | null;
  forwardPE: number | null;
  dividendRate: number | null;
  dividendYield: number | null;
  exDividendDate: string | null;
  volume: number | null;
  open: number | null;
  previousClose: number | null;
  dayLow: number | null;
  dayHigh: number | null;
  week52Low: number | null;
  week52High: number | null;
  beta: number | null;
  analystRating: string | null;
  priceTarget: number | null;
  priceTargetUpsidePct: number | null;
  earningsDate: string | null;
}

const RATING_LABEL: Record<string, string> = {
  strong_buy: "Strong Buy",
  buy: "Buy",
  hold: "Hold",
  underperform: "Underperform",
  sell: "Sell",
};

const CURRENCY_SYMBOL: Record<string, string> = {
  USD: "$",
  EUR: "€",
  GBP: "£",
  JPY: "¥",
  CAD: "C$",
  AUD: "A$",
  CHF: "CHF ",
  INR: "₹",
};
const cur = (code: string) => CURRENCY_SYMBOL[code] ?? "";

const abbr = (n: number | null | undefined): string => {
  if (n == null || !Number.isFinite(n)) return "n/a";
  const a = Math.abs(n);
  if (a >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
  if (a >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${(n / 1e3).toFixed(2)}K`;
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
};

const fmtDate = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

/* ── growth badges ─────────────────────────────────────────────────────── */

/** The reference prints growth to one decimal with an explicit + sign.
 *  It is a standalone element (not text appended to the figure) so `StatRow`
 *  can treat it as its own flex item and drop it to a second line when the
 *  column is too narrow, instead of the row growing past its grid track. */
function Growth({ v }: { v: number | null | undefined }) {
  if (v == null || !Number.isFinite(v)) return null;
  return (
    <span style={{ color: v >= 0 ? "var(--sa-up)" : "var(--sa-down)" }}>
      {v >= 0 ? "+" : ""}
      {v.toFixed(1)}%
    </span>
  );
}

interface QuarterRow {
  date: string;
  values: Record<string, number | null>;
}

/** Trailing-twelve-month YoY growth from quarterly statements (newest first).
 *  Needs 8 quarters — returns null rather than a partial/zero figure. */
function ttmGrowth(rows: QuarterRow[] | undefined, key: string): number | null {
  if (!rows || rows.length < 8) return null;
  const sum = (from: number): number | null => {
    let total = 0;
    for (let i = from; i < from + 4; i++) {
      const v = rows[i]?.values?.[key];
      if (v == null || !Number.isFinite(v)) return null;
      total += v;
    }
    return total;
  };
  const now = sum(0);
  const prior = sum(4);
  if (now == null || prior == null || prior === 0) return null;
  return ((now - prior) / Math.abs(prior)) * 100;
}

/* ── stat table ────────────────────────────────────────────────────────── */

/** The reference's superscript tooltip glyph (a 9px "i"). */
function InfoGlyph() {
  return (
    <span className="relative" role="button" tabIndex={0} aria-label="More information">
      <span
        className="absolute -top-[3px] -right-[13px] cursor-pointer p-1"
        style={{ color: "var(--sa-icon)" }}
      >
        <svg className="h-[9px] w-[9px]" viewBox="0 0 4 16" fill="currentColor" aria-hidden>
          <circle cx="2" cy="2" r="2" />
          <rect x="0" y="6" width="4" height="10" />
        </svg>
      </span>
    </span>
  );
}

function StatTable({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <table
      className={`w-full table-auto border-collapse ${className}`}
      style={{ fontSize: "14.4px", lineHeight: "20.8px", color: "var(--sa-text)" }}
    >
      <tbody>{children}</tbody>
    </table>
  );
}

/** One stat line. Stacks on mobile and becomes a real table row from `sm` up,
 *  exactly like the reference markup.
 *
 *  Neither cell may be `whitespace-nowrap`: a table cannot lay out narrower
 *  than its min-content width, so a nowrap cell makes the whole table overflow
 *  its grid track and paint its right-aligned value on top of the next
 *  column's labels. The value keeps its pieces unbreakable via a wrapping flex
 *  line instead — each piece stays whole, but a piece may move to a second
 *  line when the column runs out of room. */
function StatRow({
  label,
  href,
  info,
  children,
}: {
  label: string;
  /** Present only for the labels the reference renders as underlined links. */
  href?: string;
  /** Shares Out is the one label carrying the superscript info glyph. */
  info?: boolean;
  children: React.ReactNode;
}) {
  return (
    <tr
      className="flex flex-col border-b py-1 sm:table-row sm:py-0"
      style={{ borderColor: "var(--sa-row-border)" }}
    >
      <td className="px-0.5 py-px align-baseline min-[400px]:px-1 sm:py-2">
        {href ? (
          <Link href={href} className="sa-dothref">
            {label}
          </Link>
        ) : (
          label
        )}
        {info ? <InfoGlyph /> : null}
      </td>
      <td className="px-0.5 py-px align-baseline font-semibold min-[400px]:px-1 sm:py-2">
        <span className="flex flex-wrap items-baseline gap-x-1 whitespace-nowrap sm:justify-end">
          {children}
        </span>
      </td>
    </tr>
  );
}

/* ── chart ─────────────────────────────────────────────────────────────── */

const RANGES: { key: string; label: string }[] = [
  { key: "1d", label: "1D" },
  { key: "5d", label: "5D" },
  { key: "1mo", label: "1M" },
  { key: "ytd", label: "YTD" },
  { key: "3mo", label: "3M" },
  { key: "6mo", label: "6M" },
  { key: "1y", label: "1Y" },
  { key: "5y", label: "5Y" },
  { key: "max", label: "Max" },
];

interface Bar {
  date: string;
  close: number;
  t?: number;
}

/* ── America/New_York helpers ──────────────────────────────────────────────
   Intraday axes must be drawn in exchange time, not the viewer's locale, or
   a reader in Karachi sees a session that runs "6:45 PM - 7:54 PM".
   ────────────────────────────────────────────────────────────────────────── */

const SESSION_OPEN = 570; // 09:30 ET, in minutes past ET midnight
const SESSION_CLOSE = 960; // 16:00 ET
const SESSION_SPAN = SESSION_CLOSE - SESSION_OPEN;

const ET_HM = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const ET_WD = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  weekday: "short",
});
const ET_DAY = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  month: "short",
  day: "numeric",
});
const ET_MONTH = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  month: "short",
});
const ET_FULL = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});
const ET_YMD = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Minutes past ET midnight for an epoch-ms instant. */
function etMinutes(ms: number): number {
  const p = ET_HM.formatToParts(new Date(ms));
  const h = Number(p.find((x) => x.type === "hour")?.value ?? "0");
  const m = Number(p.find((x) => x.type === "minute")?.value ?? "0");
  return h * 60 + m;
}
const WD_INDEX: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};
function etWeekday(ms: number): number {
  return WD_INDEX[ET_WD.format(new Date(ms))] ?? 0;
}

/** "10 am" / "1:30 pm" — the reference's session-label format. */
function fmtSessionTime(min: number): string {
  const h24 = Math.floor(min / 60);
  const m = min % 60;
  const ap = h24 >= 12 ? "pm" : "am";
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return m === 0 ? `${h} ${ap}` : `${h}:${String(m).padStart(2, "0")} ${ap}`;
}

/** Session x-labels on a fixed clock grid (90-minute steps snapped to the
 *  hour), which lands on 10:30 / 12 pm / 1:30 pm / 3 pm. */
function sessionTicks(step = 90): number[] {
  const out: number[] = [];
  for (let m = Math.ceil((SESSION_OPEN + 1) / step) * step; m < SESSION_CLOSE; m += step) {
    out.push(m);
  }
  return out;
}

/* ── nice-number axis ─────────────────────────────────────────────────────
   Raw min/max produces ticks like 25.98 / 26.18 / 26.37. Snapping the step to
   1/2/2.5/5 x 10^n puts them on round values the way the reference does.
   ────────────────────────────────────────────────────────────────────────── */

function niceStep(rough: number): number {
  if (!(rough > 0) || !Number.isFinite(rough)) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(rough)));
  const f = rough / pow;
  const mult = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return mult * pow;
}

function niceTicks(lo: number, hi: number, target = 5): { ticks: number[]; step: number } {
  const step = niceStep((hi - lo) / target);
  const ticks: number[] = [];
  const first = Math.ceil(lo / step - 1e-9) * step;
  for (let v = first; v <= hi + step * 1e-9; v += step) {
    // Re-derive from the index to keep float drift out of the label text.
    ticks.push(+(Math.round(v / step) * step).toFixed(10));
  }
  return { ticks, step };
}

const PLOT_H = 270; // reference plot canvas height
const AXIS_H = 30; // reference x-axis strip height
const GUTTER = 64; // right-hand price axis

/** Element width, so the SVG can be drawn 1:1 instead of being stretched by
 *  `preserveAspectRatio="none"` (which squashes the axis text). */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.getBoundingClientRect().width);
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setW(e.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function SAChart({ ticker, previousClose }: { ticker: string; previousClose?: number | null }) {
  const [range, setRange] = useState("1d");
  const [hover, setHover] = useState<number | null>(null);
  const [wrapRef, wrapW] = useWidth<HTMLDivElement>();

  const { data, isLoading } = useSWR<{ history: { bars: Bar[]; intraday?: boolean } | null }>(
    `${API_BASE}/market-stats/history?symbol=${encodeURIComponent(ticker)}&range=${range}`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60_000 },
  );
  const bars = useMemo(() => data?.history?.bars || [], [data]);
  const intraday = !!data?.history?.intraday || range === "1d" || range === "5d";
  /** Only 1D maps onto a single 09:30-16:00 session. */
  const singleSession = range === "1d";

  const plotW = Math.max(0, wrapW);

  const geo = useMemo(() => {
    if (bars.length < 2 || plotW <= 0) return null;
    const closes = bars.map((b) => b.close);
    const ref = intraday && previousClose != null ? previousClose : null;

    // ── y domain: data + previous close, padded, then nice ticks inside it.
    const lo = Math.min(...closes, ...(ref != null ? [ref] : []));
    const hi = Math.max(...closes, ...(ref != null ? [ref] : []));
    const spread = hi - lo || Math.max(Math.abs(hi) * 0.01, 0.01);
    // Extra headroom on top: the previous close is usually one of the extremes,
    // and it needs to read as a line inside the plot rather than as the edge of
    // it — plus the last-price badge sits up there on a rising day.
    const dLo = lo - spread * 0.1;
    const dHi = hi + spread * 0.18;
    const span = dHi - dLo;
    const y = (c: number) => PLOT_H - ((c - dLo) / span) * PLOT_H;
    const { ticks, step } = niceTicks(dLo, dHi, 5);
    // Prices read as prices: two decimals unless the step is coarse enough that
    // they would only ever be ".00" (matching the reference's 147.50 / 148.00).
    const decimals = step >= 10 ? 0 : step >= 0.01 ? 2 : 4;

    // ── x: 1D is laid out across the session clock so a half-finished day
    //    draws across half the plot (as the reference does). Everything else
    //    is index-based.
    const xOf = singleSession
      ? (i: number) => {
          const t = bars[i].t ?? Date.parse(bars[i].date);
          return (
            ((clamp(etMinutes(t), SESSION_OPEN, SESSION_CLOSE) - SESSION_OPEN) / SESSION_SPAN) *
            plotW
          );
        }
      : (i: number) => (i / (bars.length - 1)) * plotW;

    const pts = closes.map((c, i) => ({ x: xOf(i), y: y(c) }));

    // ── x labels
    const raw: { x: number; text: string; bold?: boolean }[] = [];
    if (singleSession) {
      for (const m of sessionTicks(90)) {
        raw.push({ x: ((m - SESSION_OPEN) / SESSION_SPAN) * plotW, text: fmtSessionTime(m) });
      }
    } else if (intraday) {
      // 5D — one label per ET trading day, at that day's first bar.
      let lastDay = "";
      bars.forEach((b, i) => {
        const t = b.t ?? Date.parse(b.date);
        const day = ET_YMD.format(new Date(t));
        if (day !== lastDay) {
          lastDay = day;
          raw.push({ x: xOf(i), text: ET_DAY.format(new Date(t)) });
        }
      });
    } else {
      let lastMonth = "";
      let lastYear = "";
      bars.forEach((b, i) => {
        const t = b.t ?? Date.parse(`${b.date}T12:00:00Z`);
        const d = new Date(t);
        const month = ET_MONTH.format(d);
        const year = String(d.getUTCFullYear());
        if (month !== lastMonth) {
          const isNewYear = month === "Jan" || (lastYear !== "" && year !== lastYear);
          lastMonth = month;
          lastYear = year;
          raw.push({ x: xOf(i), text: isNewYear ? year : month, bold: isNewYear });
        }
      });
      const keep = Math.max(1, Math.ceil(raw.length / 8));
      raw.splice(0, raw.length, ...raw.filter((_, i) => i % keep === 0));
    }

    // Keep the first/last label inside the plot instead of clipping it mid-glyph.
    const labels = raw.map((l) => {
      const half = l.text.length * 4.2 + 2;
      if (l.x - half < 0) return { ...l, x: 1, anchor: "start" as const };
      if (l.x + half > plotW) return { ...l, x: plotW - 1, anchor: "end" as const };
      return { ...l, anchor: "middle" as const };
    });

    return { pts, y, ticks, decimals, labels, ref, lastX: pts[pts.length - 1].x };
  }, [bars, intraday, singleSession, previousClose, plotW]);

  const first = bars[0]?.close ?? 0;
  const last = bars[bars.length - 1]?.close ?? 0;
  // 1D is measured against the previous close (so the chart's colour and its
  // period return agree with the quote's change), every other range against
  // its own first bar — the same convention as the reference.
  const baseline = singleSession && previousClose != null ? previousClose : first;
  const chg = baseline ? ((last - baseline) / baseline) * 100 : 0;
  const up = last >= baseline;
  const color = up ? "var(--sa-up)" : "var(--sa-down)";
  const gradId = `sa-area-${ticker}-${range}`;

  const onMove = (e: React.MouseEvent) => {
    const el = wrapRef.current;
    if (!el || !geo || bars.length < 2) return;
    const rect = el.getBoundingClientRect();
    const px = clamp(e.clientX - rect.left, 0, rect.width);
    // Nearest point by x — correct for the time-based 1D axis too.
    let bestI = 0;
    let bestD = Infinity;
    geo.pts.forEach((p, i) => {
      const d = Math.abs(p.x - px);
      if (d < bestD) {
        bestD = d;
        bestI = i;
      }
    });
    setHover(bestI);
  };
  const hb = hover != null ? bars[hover] : null;
  const fmtTip = (b: Bar) => {
    const t = b.t ?? Date.parse(b.date);
    return intraday ? ET_FULL.format(new Date(t)) : fmtDate(b.date);
  };

  return (
    <div className="min-w-0">
      {/* range buttons + period return */}
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center">
          {RANGES.map((r) => {
            const on = r.key === range;
            return (
              <button
                key={r.key}
                onClick={() => {
                  setRange(r.key);
                  setHover(null);
                }}
                className="rounded-md"
                style={{
                  fontSize: "15.2px",
                  padding: "4px 10px",
                  fontWeight: on ? 600 : 400,
                  color: on ? "var(--sa-btn-text)" : "var(--sa-text)",
                  background: on ? "var(--sa-btn-bg)" : "transparent",
                }}
              >
                {r.label}
              </button>
            );
          })}
        </div>
        {bars.length > 1 && (
          <span className="tabular whitespace-nowrap" style={{ fontSize: "15.2px" }}>
            <span style={{ color, fontWeight: 600 }}>
              {chg >= 0 ? "+" : ""}
              {chg.toFixed(2)}%
            </span>{" "}
            <span style={{ color: "var(--sa-text)" }}>
              ({RANGES.find((r) => r.key === range)?.label})
            </span>
          </span>
        )}
      </div>

      <div className="flex">
        {/* plot */}
        <div
          ref={wrapRef}
          className="relative min-w-0 flex-1 overflow-hidden"
          style={{ height: PLOT_H + AXIS_H }}
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
        >
          {isLoading && !geo ? (
            <div className="shimmer rounded" style={{ height: PLOT_H }} />
          ) : !geo ? (
            <div
              className="text-mute flex items-center justify-center text-sm"
              style={{ height: PLOT_H }}
            >
              No price history available.
            </div>
          ) : (
            <>
              <svg
                width={plotW}
                height={PLOT_H + AXIS_H}
                viewBox={`0 0 ${plotW} ${PLOT_H + AXIS_H}`}
                className="block"
              >
                <defs>
                  <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity="0.18" />
                    <stop offset="100%" stopColor={color} stopOpacity="0" />
                  </linearGradient>
                </defs>

                {/* gridlines at the nice ticks */}
                {geo.ticks.map((t) => (
                  <line
                    key={`g${t}`}
                    x1={0}
                    x2={plotW}
                    y1={geo.y(t)}
                    y2={geo.y(t)}
                    stroke="var(--sa-grid)"
                    strokeWidth={1}
                  />
                ))}

                {/* previous close — dotted, inside the plot because the y
                    domain always includes it plus padding */}
                {geo.ref != null && (
                  <line
                    x1={0}
                    x2={plotW}
                    y1={geo.y(geo.ref)}
                    y2={geo.y(geo.ref)}
                    stroke="var(--sa-ref)"
                    strokeWidth={1}
                    strokeDasharray="1 3"
                  />
                )}

                {/* area — closes at the last point, so a partial session does
                    not stretch the fill to the right edge */}
                <path
                  d={
                    `M ${geo.pts[0].x.toFixed(2)},${geo.pts[0].y.toFixed(2)} ` +
                    geo.pts
                      .slice(1)
                      .map((p) => `L ${p.x.toFixed(2)},${p.y.toFixed(2)}`)
                      .join(" ") +
                    ` L ${geo.lastX.toFixed(2)},${PLOT_H} L ${geo.pts[0].x.toFixed(2)},${PLOT_H} Z`
                  }
                  fill={`url(#${gradId})`}
                />
                <path
                  d={
                    `M ${geo.pts[0].x.toFixed(2)},${geo.pts[0].y.toFixed(2)} ` +
                    geo.pts
                      .slice(1)
                      .map((p) => `L ${p.x.toFixed(2)},${p.y.toFixed(2)}`)
                      .join(" ")
                  }
                  fill="none"
                  stroke={color}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />

                {hover != null && geo.pts[hover] && (
                  <line
                    x1={geo.pts[hover].x}
                    y1={0}
                    x2={geo.pts[hover].x}
                    y2={PLOT_H}
                    stroke="var(--sa-ref)"
                    strokeWidth={1}
                    strokeDasharray="4 3"
                  />
                )}

                {/* x labels sit in their own strip under the plot */}
                {geo.labels.map((l, i) => (
                  <text
                    key={i}
                    x={l.x}
                    y={PLOT_H + 20}
                    textAnchor={l.anchor}
                    style={{
                      fontSize: 14,
                      fill: "var(--sa-text)",
                      fontWeight: 600,
                    }}
                  >
                    {l.text}
                  </text>
                ))}
              </svg>

              {/* tooltip */}
              {hb && hover != null && (
                <div
                  className="pointer-events-none absolute rounded px-2.5 py-1.5 text-[13px] shadow-lg"
                  style={{
                    left: `${(geo.pts[hover].x / Math.max(1, plotW)) * 100}%`,
                    top: 6,
                    transform:
                      geo.pts[hover].x / Math.max(1, plotW) > 0.5
                        ? "translateX(calc(-100% - 10px))"
                        : "translateX(10px)",
                    background: "var(--bg-1)",
                    border: "1px solid var(--border-strong)",
                    whiteSpace: "nowrap",
                    fontFamily: SA_FONT,
                  }}
                >
                  <div className="tabular font-semibold">{hb.close.toFixed(2)}</div>
                  <div style={{ color: "var(--text-mute)" }}>{fmtTip(hb)}</div>
                </div>
              )}
            </>
          )}
        </div>

        {/* right price axis */}
        {geo && (
          <div
            className="tabular relative flex-shrink-0"
            style={{ width: GUTTER, height: PLOT_H + AXIS_H }}
          >
            {geo.ticks.map((t) => (
              <span
                key={t}
                className="absolute"
                style={{
                  fontSize: 14,
                  top: geo.y(t),
                  left: 10,
                  transform: "translateY(-50%)",
                  color: "var(--sa-text)",
                }}
              >
                {t.toFixed(geo.decimals)}
              </span>
            ))}
            {bars.length > 1 && (
              <span
                className="absolute rounded-sm px-1.5 py-[2px] text-[14px] font-semibold"
                style={{
                  top: geo.y(last),
                  left: 4,
                  transform: "translateY(-50%)",
                  background: color,
                  color: "#fff",
                }}
              >
                {last.toFixed(last >= 10_000 ? 0 : 2)}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── The full header block ─────────────────────────────────────────────── */

export function SAProfileHeader({
  ticker,
  name,
  exchange,
  country,
  stats,
  tabs,
  activeTab,
  onTab,
}: {
  ticker: string;
  name: string;
  exchange?: string | null;
  country?: string | null;
  stats: Stats | null;
  tabs: [string, string][];
  activeTab: string;
  onTab: (key: string) => void;
}) {
  const { has, toggle } = useWatchlist();
  const watching = has(ticker);
  const price = stats?.price ?? null;
  const change = stats?.change ?? null;
  const changePct = stats?.changePct ?? null;
  const up = (change ?? 0) >= 0;
  const currency = stats?.currency || "USD";
  const sym = cur(currency);

  // Market clock ticks on the client only, so render it after mount to keep
  // the server and first client paint identical.
  const [clock, setClock] = useState<string | null>(null);
  useEffect(() => {
    setClock(nyLine());
    const id = setInterval(() => setClock(nyLine()), 30_000);
    return () => clearInterval(id);
  }, []);

  /* ── growth for Market Cap / Revenue (ttm) / Net Income / EPS ──────────
     Market Cap growth is the 1-year change from /market-stats/performance
     (`y1`); the three fundamentals are TTM-vs-prior-TTM, summed client-side
     from the 13 quarters /market-stats/statements returns. Anything the
     backend cannot cover renders as nothing rather than a zero. */
  const { data: perf } = useSWR<{ returns: Record<string, { y1: number | null }> }>(
    `${API_BASE}/market-stats/performance?symbols=${encodeURIComponent(ticker)}`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 10 * 60_000 },
  );
  const { data: stmts } = useSWR<{ income?: QuarterRow[] }>(
    `${API_BASE}/market-stats/statements?symbol=${encodeURIComponent(ticker)}`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 10 * 60_000 },
  );

  const marketCapGrowth = perf?.returns?.[ticker]?.y1 ?? null;
  const income = stmts?.income;
  const revenueGrowth = useMemo(() => ttmGrowth(income, "TotalRevenue"), [income]);
  const netIncomeGrowth = useMemo(() => ttmGrowth(income, "NetIncome"), [income]);
  const epsGrowth = useMemo(() => ttmGrowth(income, "DilutedEPS"), [income]);

  const rangeText = (lo: number | null, hi: number | null) =>
    lo != null && hi != null ? `${lo.toFixed(2)} - ${hi.toFixed(2)}` : "n/a";

  const isUS = !country || country === "United States" || country === "USA";
  const ex = exchangeLabel(exchange);

  /* Action buttons render twice: top-right on desktop (reference layout),
     below the chart on mobile — so both spots share one definition. */
  type Action = {
    label: string;
    icon: typeof Maximize2;
    href?: string;
    onClick?: () => void;
  };
  const actions: Action[] = [
    { label: "Full Chart", icon: Maximize2, href: `/chart/${encodeURIComponent(ticker)}` },
    { label: watching ? "Watching" : "Watchlist", icon: Plus, onClick: () => toggle(ticker) },
    { label: "Alerts", icon: Bell, href: "/alerts" },
    { label: "Compare", icon: Copy, href: `/compare?symbols=${encodeURIComponent(ticker)}` },
  ];
  const renderAction = (b: Action, extra = "") => {
    const inner = (
      <>
        <b.icon className="h-[17px] w-[17px]" />
        {b.label}
      </>
    );
    const cls = `inline-flex items-center gap-2 px-4 h-[42px] rounded-lg text-[15px] font-semibold ${extra}`;
    const style = { background: "var(--brand-surface)", color: "#fff" } as const;
    return b.href ? (
      <Link key={b.label} href={b.href} className={cls} style={style}>
        {inner}
      </Link>
    ) : (
      <button key={b.label} type="button" onClick={b.onClick} className={cls} style={style}>
        {inner}
      </button>
    );
  };

  return (
    <section className="sa-head w-full" style={{ fontFamily: SA_FONT, color: "var(--sa-text)" }}>
      {/* ── name row + actions ── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1
            style={{
              fontSize: 26,
              fontWeight: 700,
              lineHeight: "32px",
              letterSpacing: "normal",
              color: "var(--sa-text)",
              margin: 0,
            }}
          >
            {titleCase(name)} ({isUS ? ticker : `${ex ? ex + ":" : ""}${ticker}`})
          </h1>
          <div
            style={{
              marginTop: 1,
              fontSize: "12.8px",
              fontWeight: 400,
              lineHeight: "18.4px",
              color: "var(--sa-faded)",
            }}
          >
            {isUS && ex && ex !== "OTC"
              ? `${ex}: ${ticker} · Real-Time Price · ${currency}`
              : `${country || "United States"} · Delayed Price · Currency is ${currency}`}
          </div>
        </div>
        {/* Desktop keeps the reference's top-right action row; on mobile the
            same actions render below the chart (as the reference does). */}
        <div className="hidden flex-wrap items-center gap-2.5 pt-1 lg:flex">
          {actions.map((b) => renderAction(b))}
        </div>
      </div>

      {/* ── price block ── */}
      <div className="mt-5">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <span
            className="tabular"
            style={{ fontSize: 36, fontWeight: 700, lineHeight: "40px", color: "var(--sa-text)" }}
          >
            {price != null ? price.toFixed(2) : "—"}
          </span>
          {change != null && changePct != null && (
            <span
              className="tabular"
              style={{
                fontSize: 24,
                fontWeight: 600,
                color:
                  change === 0 ? "var(--sa-faded)" : up ? "var(--sa-up)" : "var(--sa-down)",
              }}
            >
              {change >= 0 ? "+" : ""}
              {change.toFixed(2)} ({changePct >= 0 ? "+" : ""}
              {changePct.toFixed(2)}%)
            </span>
          )}
        </div>
        <div
          style={{ marginTop: 4, fontSize: 14, fontWeight: 400, color: "var(--sa-faded)" }}
          suppressHydrationWarning
        >
          {clock ?? " "}
        </div>
      </div>

      {/* ── tab bar ── */}
      <nav
        className="mt-5 w-full"
        style={{ borderBottom: "2px solid var(--sa-nav-border)" }}
      >
        <div className="scrollbar-none flex items-center overflow-x-auto">
          {tabs.map(([key, label]) => {
            const on = key === activeTab;
            return (
              <button
                key={key}
                onClick={() => onTab(key)}
                aria-current={on ? "page" : undefined}
                className="whitespace-nowrap"
                style={{
                  fontSize: 16,
                  lineHeight: "24px",
                  padding: "8px 20px",
                  borderRadius: 0,
                  fontWeight: on ? 600 : 400,
                  color: on ? "var(--sa-text)" : "var(--sa-tab-blue)",
                  background: on ? "var(--sa-tab-active-bg)" : "transparent",
                }}
              >
                {label}
              </button>
            );
          })}
          <Link
            href={`/chart/${encodeURIComponent(ticker)}`}
            className="inline-flex items-center gap-1.5 whitespace-nowrap"
            style={{
              fontSize: 16,
              lineHeight: "24px",
              padding: "8px 20px",
              fontWeight: 400,
              color: "var(--sa-tab-blue)",
            }}
          >
            Chart <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </nav>

      {/* ── stats + chart ── */}
      {/* The two stat tracks are sized to their content (`max-content`) rather
          than pinned to the reference's 236/237px: a table refuses to lay out
          below its own min-content width, so any cap narrower than the widest
          row made the table spill into the next track. `210px` keeps a narrow
          ticker's column from collapsing, and the chart still takes the rest. */}
      {/* Mobile follows the reference's phone layout: chart first, then the
          action buttons, then the two stat lists side by side (grid-cols-2).
          Desktop keeps the reference's three tracks: stats, stats, chart. */}
      <div className="mt-4 grid grid-cols-2 items-start gap-x-5 gap-y-6 lg:grid-cols-[minmax(210px,max-content)_minmax(210px,max-content)_minmax(0,1fr)]">
        <StatTable>
          <StatRow label="Market Cap" href={`/companies/${ticker}?tab=financials`}>
            {abbr(stats?.marketCap)}
            <Growth v={marketCapGrowth} />
          </StatRow>
          <StatRow label="Revenue (ttm)" href={`/companies/${ticker}?tab=financials`}>
            {abbr(stats?.revenue)}
            <Growth v={revenueGrowth} />
          </StatRow>
          <StatRow label="Net Income">
            {abbr(stats?.netIncome)}
            <Growth v={netIncomeGrowth} />
          </StatRow>
          <StatRow label="EPS">
            {stats?.eps != null ? stats.eps.toFixed(2) : "n/a"}
            <Growth v={epsGrowth} />
          </StatRow>
          <StatRow label="Shares Out" info>
            {abbr(stats?.sharesOut)}
          </StatRow>
          <StatRow label="PE Ratio">
            {stats?.peRatio != null ? stats.peRatio.toFixed(2) : "n/a"}
          </StatRow>
          <StatRow label="Forward PE">
            {stats?.forwardPE != null ? stats.forwardPE.toFixed(2) : "n/a"}
          </StatRow>
          <StatRow label="Dividend" href={`/companies/${ticker}?tab=ownership`}>
            {stats?.dividendRate != null ? `${sym}${stats.dividendRate.toFixed(2)}` : "n/a"}
            {stats?.dividendRate != null && stats?.dividendYield != null && (
              <span>({stats.dividendYield.toFixed(2)}%)</span>
            )}
          </StatRow>
          <StatRow label="Ex-Dividend Date">
            {stats?.exDividendDate ? fmtDate(stats.exDividendDate) : "n/a"}
          </StatRow>
        </StatTable>

        <StatTable>
          <StatRow label="Volume">
            {stats?.volume != null ? stats.volume.toLocaleString() : "n/a"}
          </StatRow>
          <StatRow label="Open">{stats?.open != null ? stats.open.toFixed(2) : "n/a"}</StatRow>
          <StatRow label="Previous Close">
            {stats?.previousClose != null ? stats.previousClose.toFixed(2) : "n/a"}
          </StatRow>
          <StatRow label="Day's Range">
            {rangeText(stats?.dayLow ?? null, stats?.dayHigh ?? null)}
          </StatRow>
          <StatRow label="52-Week Range">
            {rangeText(stats?.week52Low ?? null, stats?.week52High ?? null)}
          </StatRow>
          <StatRow label="Beta">{stats?.beta != null ? stats.beta.toFixed(2) : "n/a"}</StatRow>
          <StatRow label="Analysts" href={`/companies/${ticker}?tab=forecast`}>
            {stats?.analystRating ? RATING_LABEL[stats.analystRating] || stats.analystRating : "n/a"}
          </StatRow>
          <StatRow label="Price Target" href={`/companies/${ticker}?tab=forecast`}>
            {stats?.priceTarget != null ? stats.priceTarget.toFixed(2) : "n/a"}
            {stats?.priceTarget != null && stats.priceTargetUpsidePct != null && (
              <span>
                ({stats.priceTargetUpsidePct >= 0 ? "+" : ""}
                {stats.priceTargetUpsidePct.toFixed(2)}%)
              </span>
            )}
          </StatRow>
          <StatRow label="Earnings Date">
            {stats?.earningsDate ? fmtDate(stats.earningsDate) : "n/a"}
          </StatRow>
        </StatTable>

        <div
          className="-order-2 col-span-2 min-w-0 lg:order-none lg:col-span-1 lg:border-l lg:pl-7"
          style={{ borderColor: "var(--sa-row-border)" }}
        >
          <SAChart ticker={ticker} previousClose={stats?.previousClose ?? null} />
        </div>

        {/* Mobile action buttons — Full Chart full-width, the rest 3-across. */}
        <div className="-order-1 col-span-2 flex flex-col gap-2.5 lg:hidden">
          {renderAction(actions[0], "justify-center w-full")}
          <div className="grid grid-cols-3 gap-2.5">
            {actions.slice(1).map((b) => renderAction(b, "justify-center px-2 text-[14px]"))}
          </div>
        </div>
      </div>
    </section>
  );
}
