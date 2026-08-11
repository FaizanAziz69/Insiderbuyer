"use client";
import useSWR from "swr";
import Link from "next/link";
import { useMemo } from "react";
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

/** Fallback catalyst text when the AI explainer hasn't landed yet. */
function fallbackCatalyst(r: MoverRow): string {
  const dir = r.changePct >= 0 ? "rallying" : "selling off";
  const hints: string[] = [];
  if (Math.abs(r.changePct) > 10) hints.push(`an outsized ${r.changePct.toFixed(1)}% intraday move`);
  if (r.volume > r.avgVolume * 1.5)
    hints.push(`unusually heavy volume (${formatNumber(r.volume)} vs ${formatNumber(r.avgVolume)} avg)`);
  if (!hints.length) hints.push("one of the largest intraday moves in our universe today");
  return `${r.symbol} is ${dir} on ${hints.join(", ")}.`;
}

function SectionHead({ children }: { children: React.ReactNode }) {
  return <h3 className="text-[14px] font-bold mt-4 mb-1">{children}</h3>;
}

/** One mover as a mini-article: intro → what do they do → catalyst →
 *  financial snapshot → closing (client-spec structure). */
function MoverArticle({ r, catalyst }: { r: MoverRow; catalyst: string | null }) {
  const up = r.changePct >= 0;
  const { data: profileData } = useSWR<{ profile: { description?: string | null; industry?: string | null } | null }>(
    `${API_BASE}/market-stats/profile?symbol=${encodeURIComponent(r.symbol)}`,
    fetcher,
    { revalidateOnFocus: false },
  );
  const about = useMemo(() => {
    const desc = profileData?.profile?.description || "";
    if (desc) {
      // First two sentences are enough for a mover blurb.
      const sentences = desc.split(/(?<=\.)\s+/).slice(0, 2).join(" ");
      return sentences;
    }
    if (r.sector) {
      return `${r.name} operates in the ${r.sector}${profileData?.profile?.industry ? ` sector (${profileData.profile.industry})` : " sector"}.`;
    }
    // Never drop the section — the 5-part structure is the whole point.
    return `${r.name} trades under the ticker ${r.symbol}${r.marketCap ? ` with a market value of ${formatCurrency(r.marketCap)}` : ""} — full profile on its company page below.`;
  }, [profileData, r.name, r.sector, r.symbol, r.marketCap]);

  const volX = r.avgVolume > 0 ? r.volume / r.avgVolume : null;

  return (
    <div
      className="rounded-lg p-5"
      style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}
    >
      <div className="flex items-start gap-4">
        <CompanyLogo ticker={r.symbol} name={r.name} size={40} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <Link
              href={`/companies/${encodeURIComponent(r.symbol)}`}
              className="font-mono text-[14px] font-bold text-accent hover:underline"
            >
              {r.symbol}
            </Link>
            <span
              className="inline-flex items-center gap-0.5 text-[12px] font-bold tabular"
              style={{ color: up ? "var(--good)" : "var(--bad)" }}
            >
              {up ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
              {up ? "+" : ""}
              {r.changePct.toFixed(2)}%
            </span>
            <span className="text-[11px] text-mute tabular">${r.price.toFixed(2)}</span>
          </div>

          {/* Headline — the client-spec framing */}
          <h2 className="text-[17px] sm:text-[19px] font-semibold leading-snug">
            Why did {r.name} {up ? "surge" : "drop"} {Math.abs(r.changePct).toFixed(1)}% today?
          </h2>

          {/* Intro */}
          <p className="text-[13px] text-soft leading-relaxed mt-1.5">
            {r.name} ({r.symbol}) is one of today&rsquo;s biggest {up ? "gainers" : "decliners"},{" "}
            {up ? "up" : "down"} {Math.abs(r.changePct).toFixed(1)}% to ${r.price.toFixed(2)}
            {volX && volX > 1.2 ? ` on roughly ${volX.toFixed(1)}× its average daily volume` : ""}.
          </p>

          {/* What does it even do? — always present (client-spec section) */}
          <SectionHead>What does {r.symbol} even do?</SectionHead>
          <p className="text-[13px] text-soft leading-relaxed">{about}</p>

          {/* Catalyst */}
          <SectionHead>The catalyst</SectionHead>
          <p className="text-[13px] text-soft leading-relaxed">{catalyst || fallbackCatalyst(r)}</p>

          {/* Financial snapshot */}
          <SectionHead>Financial snapshot</SectionHead>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-mute tabular">
            <span>Price ${r.price.toFixed(2)}</span>
            <span style={{ color: up ? "var(--good)" : "var(--bad)" }}>
              Change {up ? "+" : ""}
              {r.changePct.toFixed(2)}%
            </span>
            <span>Volume {formatNumber(r.volume)} (avg {formatNumber(r.avgVolume)})</span>
            {r.marketCap ? <span>Mkt cap {formatCurrency(r.marketCap)}</span> : null}
            {r.sector ? <span>{r.sector}</span> : null}
          </div>

          {/* Closing */}
          <p className="text-[12.5px] text-mute leading-relaxed mt-3">
            Watch for follow-through into the close — and for any insider Form 4 filings tonight.{" "}
            <Link href={`/companies/${encodeURIComponent(r.symbol)}`} className="text-accent font-semibold hover:underline">
              See {r.symbol}&rsquo;s insider activity and Insider Score →
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
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

  // One batched AI-catalyst call for every mover on the page.
  const explainKey = big.length
    ? big.map((r) => `${r.symbol}:${r.changePct.toFixed(2)}`).join(",")
    : null;
  const { data: explainData } = useSWR<{ explainers: Record<string, { title: string; explainer: string }> }>(
    explainKey ? [`${API_BASE}/content/explain-batch`, explainKey] : null,
    async () => {
      const res = await fetch(`${API_BASE}/content/explain-batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: big.map((r) => ({ symbol: r.symbol, name: r.name, changePct: r.changePct })),
        }),
      });
      return res.json();
    },
    { revalidateOnFocus: false },
  );

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
          Why Did These Stocks Surge (Or Sink) Today?
        </h1>
        <p className="text-soft text-[15px] sm:text-[17px] mt-4 leading-relaxed">
          Each of today&rsquo;s biggest movers, broken down the same way: what the company
          does, the catalyst behind the move, and the numbers that matter. Watch the names
          that pair with same-day insider Form 4 filings — that&rsquo;s where the Insider
          Score signal lives.
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
              const card = (
                <motion.div
                  key={r.symbol}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: Math.min(i, 12) * 0.03 }}
                >
                  <MoverArticle
                    r={r}
                    catalyst={explainData?.explainers?.[r.symbol]?.explainer ?? null}
                  />
                </motion.div>
              );
              if (i === 3) {
                return [card, <AdSlot key="adslot-mid" slot="inline" seed="market-movers-mid" />];
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
