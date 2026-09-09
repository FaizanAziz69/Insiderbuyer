"use client";
import useSWR from "swr";
import Link from "next/link";
import { motion } from "framer-motion";
import { ChevronRight } from "lucide-react";
import { API_BASE, StockListIndexResponse, fetcher } from "@/lib/api";

interface TradeRow {
  id: string;
  ticker: string | null;
  transactionDate: string;
  filedAt?: string | null;
}

function timeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/** Log-scale fill ratio so huge lists (Penny Stocks) don't flatten the rest. */
function fillRatio(count: number, max: number): number {
  if (max <= 0 || count <= 0) return 0;
  return Math.max(0.08, Math.log(count + 1) / Math.log(max + 1));
}

/** Initials for the Famous Investors tiles, from the list title. */
function initialsOf(title: string): string {
  return title
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/**
 * /stock-lists — "Signal Grid" bento layout. Every color comes from the
 * site's theme tokens so the page resolves correctly in light AND dark
 * mode. Data fetching, routes, and links unchanged — visual only.
 */
export default function StockListsHubPage() {
  const { data, isLoading } = useSWR<StockListIndexResponse>(
    `${API_BASE}/stock-lists`,
    fetcher,
    { refreshInterval: 5 * 60_000, revalidateOnFocus: false },
  );
  const lists = data?.lists || [];
  const sectors = lists.filter(
    (l) => l.kind === "sector" || l.kind === "universe" || l.kind === "country",
  );
  const personas = lists.filter((l) => l.kind === "persona");
  const premiumLists = lists.filter((l) => l.kind === "premium");

  const { data: tradeData } = useSWR<{ rows: TradeRow[] }>(
    `${API_BASE}/trades?side=buy&limit=1`,
    fetcher,
    { refreshInterval: 3 * 60_000, revalidateOnFocus: false },
  );
  const lastBuy = tradeData?.rows?.[0] ?? null;

  const maxCount = Math.max(1, ...lists.map((l) => l.count));
  const maxPremium = Math.max(1, ...premiumLists.map((l) => l.count));
  const totalTickers = lists.reduce((a, l) => a + (l.count || 0), 0);

  return (
    <div className="w-full space-y-8">
      {/* Accent rule where the page content starts */}
      <div className="sg-rule" aria-hidden />

      {/* ── Hero row ─────────────────────────────────────────────────── */}
      <header className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-5">
        <div>
          <div
            className="font-mono uppercase mb-2"
            style={{ color: "var(--accent)", fontSize: 11.5, fontWeight: 700, letterSpacing: "0.16em" }}
          >
            Stock Lists
          </div>
          <h1
            className="font-bold tracking-tight"
            style={{ fontSize: "clamp(38px, 4.6vw, 52px)", letterSpacing: "-1.2px", lineHeight: 1.04 }}
          >
            All Stock Lists
          </h1>
          <p className="mt-3 leading-relaxed" style={{ color: "var(--text-soft)", fontSize: 15.5, maxWidth: 560 }}>
            Curated lists organised by sector and by famous investor portfolios. Click
            into any list to filter and sort by sector, market cap, and our premium
            Insider Score.
          </p>
        </div>
        {/* Stat pills */}
        <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
          {[
            `${lists.length || "—"} LISTS`,
            `${totalTickers.toLocaleString()} TICKERS`,
          ].map((label) => (
            <span
              key={label}
              className="font-mono font-bold px-3 py-1.5 rounded-full"
              style={{
                fontSize: 11,
                letterSpacing: "0.08em",
                background: "var(--bg-2)",
                border: "1px solid var(--border)",
                color: "var(--text-soft)",
              }}
            >
              {label}
            </span>
          ))}
          <span
            className="font-mono font-bold px-3 py-1.5 rounded-full inline-flex items-center gap-2"
            style={{
              fontSize: 11,
              letterSpacing: "0.08em",
              background: "var(--bg-2)",
              border: "1px solid var(--border)",
              color: "var(--text-soft)",
            }}
          >
            <span className="sg-live-dot" aria-hidden /> UPDATED DAILY
          </span>
        </div>
      </header>

      {/* ── Premium featured cards ───────────────────────────────────── */}
      {premiumLists.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {premiumLists.map((premium, i) => {
            const pct = Math.round((premium.count / maxPremium) * 100);
            return (
              <motion.div
                key={premium.slug}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: i * 0.07 }}
              >
                <Link
                  href={`/stock-lists/${premium.slug}`}
                  className="group flex items-center justify-between gap-5 p-6 transition hover:brightness-110"
                  style={{
                    borderRadius: 16,
                    background: "linear-gradient(135deg, var(--brand-surface), var(--accent-2))",
                    border: "1px solid var(--brand-surface-border)",
                    color: "#ffffff",
                  }}
                >
                  <div className="min-w-0">
                    <span
                      className="inline-block font-mono uppercase mb-2.5"
                      style={{
                        fontSize: 10,
                        letterSpacing: "0.16em",
                        fontWeight: 700,
                        border: "1px solid rgba(255,255,255,0.35)",
                        borderRadius: 4,
                        padding: "3px 8px",
                        color: "#fff",
                      }}
                    >
                      ✦ Premium
                    </span>
                    <div className="font-bold" style={{ fontSize: 19, letterSpacing: "-0.3px" }}>
                      {premium.title}
                    </div>
                  </div>
                  {/* Conic count ring — arc proportional to ticker count */}
                  <div
                    className="relative flex-shrink-0 rounded-full flex items-center justify-center"
                    style={{
                      width: 104,
                      height: 104,
                      background: `conic-gradient(#ffffff ${pct}%, rgba(255,255,255,0.22) 0)`,
                    }}
                    aria-label={`${premium.count} tickers`}
                  >
                    <div
                      className="absolute rounded-full flex flex-col items-center justify-center"
                      style={{ inset: 6, background: "color-mix(in srgb, var(--brand-surface) 88%, #000)" }}
                    >
                      <span className="font-mono font-bold" style={{ fontSize: 26, lineHeight: 1, color: "#fff" }}>
                        {premium.count}
                      </span>
                      <span
                        className="font-mono uppercase mt-1"
                        style={{ fontSize: 8.5, letterSpacing: "0.14em", color: "rgba(255,255,255,0.7)" }}
                      >
                        Tickers
                      </span>
                    </div>
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* ── Stocks by Interest — 3-col bento grid ────────────────────── */}
      <section>
        <div className="flex items-center gap-3 mb-4">
          <h2
            className="font-mono uppercase whitespace-nowrap"
            style={{ fontSize: 11, letterSpacing: "0.18em", fontWeight: 700, color: "var(--accent)" }}
          >
            Stocks by Interest
          </h2>
          <div className="sg-hairline" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3.5">
          {isLoading
            ? Array.from({ length: 9 }).map((_, i) => (
                <div key={i} className="sg-card p-4"><div className="h-14 shimmer rounded" /></div>
              ))
            : sectors.map((l, i) => (
                <motion.div
                  key={l.slug}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: i * 0.02 }}
                >
                  <Link href={`/stock-lists/${l.slug}`} className="sg-card group flex flex-col p-4 h-full">
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-bold" style={{ fontSize: 14.5, color: "var(--accent)", letterSpacing: "-0.1px" }}>
                        {l.title}
                      </span>
                      <span
                        className="font-mono font-bold px-2 py-0.5 rounded flex-shrink-0"
                        style={{ fontSize: 11, background: "var(--accent-soft)", color: "var(--accent)" }}
                      >
                        {l.count}
                      </span>
                    </div>
                    <span className="flex-1" />
                    <div className="mt-3 rounded-full overflow-hidden" style={{ height: 3, background: "var(--bg-3)" }}>
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.round(fillRatio(l.count, maxCount) * 100)}%`,
                          background: "linear-gradient(90deg, var(--accent), var(--accent-2))",
                        }}
                      />
                    </div>
                  </Link>
                </motion.div>
              ))}
        </div>
      </section>

      {/* ── Famous Investors — 3-col cards with initials tiles ───────── */}
      <section>
        <div className="flex items-center gap-3 mb-4">
          <h2
            className="font-mono uppercase whitespace-nowrap"
            style={{ fontSize: 11, letterSpacing: "0.18em", fontWeight: 700, color: "var(--accent)" }}
          >
            Famous Investors
          </h2>
          <div className="sg-hairline" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3.5">
          {isLoading
            ? Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="sg-card p-4"><div className="h-12 shimmer rounded" /></div>
              ))
            : personas.map((l, i) => (
                <motion.div
                  key={l.slug}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: i * 0.02 }}
                >
                  <Link href={`/stock-lists/${l.slug}`} className="sg-card group flex items-center gap-3.5 p-4 h-full">
                    <span
                      className="flex items-center justify-center flex-shrink-0 font-bold rounded-xl"
                      style={{
                        width: 44,
                        height: 44,
                        fontSize: 15,
                        color: "#ffffff",
                        background: "linear-gradient(135deg, var(--accent), var(--accent-2))",
                      }}
                    >
                      {initialsOf(l.title)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-bold truncate" style={{ fontSize: 14.5, color: "var(--accent)" }}>
                          {l.title}
                        </span>
                        <span className="font-mono font-bold flex-shrink-0" style={{ fontSize: 12, color: "var(--text-soft)" }}>
                          {l.count}
                        </span>
                      </span>
                    </span>
                    <ChevronRight className="h-4 w-4 flex-shrink-0 text-faint group-hover:text-accent transition" />
                  </Link>
                </motion.div>
              ))}
        </div>
      </section>

      {/* ── In-page live strip ───────────────────────────────────────── */}
      <div
        className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 rounded-xl"
        style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-surface-border)" }}
      >
        <span className="flex items-center gap-2 font-mono" style={{ fontSize: 12, letterSpacing: "0.06em", color: "#fff" }}>
          <span className="sg-live-dot" aria-hidden />
          <span style={{ fontWeight: 700 }}>LIVE</span>
          {lastBuy?.ticker ? (
            <>
              <span style={{ fontWeight: 700 }}>{lastBuy.ticker}</span>
              <span style={{ color: "#4ade80", fontWeight: 700 }}>BOUGHT</span>
              <span style={{ color: "rgba(255,255,255,0.6)" }}>
                {timeAgo(lastBuy.filedAt || lastBuy.transactionDate)}
              </span>
            </>
          ) : (
            <span style={{ color: "rgba(255,255,255,0.6)" }}>awaiting next filing…</span>
          )}
        </span>
        <span className="font-mono" style={{ fontSize: 11, letterSpacing: "0.1em", color: "rgba(255,255,255,0.65)" }}>
          {lists.length} LISTS · {totalTickers.toLocaleString()} TICKERS
        </span>
      </div>

    </div>
  );
}
