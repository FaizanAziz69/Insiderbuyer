"use client";
import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Maximize2, Plus, Bell, Copy, ArrowRight } from "lucide-react";
import { API_BASE, fetcher } from "@/lib/api";
import { useWatchlist } from "@/lib/watchlist";

/* ────────────────────────────────────────────────────────────────────────
   stockanalysis.com-style profile head (client spec: identical) —
   name row + action buttons, big price block, underlined tab bar, then a
   three-column region: two hairline stat columns and the period chart with
   a right-hand axis, last-price badge and month x-labels. Clean page
   background, no cards, system font stack.
   ──────────────────────────────────────────────────────────────────────── */

const SA_FONT =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

/** SA palette — red/green series exactly like the reference. */
const SA_UP = "#199d5c";
const SA_DOWN = "#dc2f3e";
/** stockanalysis.com link blue — inactive tabs, "Chart ->". */
const SA_BLUE = "#1e63c9";

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
  const ny = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const mins = ny.getHours() * 60 + ny.getMinutes();
  const wd = ny.getDay();
  const open = wd >= 1 && wd <= 5 && mins >= 570 && mins < 960;
  return `${dt.replace(", ", ", ").replace(" GMT", " ")} - Market ${open ? "open" : "closed"}`;
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

const abbr = (n: number | null | undefined, currency = ""): string => {
  if (n == null || !Number.isFinite(n)) return "n/a";
  const a = Math.abs(n);
  const p = currency === "USD" || currency === "" ? "" : "";
  if (a >= 1e12) return `${p}${(n / 1e12).toFixed(2)}T`;
  if (a >= 1e9) return `${p}${(n / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${p}${(n / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${p}${(n / 1e3).toFixed(2)}K`;
  return `${p}${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
};

function Delta({ v }: { v: number | null | undefined }) {
  if (v == null || !Number.isFinite(v)) return null;
  return (
    <span
      style={{ color: v >= 0 ? SA_UP : SA_DOWN }}
      className="ml-1.5 font-medium tabular"
    >
      {v >= 0 ? "+" : ""}
      {v.toFixed(1)}%
    </span>
  );
}

function StatRow({
  label,
  children,
  href,
}: {
  label: string;
  children: React.ReactNode;
  href?: string;
}) {
  return (
    <div
      className="flex items-baseline justify-between gap-3 py-[9px]"
      style={{ borderBottom: "1px solid var(--border)" }}
    >
      {href ? (
        <Link
          href={href}
          className="text-[15px] whitespace-nowrap"
          style={{
            color: "var(--text)",
            textDecoration: "underline",
            textDecorationColor: "var(--text-faint)",
            textUnderlineOffset: 3,
            fontWeight: 400,
          }}
        >
          {label}
        </Link>
      ) : (
        <span className="text-[15px] whitespace-nowrap" style={{ color: "var(--text)", fontWeight: 400 }}>
          {label}
        </span>
      )}
      <span className="text-[15px] font-semibold tabular text-right" style={{ color: "var(--text)" }}>
        {children}
      </span>
    </div>
  );
}

/* ── SA-style chart ────────────────────────────────────────────────────── */

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

function SAChart({ ticker, previousClose }: { ticker: string; previousClose?: number | null }) {
  const [range, setRange] = useState("1d");
  const [hover, setHover] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const { data, isLoading } = useSWR<{ history: { bars: Bar[]; intraday?: boolean } | null }>(
    `${API_BASE}/market-stats/history?symbol=${encodeURIComponent(ticker)}&range=${range}`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60_000 },
  );
  const bars = useMemo(() => data?.history?.bars || [], [data]);
  const intraday = !!data?.history?.intraday || range === "1d" || range === "5d";

  const W = 1000;
  const H = 380;
  const PAD_B = 26; // month labels

  const geo = useMemo(() => {
    if (bars.length < 2) return null;
    const closes = bars.map((b) => b.close);
    const ref = intraday && previousClose != null ? previousClose : null;
    const lo = Math.min(...closes, ...(ref != null ? [ref] : []));
    const hi = Math.max(...closes, ...(ref != null ? [ref] : []));
    const rng = hi - lo || 1;
    // SA pads the scale slightly so the line never kisses the edges.
    const padLo = lo - rng * 0.06;
    const padHi = hi + rng * 0.06;
    const span = padHi - padLo;
    const ph = H - PAD_B;
    const y = (c: number) => ph - ((c - padLo) / span) * ph;
    const pts = closes.map((c, i) => ({ x: (i / (closes.length - 1)) * W, y: y(c) }));
    // ~5 round ticks
    const ticks: number[] = [];
    const step = span / 5;
    for (let i = 1; i <= 5; i++) ticks.push(padLo + step * i);
    // month x labels (or times intraday)
    const labels: { x: number; text: string }[] = [];
    if (!intraday) {
      let lastMonth = -1;
      bars.forEach((b, i) => {
        const d = new Date(b.t ?? b.date);
        const m = d.getMonth();
        if (m !== lastMonth) {
          lastMonth = m;
          if (i > 0 || bars.length < 40) {
            labels.push({
              x: (i / (bars.length - 1)) * W,
              text: m === 0 ? String(d.getFullYear()) : d.toLocaleString("en-US", { month: "short" }),
            });
          }
        }
      });
      // thin out to ≤8 labels
      const keep = Math.ceil(labels.length / 8);
      labels.splice(
        0,
        labels.length,
        ...labels.filter((_, i) => i % keep === 0),
      );
    } else {
      const n = Math.min(6, bars.length);
      for (let i = 0; i < n; i++) {
        const idx = Math.round((i / (n - 1)) * (bars.length - 1));
        const d = new Date(bars[idx].t ?? bars[idx].date);
        labels.push({
          x: (idx / (bars.length - 1)) * W,
          text: d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
        });
      }
    }
    return { pts, y, ticks, labels, ph, ref };
  }, [bars, intraday, previousClose]);

  const first = bars[0]?.close ?? 0;
  const last = bars[bars.length - 1]?.close ?? 0;
  const chg = first ? ((last - first) / first) * 100 : 0;
  const up = last >= first;
  const color = up ? SA_UP : SA_DOWN;

  const onMove = (e: React.MouseEvent) => {
    const el = wrapRef.current;
    if (!el || bars.length < 2) return;
    const rect = el.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    setHover(Math.round(frac * (bars.length - 1)));
  };
  const hb = hover != null ? bars[hover] : null;

  return (
    <div className="min-w-0">
      {/* range buttons + period return */}
      <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
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
                className="px-[11px] py-[5px] text-[15px] rounded-md"
                style={{
                  fontWeight: on ? 600 : 400,
                  color: "var(--text)",
                  background: on ? "var(--bg-3)" : "transparent",
                }}
              >
                {r.label}
              </button>
            );
          })}
        </div>
        {bars.length > 1 && (
          <span className="text-[15px] tabular whitespace-nowrap">
            <span style={{ color, fontWeight: 600 }}>
              {chg >= 0 ? "+" : ""}
              {chg.toFixed(2)}%
            </span>{" "}
            <span style={{ color: "var(--text)" }}>({RANGES.find((r) => r.key === range)?.label})</span>
          </span>
        )}
      </div>

      <div className="flex">
        {/* plot */}
        <div
          ref={wrapRef}
          className="relative flex-1 min-w-0"
          style={{ height: H }}
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
        >
          {isLoading && !geo ? (
            <div className="shimmer rounded" style={{ height: H - PAD_B }} />
          ) : !geo ? (
            <div className="flex items-center justify-center text-mute text-sm" style={{ height: H - PAD_B }}>
              No price history available.
            </div>
          ) : (
            <>
              <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-full">
                <defs>
                  <linearGradient id={`sa-area-${ticker}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity="0.45" />
                    <stop offset="100%" stopColor={color} stopOpacity="0.03" />
                  </linearGradient>
                </defs>
                {/* faint gridlines at ticks */}
                {geo.ticks.map((t, i) => (
                  <line
                    key={i}
                    x1={0}
                    x2={W}
                    y1={geo.y(t)}
                    y2={geo.y(t)}
                    stroke="var(--border)"
                    strokeWidth={1}
                    vectorEffect="non-scaling-stroke"
                    opacity={0.6}
                  />
                ))}
                {geo.ref != null && (
                  <line
                    x1={0}
                    x2={W}
                    y1={geo.y(geo.ref)}
                    y2={geo.y(geo.ref)}
                    stroke="var(--text-mute)"
                    strokeWidth={1}
                    strokeDasharray="2 4"
                    vectorEffect="non-scaling-stroke"
                  />
                )}
                <path
                  d={
                    "M " +
                    geo.pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" L ") +
                    ` L ${W},${geo.ph} L 0,${geo.ph} Z`
                  }
                  fill={`url(#sa-area-${ticker})`}
                />
                <path
                  d={"M " + geo.pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" L ")}
                  fill="none"
                  stroke={color}
                  strokeWidth="2"
                  vectorEffect="non-scaling-stroke"
                />
                {hover != null && geo.pts[hover] && (
                  <line
                    x1={geo.pts[hover].x}
                    y1={0}
                    x2={geo.pts[hover].x}
                    y2={geo.ph}
                    stroke="var(--text-mute)"
                    strokeWidth="1"
                    strokeDasharray="4 3"
                    vectorEffect="non-scaling-stroke"
                  />
                )}
                {/* month / time labels */}
                {geo.labels.map((l, i) => (
                  <text
                    key={i}
                    x={l.x}
                    y={H - 8}
                    textAnchor="middle"
                    style={{ fontSize: 13, fill: "var(--text)", fontWeight: l.text.length === 4 ? 600 : 400 }}
                  >
                    {l.text}
                  </text>
                ))}
              </svg>

              {/* tooltip */}
              {hb && hover != null && (
                <div
                  className="absolute pointer-events-none rounded px-2.5 py-1.5 text-[13px] shadow-lg"
                  style={{
                    left: `${(hover / (bars.length - 1)) * 100}%`,
                    top: 6,
                    transform:
                      hover / (bars.length - 1) > 0.5
                        ? "translateX(calc(-100% - 10px))"
                        : "translateX(10px)",
                    background: "var(--bg-1)",
                    border: "1px solid var(--border-strong)",
                    whiteSpace: "nowrap",
                    fontFamily: SA_FONT,
                  }}
                >
                  <div className="font-semibold tabular">{hb.close.toFixed(2)}</div>
                  <div style={{ color: "var(--text-mute)" }}>
                    {new Date(hb.t ?? hb.date).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* right axis */}
        {geo && (
          <div
            className="relative flex-shrink-0 tabular"
            style={{ width: 64, height: H, borderLeft: "1px solid var(--border)" }}
          >
            {geo.ticks.map((t, i) => (
              <span
                key={i}
                className="absolute text-[13px]"
                style={{
                  top: (geo.y(t) / H) * 100 + "%",
                  left: 10,
                  transform: "translateY(-50%)",
                  color: "var(--text)",
                }}
              >
                {t >= 1000 ? t.toFixed(0) : t.toFixed(2)}
              </span>
            ))}
            {/* last price badge */}
            {bars.length > 1 && (
              <span
                className="absolute text-[13px] font-semibold px-1.5 py-[2px] rounded-sm"
                style={{
                  top: (geo.y(last) / H) * 100 + "%",
                  left: 4,
                  transform: "translateY(-50%)",
                  background: color,
                  color: "#fff",
                }}
              >
                {last >= 1000 ? last.toFixed(0) : last.toFixed(2)}
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

  const dateLine = nyLine();

  const range = (lo: number | null, hi: number | null) =>
    lo != null && hi != null ? `${lo.toFixed(2)} - ${hi.toFixed(2)}` : "n/a";

  return (
    <section style={{ fontFamily: SA_FONT }} className="w-full">
      {/* ── name row + actions ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1
            className="font-bold"
            style={{ fontFamily: SA_FONT, fontSize: 32, lineHeight: 1.15, letterSpacing: "-0.01em", color: "var(--text)", fontWeight: 700 }}
          >
            {titleCase(name)} ({(() => {
              const ex = exchangeLabel(exchange);
              const us = !country || country === "United States" || country === "USA";
              return us ? ticker : `${ex ? ex + ":" : ""}${ticker}`;
            })()})
          </h1>
          <div className="mt-1 text-[15px]" style={{ color: "var(--text-soft)" }}>
            {(() => {
              const ex = exchangeLabel(exchange);
              const us = !country || country === "United States" || country === "USA";
              return us && ex && ex !== "OTC"
                ? `${ex}: ${ticker} · Real-Time Price · ${currency}`
                : `${country || "United States"} · Delayed Price · Currency is ${currency}`;
            })()}
          </div>
        </div>
        <div className="flex items-center gap-2.5 flex-wrap pt-1">
          {[
            { label: "Full Chart", icon: Maximize2, href: `/chart/${encodeURIComponent(ticker)}` },
            { label: watching ? "Watching" : "Watchlist", icon: Plus, onClick: () => toggle(ticker) },
            { label: "Alerts", icon: Bell, href: "/alerts" },
            { label: "Compare", icon: Copy, href: `/compare?symbols=${encodeURIComponent(ticker)}` },
          ].map((b) => {
            const inner = (
              <>
                <b.icon className="h-[17px] w-[17px]" />
                {b.label}
              </>
            );
            const cls = "inline-flex items-center gap-2 px-4 h-[42px] rounded-lg text-[15px] font-semibold";
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
          })}
        </div>
      </div>

      {/* ── price block ── */}
      <div className="mt-5">
        <div className="flex items-baseline gap-3 flex-wrap">
          <span className="tabular font-bold" style={{ fontSize: 42, lineHeight: 1, color: "var(--text)" }}>
            {price != null ? price.toFixed(2) : "—"}
          </span>
          {change != null && changePct != null && (
            <span className="tabular" style={{ fontSize: 24, fontWeight: 500, color: change === 0 ? "var(--text-soft)" : up ? SA_UP : SA_DOWN }}>
              {change >= 0 ? "+" : ""}
              {change.toFixed(2)} ({changePct >= 0 ? "+" : ""}
              {changePct.toFixed(2)}%)
            </span>
          )}
        </div>
        <div className="mt-1.5 text-[15px]" style={{ color: "var(--text-soft)" }}>
          {dateLine}
        </div>
      </div>

      {/* ── tab bar ── */}
      <div className="mt-5" style={{ borderBottom: `2px solid ${SA_BLUE}` }}>
        <div className="flex items-center gap-0.5 overflow-x-auto scrollbar-none">
          {tabs.map(([key, label]) => {
            const on = key === activeTab;
            return (
              <button
                key={key}
                onClick={() => onTab(key)}
                className="px-[15px] py-[9px] text-[16px] whitespace-nowrap rounded-t-md"
                style={{
                  fontWeight: on ? 600 : 400,
                  color: on ? "var(--text)" : SA_BLUE,
                  background: on ? "var(--bg-3)" : "transparent",
                }}
              >
                {label}
              </button>
            );
          })}
          <Link
            href={`/chart/${encodeURIComponent(ticker)}`}
            className="px-[15px] py-[9px] text-[16px] whitespace-nowrap inline-flex items-center gap-1.5"
            style={{ color: SA_BLUE, fontWeight: 400 }}
          >
            Chart <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      {/* ── stats + chart ── */}
      <div className="mt-5 grid grid-cols-1 lg:grid-cols-[220px_240px_minmax(0,1fr)] gap-x-9 gap-y-6 items-start">
        <div>
          <StatRow label="Market Cap" href="#">
            {abbr(stats?.marketCap)}
            <Delta v={stats?.changePct} />
          </StatRow>
          <StatRow label="Revenue (ttm)" href="#">{abbr(stats?.revenue)}</StatRow>
          <StatRow label="Net Income">{abbr(stats?.netIncome)}</StatRow>
          <StatRow label="EPS">{stats?.eps != null ? stats.eps.toFixed(2) : "n/a"}</StatRow>
          <StatRow label="Shares Out">{abbr(stats?.sharesOut)}</StatRow>
          <StatRow label="PE Ratio">{stats?.peRatio != null ? stats.peRatio.toFixed(2) : "n/a"}</StatRow>
          <StatRow label="Forward PE">{stats?.forwardPE != null ? stats.forwardPE.toFixed(2) : "n/a"}</StatRow>
          <StatRow label="Dividend" href="#">
            {stats?.dividendRate != null
              ? `${stats.dividendRate.toFixed(2)}${stats?.dividendYield != null ? ` (${stats.dividendYield.toFixed(2)}%)` : ""}`
              : "n/a"}
          </StatRow>
          <StatRow label="Ex-Dividend Date">
            {stats?.exDividendDate
              ? new Date(stats.exDividendDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
              : "n/a"}
          </StatRow>
        </div>
        <div>
          <StatRow label="Volume">{stats?.volume != null ? stats.volume.toLocaleString() : "n/a"}</StatRow>
          <StatRow label="Open">{stats?.open != null ? stats.open.toFixed(2) : "n/a"}</StatRow>
          <StatRow label="Previous Close">
            {stats?.previousClose != null ? stats.previousClose.toFixed(2) : "n/a"}
          </StatRow>
          <StatRow label="Day's Range">{range(stats?.dayLow ?? null, stats?.dayHigh ?? null)}</StatRow>
          <StatRow label="52-Week Range">{range(stats?.week52Low ?? null, stats?.week52High ?? null)}</StatRow>
          <StatRow label="Beta">{stats?.beta != null ? stats.beta.toFixed(2) : "n/a"}</StatRow>
          <StatRow label="Analysts">
            {stats?.analystRating ? RATING_LABEL[stats.analystRating] || stats.analystRating : "n/a"}
          </StatRow>
          <StatRow label="Price Target" href="#">
            {stats?.priceTarget != null ? (
              <>
                {stats.priceTarget.toFixed(2)}
                <Delta v={stats.priceTargetUpsidePct} />
              </>
            ) : (
              "n/a"
            )}
          </StatRow>
          <StatRow label="Earnings Date">
            {stats?.earningsDate
              ? new Date(stats.earningsDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
              : "n/a"}
          </StatRow>
        </div>
        <SAChart ticker={ticker} previousClose={stats?.previousClose ?? null} />
      </div>
    </section>
  );
}
