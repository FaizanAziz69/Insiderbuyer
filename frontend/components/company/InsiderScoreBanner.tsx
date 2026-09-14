"use client";
import Link from "next/link";
import { Flame, HelpCircle, Lock } from "lucide-react";
import { usePremium } from "@/components/premium/PremiumContext";
import { TierBadge, tierFor } from "@/components/TierBadge";
import { SUBSCRIBE_HREF } from "@/lib/funnel";
import { formatCurrency } from "@/lib/api";

/**
 * The Insider Score band — full width, directly under the profile header, on
 * EVERY tab.
 *
 * George 2026-09-14, two complaints that turned out to be one thing: "why do
 * some stock pages have an insider score and others don't" and "it is too
 * hidden". Both were true. The score used to live in <SmartScorePanel>, below
 * ten civic cards on the Overview tab only, and it was rendered behind
 * `{data.score && …}` — so a stock with no score showed nothing at all and
 * the page never said why.
 *
 * This band is ALWAYS rendered. Three states:
 *  • scored + unlocked → the number, its tier, and the window behind it
 *  • scored + locked   → blurred decoy + unlock (same strict rule as
 *    SmartScorePanel: the real number never enters the DOM)
 *  • not scored        → says so plainly, and says what would produce one
 *
 * The "not scored" case is real and common: a score needs an open-market
 * purchase or sale (Form 4 codes P and S) inside the 90-day window. Share
 * AWARDS and grants — code A, which is most of what a large board files —
 * are not market decisions, so they are not scored. PPLI, the example George
 * sent, has nothing but code A in the window.
 */

const WINDOW_DAYS = 90;

interface Tx {
  transactionCode?: string | null;
  transactionDate?: string | null;
}

interface Score {
  iqs: number | string;
  transactionCount?: number | string;
  distinctBuyers?: number | string;
  totalPurchaseValue?: number | string;
}

/** Why this ticker has no score, phrased from its own filings. */
function noScoreReason(transactions: Tx[]): string {
  const since = new Date(Date.now() - WINDOW_DAYS * 86400000)
    .toISOString()
    .slice(0, 10);
  const inWindow = (transactions || []).filter(
    (t) => String(t.transactionDate || "") >= since,
  );
  const qualifying = inWindow.filter(
    (t) => t.transactionCode === "P" || t.transactionCode === "S",
  );
  if (qualifying.length) {
    // Filed, but nothing survived the plausibility / round-trip guards.
    return `Insiders filed in the last ${WINDOW_DAYS} days, but none of those trades qualified for scoring — round-trip buys and filings whose price is far off the market are excluded.`;
  }
  if (inWindow.length) {
    return `Insiders here have filed ${inWindow.length} Form ${inWindow.length === 1 ? "4" : "4s"} in the last ${WINDOW_DAYS} days, but all of them are share awards, grants or other non-market transactions. Those are compensation, not a decision to buy, so they are not scored.`;
  }
  return `No insider has filed an open-market purchase or sale here in the last ${WINDOW_DAYS} days, so there is nothing to score yet.`;
}

