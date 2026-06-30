"use client";
import useSWR from "swr";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowDown, ArrowUp, Flame } from "lucide-react";
import { API_BASE, fetcher, formatCurrency, formatNumber } from "@/lib/api";
import { CompanyLogo } from "@/components/CompanyLogo";
import { AdSlot } from "@/components/AdSlot";
import { RightRailArticles } from "@/components/article/RightRailArticles";
import { RightRailStockLists } from "@/components/article/RightRailStockLists";

interface MoverRow {
  symbol: string;
  name: string;
  price: number;
  changePct: number;
  changeAbs: number;
  volume: number;
  avgVolume: number;
  marketCap: number | null;
  sector: string | null;
}

function why(r: MoverRow): string {
  const dir = r.changePct >= 0 ? "rallying" : "selling off";
  const reasonHints: string[] = [];
  if (Math.abs(r.changePct) > 10)
    reasonHints.push(`an outsized ${r.changePct.toFixed(1)}% intraday move`);
  if (r.volume > r.avgVolume * 1.5)
    reasonHints.push(
      `unusually heavy volume (${formatNumber(r.volume)} vs ${formatNumber(r.avgVolume)} avg)`,
    );
  if (r.sector === "Technology")
    reasonHints.push("part of a broader tech-sector reaction");
  if (r.sector === "Energy")
    reasonHints.push("tied to the energy complex's session-level move");
  if (r.sector === "Healthcare")
    reasonHints.push("likely driven by a healthcare-specific catalyst (FDA / data readout)");
  if (!reasonHints.length) reasonHints.push("the largest intraday move in our universe today");
  return `${r.symbol} is ${dir} on ${reasonHints.join(", ")}. Watch for follow-through into the close and any insider Form 4 filings tonight.`;
}

export default function MarketMoversPage() {
  const { data, isLoading } = useSWR<{ rows: MoverRow[] }>(
    `${API_BASE}/market-stats/top-gainers?limit=10`,
    fetcher,
    { refreshInterval: 60_000, revalidateOnFocus: false },
  );
  const { data: losers } = useSWR<{ rows: MoverRow[] }>(
    `${API_BASE}/market-stats/top-losers?limit=5`,
    fetcher,
    { refreshInterval: 60_000, revalidateOnFocus: false },
  );

  const gainers = (data?.rows || []).filter((r) => r.changePct >= 5).slice(0, 8);
  const big = [...gainers, ...(losers?.rows || []).filter((r) => r.changePct <= -5).slice(0, 4)];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-6 lg:gap-10 w-full">
      <article className="min-w-0 max-w-3xl">
        <div className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-bold text-accent mb-3">
          <Flame className="h-3 w-3" />
          Market Movers · {new Date().toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}
        </div>
        <h1
          className="text-[32px] sm:text-[44px] font-semibold tracking-tight leading-[1.05]"
          style={{ letterSpacing: "-0.7px" }}
        >
          Market Movers — Stocks Up 10% Or More And Why
        </h1>
        <p className="text-soft text-[15px] sm:text-[17px] mt-4 leading-relaxed">
          A live read on the biggest intraday percentage moves across the U.S. market, with
          a short note on the likely catalyst. Watch the names that pair with same-day
          insider Form 4 filings — that&rsquo;s where the IQS signal lives.
        </p>

        <AdSlot slot="leaderboard" seed="market-movers" />

        {isLoading ? (
          <div className="space-y-3 mt-6">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-32 shimmer rounded-lg" />
            ))}
          </div>
        ) : (
          <div className="space-y-4 mt-6">
            {big.flatMap((r, i) => {
              const up = r.changePct >= 0;
              const card = (
                <motion.div
                  key={r.symbol}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: Math.min(i, 12) * 0.03 }}
                >
                  <Link
                    href={`/companies/${encodeURIComponent(r.symbol)}`}
                    className="group block rounded-lg p-5 transition hover:border-[var(--accent)]"
                    style={{
                      background: "var(--bg-2)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    <div className="flex items-start gap-4">
                      <CompanyLogo ticker={r.symbol} name={r.name} size={40} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="font-mono text-[14px] font-bold text-accent group-hover:underline">
                            {r.symbol}
                          </span>
                          <span
                            className="inline-flex items-center gap-0.5 text-[12px] font-bold tabular"
                            style={{ color: up ? "var(--good)" : "var(--bad)" }}
                          >
                            {up ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                            {up ? "+" : ""}
                            {r.changePct.toFixed(2)}%
                          </span>
                          <span className="text-[11px] text-mute tabular">
                            ${r.price.toFixed(2)}
                          </span>
                        </div>
                        <h2 className="text-[16px] sm:text-[18px] font-bold leading-snug mb-1">
                          {r.name} {up ? "surges" : "slides"} {Math.abs(r.changePct).toFixed(1)}% on outsized volume
                        </h2>
                        <p className="text-[13px] text-soft leading-relaxed">{why(r)}</p>
                        <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-mute">
                          <span>Volume {formatNumber(r.volume)}</span>
                          <span>Avg {formatNumber(r.avgVolume)}</span>
                          {r.marketCap && <span>Mkt cap {formatCurrency(r.marketCap)}</span>}
                          {r.sector && <span>· {r.sector}</span>}
                        </div>
                      </div>
                    </div>
                  </Link>
                </motion.div>
              );
              if (i === 3) {
                return [
                  card,
                  <AdSlot key="adslot-mid" slot="inline" seed="market-movers-mid" />,
                ];
              }
              return [card];
            })}
          </div>
        )}
      </article>

      <aside className="space-y-5">
        <AdSlot slot="rail-top" seed="market-movers-rail" />
        <RightRailArticles tag="markets" />
        <RightRailStockLists />
      </aside>
    </div>
  );
}
