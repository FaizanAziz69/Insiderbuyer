"use client";

/**
 * Investor card — Developer Project Brief (Aug 24 2026), §4.2:
 *  • Header: investor name (display face), firm name (muted), photo where available.
 *  • Performance line: "Performance: +X.XX% last year" with icon, green/red.
 *  • Portfolio value line: "$X.XB portfolio" from latest 13F.
 *  • Top 3 holdings with company logos + "+N more stocks" expander → detail page.
 *  • Differentiator: IQS-style conviction indicator where the fund's holdings
 *    overlap with active insider buying — gold badge, visually prominent.
 */

import Link from "next/link";
import { TrendingDown, TrendingUp, Minus, Sparkles } from "lucide-react";
import { CompanyLogo } from "@/components/CompanyLogo";

export interface InvestorCardData {
  slug: string;
  person: string;
  firm: string;
  photo: string | null;
  active: boolean;
  note: string | null;
  categories: string[];
  performance: number | null;
  perfNote: string | null;
  portfolioValue: number | null;
  positions: number | null;
  asOf: string | null;
  topHoldings: Array<{ ticker: string; name: string; value: number; pct: number }>;
  overlap: Array<{ ticker: string; insiderBought: number; buyers: number }>;
}

export function fmtMoneyShort(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (a >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
  if (a >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${Math.round(v)}`;
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
}

export function InvestorCard({ c }: { c: InvestorCardData }) {
  const perf = c.performance;
  const up = perf != null && perf > 0;
  const down = perf != null && perf < 0;
  const more = (c.positions ?? c.topHoldings.length) - c.topHoldings.length;
  const overlapValue = c.overlap.reduce((a, o) => a + o.insiderBought, 0);

  return (
    <article className="card p-4 flex flex-col gap-3 relative" style={{ minHeight: 232 }}>
      {c.overlap.length > 0 && (
        <Link
          href={`/investors/${c.slug}#overlap`}
          className="absolute top-3 right-3 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide"
          style={{ background: "#C9A227", color: "#1a1400" }}
          title={`${c.overlap.length} holding${c.overlap.length === 1 ? "" : "s"} where insiders are also buying (${fmtMoneyShort(overlapValue)} open-market in 90 days)`}
        >
          <Sparkles className="h-3 w-3" /> Insiders agree · {c.overlap.length}
        </Link>
      )}

      <header className="flex items-center gap-3">
        {c.photo ? (
          <img
            src={c.photo}
            alt={c.person}
            width={48}
            height={48}
            className="rounded-full object-cover flex-shrink-0"
            style={{ width: 48, height: 48, border: "2px solid var(--accent)", background: "var(--bg-2)" }}
          />
        ) : (
          <div
            className="rounded-full flex items-center justify-center font-bold text-[15px] flex-shrink-0"
            style={{ width: 48, height: 48, background: "var(--accent-soft)", color: "var(--accent)" }}
          >
            {initials(c.person)}
          </div>
        )}
        <div className="min-w-0">
          <Link href={`/investors/${c.slug}`} className="block font-bold text-[16px] leading-tight truncate hover:underline">
            {c.person}
          </Link>
          <div className="text-[12.5px] truncate" style={{ color: "var(--text-mute)" }}>
            {c.firm}
          </div>
        </div>
      </header>

      {/* Performance line (§4.2) — suppressed with the reason per §4.4 */}
      <div className="text-[13px]">
        {perf != null ? (
          <span className="inline-flex items-center gap-1.5 font-semibold" style={{ color: up ? "#10B981" : down ? "#EF4444" : "var(--text-mute)" }}>
            {up ? <TrendingUp className="h-4 w-4" /> : down ? <TrendingDown className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
            Performance: {perf > 0 ? "+" : ""}
            {perf.toFixed(2)}% last year
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5" style={{ color: "var(--text-mute)" }} title={c.perfNote ?? undefined}>
            <Minus className="h-4 w-4" /> Performance: —
          </span>
        )}
      </div>

      <div className="text-[13px] font-semibold">
        {c.portfolioValue != null ? `${fmtMoneyShort(c.portfolioValue)} portfolio` : "Portfolio: —"}
        {c.asOf && (
          <span className="font-normal text-[11.5px] ml-1.5" style={{ color: "var(--text-mute)" }}>
            13F · {c.asOf}
          </span>
        )}
      </div>

      {c.topHoldings.length > 0 ? (
        <div className="flex items-center gap-2 mt-auto">
          {c.topHoldings.map((h) => (
            <Link key={h.ticker} href={`/companies/${encodeURIComponent(h.ticker)}`} title={`${h.name} · ${h.pct.toFixed(1)}% of portfolio`} className="flex items-center gap-1">
              <CompanyLogo ticker={h.ticker} name={h.name} size={26} />
              <span className="font-mono text-[11.5px] font-semibold">{h.ticker}</span>
            </Link>
          ))}
          {more > 0 && (
            <Link href={`/investors/${c.slug}`} className="ml-auto text-[12px] font-semibold text-accent whitespace-nowrap">
              +{more} more stocks
            </Link>
          )}
        </div>
      ) : (
        <div className="text-[12.5px] mt-auto" style={{ color: "var(--text-mute)" }}>
          {c.note || "No current 13F filings."}
        </div>
      )}
    </article>
  );
}
