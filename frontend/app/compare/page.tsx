"use client";
import { Suspense, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { API_BASE, fetcher, formatCurrency } from "@/lib/api";
import { CompanyLogo } from "@/components/CompanyLogo";
import { StockSearch } from "@/components/nav/StockSearch";
import { CHART_RANGES, Bar } from "@/components/PriceChart";

const MAX_SYMBOLS = 6;

/** One line color per compared symbol (stable by slot). */
const LINE_COLORS = ["#2563eb", "#dc2626", "#059669", "#d97706", "#7c3aed", "#0891b2"];

interface CompareStats {
  symbol: string;
  name: string | null;
  price: number | null;
  changePct: number | null;
  marketCap: number | null;
  peRatio: number | null;
  eps: number | null;
  dividendYield: number | null;
  volume: number | null;
  week52Low: number | null;
  week52High: number | null;
  beta: number | null;
  analystRating: string | null;
  priceTarget: number | null;
  priceTargetUpsidePct: number | null;
  earningsDate: string | null;
}

/** Parse the ?s= param: accepts "AAPL,MSFT" and "aapl-vs-msft". */
function parseSymbols(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(/,|-vs-/i)
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
    .filter((s, i, a) => a.indexOf(s) === i)
    .slice(0, MAX_SYMBOLS);
}

export default function ComparePage() {
  return (
    <Suspense fallback={<div className="card p-12 h-64 animate-pulse" />}>
      <CompareInner />
    </Suspense>
  );
}

function CompareInner() {
  const router = useRouter();
  const search = useSearchParams();
  const symbols = parseSymbols(search.get("s"));

  const setSymbols = (next: string[]) => {
    const qs = next.length ? `?s=${encodeURIComponent(next.join(","))}` : "";
    router.replace(`/compare${qs}`, { scroll: false });
  };

  const add = (sym: string) => {
    const s = sym.trim().toUpperCase();
    if (!s || symbols.includes(s) || symbols.length >= MAX_SYMBOLS) return;
    setSymbols([...symbols, s]);
  };
  const remove = (sym: string) => setSymbols(symbols.filter((s) => s !== sym));

  return (
    <div className="w-full">
      <h1 className="text-[24px] sm:text-[28px] font-bold tracking-tight leading-tight">
        Compare Stocks
      </h1>
      <p className="text-mute text-[13.5px] mt-1 mb-5">
        Chart performance side by side and line up the key numbers — add up to{" "}
        {MAX_SYMBOLS} tickers.
      </p>

      {/* Symbol picker: current chips + search-to-add */}
      <div className="card p-4 mb-5">
        <div className="flex flex-wrap items-center gap-2">
          {symbols.map((s, i) => (
            <span
              key={s}
              className="inline-flex items-center gap-1.5 rounded-md pl-2.5 pr-1.5 h-8 text-[13px] font-bold font-mono"
              style={{
                background: "var(--accent-soft)",
                border: `1.5px solid ${LINE_COLORS[i % LINE_COLORS.length]}`,
              }}
            >
              <span style={{ color: LINE_COLORS[i % LINE_COLORS.length] }}>{s}</span>
              <button
                type="button"
                aria-label={`Remove ${s}`}
                onClick={() => remove(s)}
                className="h-5 w-5 rounded flex items-center justify-center text-mute hover:text-accent"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
          {symbols.length < MAX_SYMBOLS && (
            <StockSearch
              className="w-[260px]"
              dark={false}
              placeholder="Add ticker to compare…"
              onSelect={(r) => add(r.symbol)}
            />
          )}
        </div>
      </div>

      {symbols.length === 0 ? (
        <div className="card p-12 text-center text-mute">
          Add a ticker above to start comparing.
        </div>
      ) : (
        <>
          <CompareChart symbols={symbols} />
          <CompareTable symbols={symbols} />
        </>
      )}
    </div>
  );
}

// ── Normalized %-change overlay chart ────────────────────────────────────────

function CompareChart({ symbols }: { symbols: string[] }) {
  const [range, setRange] = useState<string>("1y");
  const [hover, setHover] = useState<number | null>(null); // 0–1000 x position
  const wrapRef = useRef<HTMLDivElement>(null);

  const { data, isLoading } = useSWR<
    { symbol: string; bars: Bar[]; intraday: boolean }[]
  >(
    `compare-hist:${symbols.join(",")}:${range}`,
    async () =>
      Promise.all(
        symbols.map(async (s) => {
          try {
            const r = await fetch(
              `${API_BASE}/market-stats/history?symbol=${encodeURIComponent(s)}&range=${range}`,
            );
            const d = await r.json();
            return {
              symbol: s,
              bars: (d?.history?.bars || []) as Bar[],
              intraday: !!d?.history?.intraday,
            };
          } catch {
            return { symbol: s, bars: [], intraday: false };
          }
        }),
      ),
    { revalidateOnFocus: false, dedupingInterval: 60_000 },
  );

  const W = 1000;
  const H = 340;

  // Each series normalized to % change from its first close; the y-scale is
  // shared so the lines are directly comparable.
  const series = useMemo(() => {
    const rows = (data || [])
      .filter((d) => d.bars.length >= 2)
      .map((d) => {
        const base = d.bars[0].close || 1;
        return {
          symbol: d.symbol,
          bars: d.bars,
          pct: d.bars.map((b) => ((b.close - base) / base) * 100),
        };
      });
    if (!rows.length) return null;
    const all = rows.flatMap((r) => r.pct);
    const min = Math.min(...all, 0);
    const max = Math.max(...all, 0);
    const rng = max - min || 1;
    return {
      min,
      max,
      zeroY: H - ((0 - min) / rng) * H,
      lines: rows.map((r) => ({
        symbol: r.symbol,
        bars: r.bars,
        pct: r.pct,
        d:
          "M " +
          r.pct
            .map(
              (p, i) =>
                `${((i / (r.pct.length - 1)) * W).toFixed(1)},${(H - ((p - min) / rng) * H).toFixed(1)}`,
            )
            .join(" L "),
      })),
    };
  }, [data]);

  const onMove = (e: React.MouseEvent) => {
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setHover(Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)));
  };

  const colorOf = (sym: string) =>
    LINE_COLORS[symbols.indexOf(sym) % LINE_COLORS.length];

  return (
    <div className="card p-5 mb-5">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex flex-wrap items-center gap-3">
          {series?.lines.map((l) => {
            const lastPct = l.pct[l.pct.length - 1];
            return (
              <span key={l.symbol} className="inline-flex items-center gap-1.5 text-[13px] font-bold">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ background: colorOf(l.symbol) }}
                />
                <span className="font-mono">{l.symbol}</span>
                <span
                  className="tabular"
                  style={{ color: lastPct >= 0 ? "var(--good)" : "var(--bad)" }}
                >
                  {lastPct >= 0 ? "+" : ""}
                  {lastPct.toFixed(2)}%
                </span>
              </span>
            );
          })}
        </div>
        <div className="flex items-center gap-1">
          {CHART_RANGES.map((r) => {
            const on = r.key === range;
            return (
              <button
                key={r.key}
                onClick={() => {
                  setRange(r.key);
                  setHover(null);
                }}
                className="px-2.5 py-1 rounded-md text-[12px] font-bold transition"
                style={{
                  background: on ? "var(--accent)" : "transparent",
                  color: on ? "var(--on-accent)" : "var(--text-mute)",
                }}
              >
                {r.label}
              </button>
            );
          })}
        </div>
      </div>

      {isLoading && !series ? (
        <div className="shimmer rounded-lg" style={{ height: H }} />
      ) : !series ? (
        <div className="flex items-center justify-center text-mute text-sm" style={{ height: H }}>
          No price history available.
        </div>
      ) : (
        <div
          ref={wrapRef}
          className="relative"
          style={{ height: H }}
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
        >
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-full">
            {/* 0% baseline */}
            <line
              x1={0}
              y1={series.zeroY}
              x2={W}
              y2={series.zeroY}
              stroke="var(--border-strong)"
              strokeWidth="1"
              strokeDasharray="4 4"
              vectorEffect="non-scaling-stroke"
            />
            {series.lines.map((l) => (
              <path
                key={l.symbol}
                d={l.d}
                fill="none"
                stroke={colorOf(l.symbol)}
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {hover != null && (
              <line
                x1={hover * W}
                y1={0}
                x2={hover * W}
                y2={H}
                stroke="var(--text-mute)"
                strokeWidth="1"
                strokeDasharray="4 3"
                vectorEffect="non-scaling-stroke"
              />
            )}
          </svg>

          {/* Hover readout: each ticker's % at the crosshair */}
          {hover != null && (
            <div
              className="absolute pointer-events-none rounded-md px-2.5 py-1.5 text-[12px] shadow-lg"
              style={{
                left: `${hover * 100}%`,
                top: 4,
                transform: hover > 0.5 ? "translateX(calc(-100% - 10px))" : "translateX(10px)",
                background: "var(--bg-1)",
                border: "1px solid var(--border-strong)",
                whiteSpace: "nowrap",
              }}
            >
              {series.lines.map((l) => {
                const i = Math.round(hover * (l.pct.length - 1));
                const p = l.pct[i];
                return (
                  <div key={l.symbol} className="flex items-center gap-1.5">
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ background: colorOf(l.symbol) }}
                    />
                    <span className="font-mono font-bold">{l.symbol}</span>
                    <span className="tabular" style={{ color: p >= 0 ? "var(--good)" : "var(--bad)" }}>
                      {p >= 0 ? "+" : ""}
                      {p.toFixed(2)}%
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="text-[11px] text-mute mt-2">
        % change from the start of the selected period — each line is indexed
        to 0% so different price levels compare directly.
      </div>
    </div>
  );
}

// ── Key-numbers comparison table ─────────────────────────────────────────────

const RATING_LABEL: Record<string, string> = {
  strong_buy: "Strong Buy",
  buy: "Buy",
  hold: "Hold",
  underperform: "Underperform",
  sell: "Sell",
};

function CompareTable({ symbols }: { symbols: string[] }) {
  const { data } = useSWR<(CompareStats | null)[]>(
    `compare-stats:${symbols.join(",")}`,
    async () =>
      Promise.all(
        symbols.map(async (s) => {
          try {
            const r = await fetch(
              `${API_BASE}/market-stats/stats?symbol=${encodeURIComponent(s)}`,
            );
            const d = await r.json();
            return (d?.stats as CompareStats) || null;
          } catch {
            return null;
          }
        }),
      ),
    { revalidateOnFocus: false, dedupingInterval: 60_000 },
  );

  const bySym = new Map<string, CompareStats>();
  (data || []).forEach((s) => {
    if (s) bySym.set(s.symbol.toUpperCase(), s);
  });

  const num = (v: number | null | undefined, digits = 2, suffix = "") =>
    v == null || Number.isNaN(v) ? "—" : `${v.toFixed(digits)}${suffix}`;
  const pct = (v: number | null | undefined) =>
    v == null || Number.isNaN(v) ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;

  const metrics: { label: string; render: (s: CompareStats | undefined) => React.ReactNode }[] = [
    { label: "Price", render: (s) => (s?.price != null ? `$${s.price.toFixed(2)}` : "—") },
    {
      label: "Change (1D)",
      render: (s) => (
        <span style={{ color: (s?.changePct ?? 0) >= 0 ? "var(--good)" : "var(--bad)" }}>
          {pct(s?.changePct)}
        </span>
      ),
    },
    { label: "Market Cap", render: (s) => (s?.marketCap != null ? formatCurrency(s.marketCap) : "—") },
    { label: "P/E Ratio", render: (s) => num(s?.peRatio) },
    { label: "EPS", render: (s) => (s?.eps != null ? `$${s.eps.toFixed(2)}` : "—") },
    {
      label: "Dividend Yield",
      render: (s) => (s?.dividendYield != null ? `${(s.dividendYield * 100).toFixed(2)}%` : "—"),
    },
    { label: "Volume", render: (s) => (s?.volume != null ? s.volume.toLocaleString("en-US") : "—") },
    {
      label: "52-Week Range",
      render: (s) =>
        s?.week52Low != null && s?.week52High != null
          ? `$${s.week52Low.toFixed(2)} – $${s.week52High.toFixed(2)}`
          : "—",
    },
    { label: "Beta", render: (s) => num(s?.beta) },
    {
      label: "Analyst Rating",
      render: (s) =>
        s?.analystRating ? RATING_LABEL[s.analystRating] || s.analystRating : "—",
    },
    {
      label: "Price Target",
      render: (s) =>
        s?.priceTarget != null ? (
          <>
            ${s.priceTarget.toFixed(2)}
            {s.priceTargetUpsidePct != null && (
              <span
                className="ml-1"
                style={{ color: s.priceTargetUpsidePct >= 0 ? "var(--good)" : "var(--bad)" }}
              >
                ({pct(s.priceTargetUpsidePct)})
              </span>
            )}
          </>
        ) : (
          "—"
        ),
    },
    {
      label: "Next Earnings",
      render: (s) =>
        s?.earningsDate
          ? new Date(s.earningsDate).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              year: "numeric",
            })
          : "—",
    },
  ];

  return (
    <div className="card p-0 overflow-x-auto">
      <table className="w-full text-[13.5px]">
        <thead>
          <tr style={{ borderBottom: "1px solid var(--border)" }}>
            <th className="text-left px-4 py-3 text-[12px] uppercase tracking-wider text-mute font-bold">
              Metric
            </th>
            {symbols.map((s, i) => {
              const st = bySym.get(s);
              return (
                <th key={s} className="text-right px-4 py-3">
                  <Link
                    href={`/companies/${encodeURIComponent(s)}`}
                    className="inline-flex items-center gap-2 justify-end"
                  >
                    <CompanyLogo ticker={s} name={st?.name || s} size={20} />
                    <span
                      className="font-mono font-bold text-[14px]"
                      style={{ color: LINE_COLORS[i % LINE_COLORS.length] }}
                    >
                      {s}
                    </span>
                  </Link>
                  {st?.name && (
                    <div className="text-[11.5px] font-medium text-mute truncate max-w-[180px]">
                      {st.name}
                    </div>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {metrics.map((m, ri) => (
            <tr
              key={m.label}
              style={{
                borderBottom: ri === metrics.length - 1 ? "none" : "1px solid var(--border)",
              }}
            >
              <td className="px-4 py-2.5 font-semibold text-soft">{m.label}</td>
              {symbols.map((s) => (
                <td key={s} className="px-4 py-2.5 text-right tabular font-medium">
                  {m.render(bySym.get(s))}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
