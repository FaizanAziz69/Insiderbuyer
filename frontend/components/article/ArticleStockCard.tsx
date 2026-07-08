"use client";
import useSWR from "swr";
import Link from "next/link";
import { ArrowDown, ArrowUp } from "lucide-react";
import { API_BASE, fetcher, formatCurrency } from "@/lib/api";
import { CompanyLogo } from "@/components/CompanyLogo";
import { Sparkline } from "@/components/Sparkline";
import { IqsScoreCell } from "@/components/IqsScoreCell";

interface Quote {
  symbol: string;
  name: string;
  price: number;
  changePct: number;
  marketCap: number | null;
}
interface AnalystRow {
  symbol: string;
  recommendation: string | null;
  upsidePct: number | null;
  numAnalysts: number | null;
}

const REC_LABEL: Record<string, { label: string; color: string }> = {
  strong_buy: { label: "Strong Buy", color: "var(--good)" },
  buy: { label: "Buy", color: "var(--good)" },
  hold: { label: "Hold", color: "var(--gold)" },
  underperform: { label: "Underperform", color: "var(--bad)" },
  sell: { label: "Sell", color: "var(--bad)" },
};

/**
 * Live per-stock data card embedded inside programmatic articles — the
 * article body carries `<div data-stock-embed="TICKER">` placeholders and the
 * ArticleBody renderer swaps each for one of these: 7-day chart, live price,
 * Insider Score, and analyst consensus, all pulled from our own APIs.
 */
export function ArticleStockCard({ ticker }: { ticker: string }) {
  const sym = ticker.toUpperCase();

  const { data: quoteData } = useSWR<{ rows: Quote[] }>(
    `${API_BASE}/market-stats/quotes?symbols=${encodeURIComponent(sym)}`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60_000 },
  );
  const quote = quoteData?.rows?.find((r) => r.symbol.toUpperCase() === sym) ?? null;

  const { data: sparkData } = useSWR<{ spark: Record<string, number[]> }>(
    `${API_BASE}/market-stats/spark?symbols=${encodeURIComponent(sym)}`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 10 * 60_000 },
  );
  const spark = sparkData?.spark?.[sym];

  const { data: detail } = useSWR<{ score: { iqs: number } | null }>(
    `${API_BASE}/companies/${encodeURIComponent(sym)}`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 10 * 60_000 },
  );
  const iqs = detail?.score?.iqs ?? null;

  const { data: analystData } = useSWR<{ rows: AnalystRow[] }>(
    `${API_BASE}/market-stats/analyst-ratings?symbols=${encodeURIComponent(sym)}`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 10 * 60_000 },
  );
  const analyst = analystData?.rows?.find((r) => r.symbol.toUpperCase() === sym) ?? null;
  const rec = analyst?.recommendation ? REC_LABEL[analyst.recommendation] : null;

  const up = (quote?.changePct ?? 0) >= 0;

  return (
    <div
      className="not-prose my-5 rounded-lg overflow-hidden"
      style={{ background: "var(--bg-2)", border: "1px solid var(--border-strong)" }}
    >
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
        {/* Identity */}
        <Link
          href={`/companies/${encodeURIComponent(sym)}`}
          className="flex items-center gap-2.5 min-w-[150px] group"
        >
          <CompanyLogo ticker={sym} name={quote?.name || sym} size={30} />
          <span className="min-w-0">
            <span className="block font-mono text-[15px] font-bold text-accent group-hover:underline leading-tight">
              {sym}
            </span>
            <span className="block text-[11.5px] text-mute truncate max-w-[150px] leading-tight">
              {quote?.name || ""}
            </span>
          </span>
        </Link>

        {/* Price + change */}
        <div>
          <div className="text-[10px] uppercase tracking-wider font-bold text-mute">Price</div>
          <div className="text-[15px] font-bold tabular leading-tight">
            {quote ? `$${quote.price.toFixed(2)}` : "—"}
            {quote?.changePct != null && (
              <span
                className="ml-1.5 text-[12px] font-bold inline-flex items-center gap-0.5"
                style={{ color: up ? "var(--good)" : "var(--bad)" }}
              >
                {up ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                {up ? "+" : ""}
                {quote.changePct.toFixed(2)}%
              </span>
            )}
          </div>
        </div>

        {/* 7-day chart */}
        <div>
          <div className="text-[10px] uppercase tracking-wider font-bold text-mute">7-Day</div>
          <Sparkline data={spark} width={84} height={26} />
        </div>

        {/* Market cap */}
        <div>
          <div className="text-[10px] uppercase tracking-wider font-bold text-mute">Mkt Cap</div>
          <div className="text-[14px] font-bold tabular text-soft leading-tight">
            {quote?.marketCap ? formatCurrency(quote.marketCap) : "—"}
          </div>
        </div>

        {/* Insider Score */}
        <div className="text-center">
          <div className="text-[10px] uppercase tracking-wider font-bold text-mute mb-0.5">
            Insider Score
          </div>
          <IqsScoreCell iqs={iqs} />
        </div>

        {/* Analyst consensus */}
        <div>
          <div className="text-[10px] uppercase tracking-wider font-bold text-mute">Analysts</div>
          {rec ? (
            <div className="leading-tight">
              <span
                className="inline-flex items-center px-1.5 py-0.5 rounded text-[10.5px] font-bold uppercase tracking-wider"
                style={{
                  background: `color-mix(in srgb, ${rec.color} 16%, transparent)`,
                  color: rec.color,
                }}
              >
                {rec.label}
              </span>
              {analyst?.upsidePct != null && (
                <span
                  className="block text-[11.5px] font-bold tabular mt-0.5"
                  style={{ color: analyst.upsidePct >= 0 ? "var(--good)" : "var(--bad)" }}
                >
                  {analyst.upsidePct >= 0 ? "+" : ""}
                  {analyst.upsidePct.toFixed(0)}% upside
                </span>
              )}
            </div>
          ) : (
            <div className="text-[13px] text-faint">—</div>
          )}
        </div>
      </div>
    </div>
  );
}