export function InsiderScoreBanner({
  ticker,
  name,
  score,
  transactions,
}: {
  ticker: string;
  name: string;
  score: Score | null;
  transactions: Tx[];
}) {
  const { unlocked } = usePremium();

  const shell =
    "rounded-xl px-4 sm:px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6";
  const shellStyle = {
    background:
      "linear-gradient(135deg, color-mix(in srgb, var(--accent) 10%, var(--bg-2)) 0%, var(--bg-2) 62%)",
    border: "1px solid color-mix(in srgb, var(--accent) 26%, var(--border))",
  } as const;

  const heading = (
    <div className="flex items-center gap-2">
      <Flame className="h-4 w-4" style={{ color: "var(--accent)" }} />
      <span className="text-[11px] uppercase tracking-[0.16em] font-bold text-accent">
        {ticker} Insider Score
      </span>
    </div>
  );

  // ── No score ────────────────────────────────────────────────────────────
  if (!score || !Number.isFinite(Number(score.iqs))) {
    return (
      <section className={shell} style={shellStyle} aria-label="Insider Score">
        <div className="flex flex-col items-center justify-center flex-shrink-0 w-[104px]">
          <span
            className="text-[34px] font-extrabold leading-none tabular"
            style={{ color: "var(--text-faint)" }}
          >
            &ndash;&ndash;
          </span>
          <span className="text-[10px] uppercase tracking-wider font-bold text-faint mt-1">
            Not scored
          </span>
        </div>
        <div className="min-w-0 flex-1">
          {heading}
          <p className="text-[13.5px] leading-relaxed mt-1.5" style={{ color: "var(--text-mute)" }}>
            {noScoreReason(transactions)}
          </p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2">
            <Link
              href="/methodology#insider-score"
              className="text-[12.5px] font-semibold text-accent hover:underline inline-flex items-center gap-1"
            >
              <HelpCircle className="h-3.5 w-3.5" /> How the score works
            </Link>
            <Link
              href="/insiders/hot"
              className="text-[12.5px] font-semibold text-accent hover:underline"
            >
              See stocks that are scored
            </Link>
          </div>
        </div>
      </section>
    );
  }

  const iqs = Math.round(Number(score.iqs));
  const tier = tierFor(iqs);
  const ring =
    tier === "Bullish" ? "var(--good)" : tier === "Neutral" ? "var(--gold)" : "var(--bad)";

  // ── Scored, locked ──────────────────────────────────────────────────────
  if (!unlocked) {
    return (
      <section className={shell} style={shellStyle} aria-label="Insider Score">
        <div className="flex flex-col items-center justify-center flex-shrink-0 w-[104px]">
          <span
            aria-hidden
            className="text-[40px] font-extrabold leading-none tabular select-none pointer-events-none"
            style={{ filter: "blur(9px)", color: "var(--text)" }}
          >
            00
          </span>
          <span className="text-[10px] uppercase tracking-wider font-bold text-faint mt-1">
            / 100
          </span>
        </div>
        <div className="min-w-0 flex-1">
          {heading}
          <p className="text-[14px] font-semibold leading-snug mt-1.5">
            {name} has a live Insider Score.
          </p>
          <p className="text-[12.5px] mt-0.5" style={{ color: "var(--text-mute)" }}>
            Scored on {Number(score.transactionCount) || 0} qualifying trade
            {Number(score.transactionCount) === 1 ? "" : "s"} from{" "}
            {Number(score.distinctBuyers) || 0} insider
            {Number(score.distinctBuyers) === 1 ? "" : "s"} in the last {WINDOW_DAYS} days.
          </p>
        </div>
        <Link
          href={SUBSCRIBE_HREF}
          className="flex-shrink-0 inline-flex items-center justify-center gap-1.5 px-4 h-10 rounded-lg text-[13px] font-bold whitespace-nowrap"
          style={{ background: "var(--premium)", color: "var(--premium-ink)" }}
        >
          <Lock className="h-3.5 w-3.5" /> Unlock the score
        </Link>
      </section>
    );
  }

  // ── Scored, unlocked ────────────────────────────────────────────────────
  return (
    <section className={shell} style={shellStyle} aria-label="Insider Score">
      <div className="flex flex-col items-center justify-center flex-shrink-0 w-[104px]">
        <span
          className="text-[40px] font-extrabold leading-none tabular"
          style={{ color: ring }}
        >
          {iqs}
        </span>
        <span className="text-[10px] uppercase tracking-wider font-bold text-faint mt-1">
          / 100
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {heading}
          <TierBadge iqs={iqs} />
        </div>
        <p className="text-[12.5px] mt-1.5" style={{ color: "var(--text-mute)" }}>
          {Number(score.transactionCount) || 0} qualifying trade
          {Number(score.transactionCount) === 1 ? "" : "s"} ·{" "}
          {Number(score.distinctBuyers) || 0} insider
          {Number(score.distinctBuyers) === 1 ? "" : "s"} ·{" "}
          {formatCurrency(Number(score.totalPurchaseValue) || 0)} bought in the last{" "}
          {WINDOW_DAYS} days
        </p>
        <div
          className="mt-2 h-1.5 rounded-full overflow-hidden"
          style={{ background: "var(--bg-3)", maxWidth: 320 }}
        >
          <div
            className="h-full rounded-full"
            style={{ width: `${Math.max(2, Math.min(100, iqs))}%`, background: ring }}
          />
        </div>
      </div>
      <Link
        href="/methodology#insider-score"
        className="flex-shrink-0 text-[12.5px] font-semibold text-accent hover:underline inline-flex items-center gap-1 whitespace-nowrap"
      >
        <HelpCircle className="h-3.5 w-3.5" /> How it works
      </Link>
    </section>
  );
}
