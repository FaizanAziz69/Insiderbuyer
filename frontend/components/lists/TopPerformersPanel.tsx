"use client";
import { useEffect } from "react";
import Link from "next/link";
import { Lock, TrendingUp, X } from "lucide-react";
import { formatCurrency, formatNumber } from "@/lib/api";
import { SUBSCRIBE_HREF } from "@/lib/funnel";
import { CompanyLogo } from "@/components/CompanyLogo";
import { MaskedCell } from "@/components/premium/MaskedCell";
import { PaywallCta, PRODUCT_NAME } from "@/components/premium/PaywallCta";

export interface TopPerformer {
  rank: number;
  symbol: string;
  name: string;
  price: number | null;
  changePct: number;
  volume: number;
  dollarVolume: number;
  volumeVsAvgPct: number | null;
}

/** How many of the 10 a visitor sees — "free users see 2-3 off the bottom
 *  rankings" (client 2026-09-08): ranks 8–10 are open, 1–7 are the product. */
export const FREE_PERFORMERS = 3;

const DECOYS: Array<[string, string]> = [
  ["ACME", "Acme Holdings Inc"],
  ["NRTH", "Northline Energy Corp"],
  ["BLUE", "Bluewater Therapeutics"],
  ["VNTG", "Vantage Semiconductor"],
  ["HRBR", "Harbor Financial Group"],
  ["SLST", "Solstice Biosciences"],
  ["PNCL", "Pinnacle Logistics Inc"],
];

/**
 * Right-hand drawer listing a sector's top 10 session gainers — ticker, name,
 * % gain and volume. Premium-gated: locked viewers get the bottom
 * FREE_PERFORMERS rows in the clear and blurred DECOYS above them (the real
 * ticker/name of a masked row never enters the DOM — same strict rule as every
 * other paygate on the site). The % and volume of masked rows stay visible so
 * the reader can see what is behind the wall.
 */
export function TopPerformersPanel({
  open,
  onClose,
  sectorLabel,
  rows,
  locked,
  asOf,
}: {
  open: boolean;
  onClose: () => void;
  /** Already masked by the caller when locked (e.g. "Sector #3"). */
  sectorLabel: string;
  rows: TopPerformer[];
  locked: boolean;
  asOf?: string | null;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;

  const total = rows.length;
  // Masked = every row except the last FREE_PERFORMERS (by rank).
  const isMasked = (r: TopPerformer) => locked && r.rank <= Math.max(0, total - FREE_PERFORMERS);
  const maskedCount = rows.filter(isMasked).length;

  return (
    <div className="fixed inset-0 z-[80]" role="dialog" aria-modal="true" aria-label={`Top performers — ${sectorLabel}`}>
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0"
        style={{ background: "color-mix(in srgb, #000 45%, transparent)" }}
      />
      <aside
        className="absolute right-0 top-0 h-full w-full sm:w-[420px] flex flex-col shadow-2xl"
        style={{ background: "var(--bg-2)", borderLeft: "1px solid var(--border)" }}
      >
        <header className="flex items-start justify-between gap-3 px-5 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-mute text-[11px] font-mono uppercase tracking-wider">
              <TrendingUp className="h-3.5 w-3.5" style={{ color: "var(--good)" }} />
              Top performers today
            </div>
            <h2 className="text-[20px] font-bold tracking-tight truncate">{sectorLabel}</h2>
            <p className="text-[12px] text-mute">
              The sector&rsquo;s {total || 10} biggest session gainers with real volume behind them
              {asOf ? ` · as of ${asOf}` : ""}.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1 text-[12.5px] text-mute hover:text-accent transition flex-shrink-0"
          >
            <X className="h-4 w-4" /> Close
          </button>
        </header>

        <div className="flex-1 overflow-y-auto">
          {locked && maskedCount > 0 && (
            <div className="px-5 pt-4">
              <PaywallCta
                size="sm"
                title={`See all ${total} top performers`}
                subtitle={`The top ${maskedCount} names are part of ${PRODUCT_NAME}. Ranks ${maskedCount + 1}–${total} are open below.`}
                bullets={[]}
                cta="Unlock Top Performers"
              />
            </div>
          )}
          {total === 0 ? (
            <div className="p-8 text-center text-mute text-[13px]">
              No session gainers with meaningful volume yet — check back once the market has traded.
            </div>
          ) : (
            <ol className="px-2 py-3">
              {rows.map((r, i) => {
                const masked = isMasked(r);
                const decoy = DECOYS[i % DECOYS.length];
                return (
                  <li
                    key={r.symbol}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg"
                    style={{ borderBottom: "1px solid var(--border)" }}
                  >
                    <span className="w-6 text-right tabular text-[13px] font-bold text-mute">{r.rank}</span>
                    <div className="flex-1 min-w-0">
                      {masked ? (
                        <MaskedCell label="top performers" lock>
                          <span className="flex items-center gap-2">
                            <span className="h-[22px] w-[22px] rounded" style={{ background: "var(--bg-3)" }} />
                            <span className="min-w-0">
                              <span className="block font-mono text-[14px] font-bold">{decoy[0]}</span>
                              <span className="block text-[11.5px] text-mute truncate">{decoy[1]}</span>
                            </span>
                          </span>
                        </MaskedCell>
                      ) : (
                        <Link href={`/companies/${encodeURIComponent(r.symbol)}`} className="flex items-center gap-2 group">
                          <CompanyLogo ticker={r.symbol} name={r.name} size={22} />
                          <span className="min-w-0">
                            <span className="block font-mono text-[14px] font-bold text-accent group-hover:underline">
                              {r.symbol}
                            </span>
                            <span className="block text-[11.5px] text-mute truncate">{r.name}</span>
                          </span>
                        </Link>
                      )}
                    </div>
                    <div className="text-right leading-tight">
                      <div className="tabular text-[14px] font-bold" style={{ color: "var(--good)" }}>
                        +{r.changePct.toFixed(2)}%
                      </div>
                      <div className="text-[11px] text-mute tabular whitespace-nowrap" title="Session volume (shares) · dollar volume">
                        {formatNumber(r.volume)} sh · {formatCurrency(r.dollarVolume)}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
          {locked && maskedCount > 0 && (
            <div className="px-5 pb-6 text-center">
              <Link href={SUBSCRIBE_HREF} className="btn-primary inline-flex items-center gap-2">
                <Lock className="h-3.5 w-3.5" /> Unlock all top performers
              </Link>
            </div>
          )}
          <p className="px-5 pb-5 text-[11.5px] text-mute leading-relaxed">
            Gainers are ranked by session % change among the sector&rsquo;s members over $50M market cap
            with at least $250K traded. Informational only — not investment advice.
          </p>
        </div>
      </aside>
    </div>
  );
}
