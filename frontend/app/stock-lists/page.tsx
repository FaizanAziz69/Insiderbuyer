"use client";
import useSWR from "swr";
import Link from "next/link";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ChevronRight } from "lucide-react";
import { API_BASE, StockListIndexResponse, fetcher } from "@/lib/api";

/** Latest live insider buy for the footer ticker strip. */
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
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}M AGO`;
  if (s < 86400) return `${Math.floor(s / 3600)}H AGO`;
  return `${Math.floor(s / 86400)}D AGO`;
}

/** Log-scale density meter width (0–1) so Penny Stocks doesn't flatten the rest. */
function densityRatio(count: number, max: number): number {
  if (max <= 0 || count <= 0) return 0;
  return Math.max(0.08, Math.log(count + 1) / Math.log(max + 1));
}

/**
 * /stock-lists — "Command Deck" terminal redesign. Always-dark canvas built
 * from the site's own teal/blue/cyan tokens (see .deck in globals.css).
 * Data fetching, routes, and list logic are unchanged — visual only.
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

  // Live EST clock for the status readout (client-only to avoid hydration drift).
  const [clock, setClock] = useState<string>("");
  useEffect(() => {
    const tick = () =>
      setClock(
        new Date().toLocaleTimeString("en-US", {
          timeZone: "America/New_York",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        }),
      );
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  // Footer strip: most recent live insider buy.
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
    <div className="deck w-full rounded-2xl overflow-hidden" style={{ border: "1px solid var(--deck-cyan-faint)" }}>
      {/* ── Glass status bar ─────────────────────────────────────────── */}
      <div
        className="deck-glass flex flex-wrap items-center justify-between gap-2 px-5 sm:px-8 py-3"
        style={{ borderBottom: "1px solid var(--deck-cyan-soft)" }}
      >
        <span
          className="font-mono uppercase"
          style={{ color: "var(--deck-cyan)", fontSize: 12, letterSpacing: "0.14em", fontWeight: 700 }}
        >
          {"//"} STOCK LISTS — {lists.length || "…"} CURATED SETS
        </span>
        <span className="flex items-center gap-2 font-mono" style={{ fontSize: 11.5, color: "var(--deck-body)", letterSpacing: "0.08em" }}>
          <span className="deck-live-dot" aria-hidden />
          LIVE · {clock || "—"} EST
        </span>
      </div>

      <div className="px-5 sm:px-8 py-8 sm:py-10 space-y-10">
        {/* ── Hero ────────────────────────────────────────────────────── */}
        <header>
          <h1
            className="font-bold"
            style={{ fontSize: "clamp(40px, 5vw, 58px)", letterSpacing: "-1.5px", lineHeight: 1.02 }}
          >
            All Stock Lists
          </h1>
          <div className="deck-rule mt-4 mb-4" />
          <p style={{ color: "var(--deck-body)", fontSize: 15.5, maxWidth: 640, lineHeight: 1.65 }}>
            Curated lists organised by sector and by famous investor portfolios. Click
            into any list to filter and sort by sector, market cap, and our premium
            Insider Score.
          </p>
        </header>

        {/* ── Premium featured panels ─────────────────────────────────── */}
        {premiumLists.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {premiumLists.map((premium, i) => (
              <motion.div
                key={premium.slug}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: i * 0.07 }}
              >
                <Link
                  href={`/stock-lists/${premium.slug}`}
                  className="deck-glass group relative flex flex-col overflow-hidden transition hover:brightness-110"
                  style={{
                    borderRadius: 14,
                    border: "1px solid var(--deck-cyan-soft)",
                    background:
                      "linear-gradient(135deg, rgba(0,88,130,0.28), rgba(255,255,255,0.03) 60%)",
                  }}
                >
                  <div className="flex items-center justify-between gap-5 p-5 sm:p-6 flex-1">
                    <div className="min-w-0">
                      <span
                        className="inline-block font-mono uppercase mb-2.5"
                        style={{
                          fontSize: 10,
                          letterSpacing: "0.16em",
                          fontWeight: 700,
                          color: "var(--deck-cyan)",
                          border: "1px solid var(--deck-cyan-soft)",
                          borderRadius: 4,
                          padding: "3px 8px",
                        }}
                      >
                        ✦ Premium
                      </span>
                      <div className="font-bold" style={{ fontSize: 19, letterSpacing: "-0.3px" }}>
                        {premium.title}
                      </div>
                      <p className="mt-1.5" style={{ fontSize: 12.5, color: "var(--deck-body)", lineHeight: 1.55 }}>
                        {premium.description}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div
                        className="font-mono font-bold deck-count-glow"
                        style={{ fontSize: 44, color: "var(--deck-cyan)", lineHeight: 1 }}
                      >
                        {premium.count}
                      </div>
                      <div
                        className="font-mono uppercase mt-1.5 inline-flex items-center gap-1"
                        style={{ fontSize: 10, letterSpacing: "0.14em", color: "var(--deck-dim)" }}
                      >
                        Tickers <ChevronRight className="h-3 w-3 deck-chev" />
                      </div>
                    </div>
                  </div>
                  {/* progress meter */}
                  <div style={{ height: 3, background: "rgba(255,255,255,0.06)" }}>
                    <div
                      style={{
                        height: "100%",
                        width: `${Math.round((premium.count / maxPremium) * 100)}%`,
                        background: "linear-gradient(90deg, var(--deck-blue), var(--deck-cyan))",
                      }}
                    />
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        )}

        {/* ── Two-column list sections ────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {[
            { label: "Stocks by Interest", rows: sectors },
            { label: "Famous Investors", rows: personas },
          ].map((section) => (
            <section key={section.label}>
              <div className="flex items-center gap-3 mb-1">
                <h2
                  className="font-mono uppercase whitespace-nowrap"
                  style={{ fontSize: 11, letterSpacing: "0.18em", fontWeight: 700, color: "var(--deck-cyan)" }}
                >
                  {section.label}
                </h2>
                <div className="deck-rule flex-1" />
              </div>
              <ol style={{ listStyle: "none", padding: 0 }}>
                {isLoading
                  ? Array.from({ length: 6 }).map((_, i) => (
                      <li key={i} className="deck-row px-2 py-4">
                        <div className="h-5 rounded" style={{ background: "rgba(255,255,255,0.05)" }} />
                      </li>
                    ))
                  : section.rows.map((l, i) => (
                      <motion.li
                        key={l.slug}
                        initial={{ opacity: 0, x: 4 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.2, delay: i * 0.02 }}
                      >
                        <Link
                          href={`/stock-lists/${l.slug}`}
                          className="deck-row flex items-center gap-3 sm:gap-4 px-2 py-3"
                        >
                          <span
                            className="font-mono flex-shrink-0"
                            style={{ fontSize: 11, color: "var(--deck-dim)", width: 22 }}
                          >
                            {String(i + 1).padStart(2, "0")}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span
                              className="block font-bold truncate"
                              style={{ fontSize: 14, color: "var(--deck-cyan)", letterSpacing: "-0.1px" }}
                            >
                              {l.title}
                            </span>
                            <span className="block truncate" style={{ fontSize: 12, color: "var(--deck-body)" }}>
                              {l.description}
                            </span>
                          </span>
                          {/* density meter — log scale */}
                          <span
                            className="hidden sm:block flex-shrink-0 rounded-full overflow-hidden"
                            style={{ width: 110, height: 4, background: "rgba(255,255,255,0.07)" }}
                            aria-hidden
                          >
                            <span
                              className="block h-full rounded-full"
                              style={{
                                width: `${Math.round(densityRatio(l.count, maxCount) * 100)}%`,
                                background: "linear-gradient(90deg, var(--deck-blue), var(--deck-cyan))",
                              }}
                            />
                          </span>
                          <span
                            className="font-mono flex-shrink-0 text-right"
                            style={{ fontSize: 12.5, fontWeight: 700, color: "var(--deck-text)", width: 40 }}
                          >
                            {l.count}
                          </span>
                          <ChevronRight
                            className="h-4 w-4 flex-shrink-0 deck-chev transition"
                            style={{ color: "var(--deck-dim)" }}
                          />
                        </Link>
                      </motion.li>
                    ))}
              </ol>
            </section>
          ))}
        </div>
      </div>

      {/* ── Footer live strip ──────────────────────────────────────────── */}
      <div
        className="deck-glass flex flex-wrap items-center justify-between gap-2 px-5 sm:px-8 py-3"
        style={{ borderTop: "1px solid var(--deck-cyan-soft)" }}
      >
        <span className="flex items-center gap-2 font-mono" style={{ fontSize: 11.5, letterSpacing: "0.08em" }}>
          <span className="deck-live-dot" aria-hidden />
          <span style={{ color: "var(--deck-cyan)", fontWeight: 700 }}>LIVE</span>
          {lastBuy?.ticker ? (
            <>
              <span style={{ color: "var(--deck-text)", fontWeight: 700 }}>{lastBuy.ticker}</span>
              <span style={{ color: "var(--good, #22c55e)", fontWeight: 700 }}>BOUGHT</span>
              <span style={{ color: "var(--deck-dim)" }}>
                {timeAgo(lastBuy.filedAt || lastBuy.transactionDate)}
              </span>
            </>
          ) : (
            <span style={{ color: "var(--deck-dim)" }}>AWAITING NEXT FILING…</span>
          )}
        </span>
        <span className="font-mono" style={{ fontSize: 11, letterSpacing: "0.1em", color: "var(--deck-dim)" }}>
          {lists.length} LISTS · {totalTickers.toLocaleString()} TICKERS
        </span>
      </div>
    </div>
  );
}
