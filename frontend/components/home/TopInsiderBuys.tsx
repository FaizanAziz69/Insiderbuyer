"use client";
import useSWR from "swr";
import Link from "next/link";
import { ArrowUpRight, Receipt } from "lucide-react";
import { API_BASE, fetcher, formatCurrency } from "@/lib/api";
import { CompanyLogo } from "@/components/CompanyLogo";
import { TradeGradeChip, BadgeRow, TRADE_GRADE_DISCLAIMER } from "@/components/TradeGrade";
import { usePremium } from "@/components/premium/PremiumContext";
import { MaskedCell } from "@/components/premium/MaskedCell";
import { decoyFor } from "@/components/premium/lockedDecoys";
import { SUBSCRIBE_HREF } from "@/lib/funnel";

/**
 * "Top Insider Buys This Week" — homepage module (follow-up IQS 2.0 brief):
 * top five, A-grades only, trailing seven days. A-grade means the top decile
 * of every graded purchase in the last year, so an empty week is a real
 * answer and the module says so rather than padding itself with B rows.
 *
 * PAYGATED 2026-09-14 (George: "must blur out the paygated data and info on
 * the Top Insider Buys of the week homepage preview section — stock, company
 * name, insider name, etc"). The module used to print the identities in full
 * while /insiders/top-buys hid the same rows behind the wall, so the homepage
 * was giving away the product this page sells.
 *
 * Same STRICT rule as the full table: a locked row never carries the real
 * ticker, company or insider — not even blurred, because a CSS blur leaves the
 * text in the DOM for view-source. Shared decoys are blurred instead. The
 * grade, value and signal badges stay visible: they are the evidence that
 * what is behind the wall is worth unlocking.
 */
interface Row {
  txId: string;
  ticker: string;
  name: string;
  grade: string;
  badges: string[];
  value: number;
  insiderName: string | null;
  rawTitle: string | null;
  role: string | null;
}

export function TopInsiderBuys() {
  const { unlocked } = usePremium();
  const locked = !unlocked;
  const { data } = useSWR<{ rows: Row[] }>(
    `${API_BASE}/iqs2/top-buys?period=7d&grade=A&limit=5`,
    fetcher,
    { refreshInterval: 30 * 60_000, revalidateOnFocus: false },
  );
  const rows = data?.rows || [];
  if (!rows.length) return null;

  return (
    <section className="card p-5">
      <div className="flex items-center justify-between gap-3 mb-1">
        <h2 className="text-[17px] font-bold flex items-center gap-2">
          <Receipt className="h-4 w-4" style={{ color: "var(--accent)" }} />
          Top Insider Buys This Week
        </h2>
        <Link
          href="/insiders/top-buys"
          className="text-[12.5px] font-semibold text-accent hover:underline whitespace-nowrap inline-flex items-center gap-1"
        >
          All graded buys <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      <p className="text-[12.5px] text-mute mb-3">
        The highest-graded individual purchases filed in the last seven days.
      </p>

      <ul className="divide-y" style={{ borderColor: "var(--border)" }}>
        {rows.map((r, i) => {
          const [dTicker, dName, dInsider, dRole] = decoyFor(i);
          return (
            <li key={r.txId} className="flex items-center gap-3 py-2.5">
              <TradeGradeChip grade={r.grade} size="sm" />
              {locked ? (
                <MaskedCell label="the company and the insider" lock>
                  <span className="flex items-center gap-2">
                    <span
                      className="inline-block rounded-full shrink-0"
                      style={{ width: 20, height: 20, background: "var(--bg-3)" }}
                    />
                    <span className="min-w-0">
                      <span className="block text-[13px] font-bold">{dTicker}</span>
                      <span className="block text-[11px] text-mute truncate max-w-[150px]">
                        {dInsider} · {dRole}
                      </span>
                    </span>
                  </span>
                </MaskedCell>
              ) : (
                <Link href={`/companies/${r.ticker}`} className="flex items-center gap-2 min-w-0 group">
                  <CompanyLogo ticker={r.ticker} name={r.name} size={20} />
                  <span className="min-w-0">
                    <span className="block text-[13px] font-bold group-hover:text-accent">
                      {r.ticker}
                    </span>
                    <span className="block text-[11px] text-mute truncate max-w-[150px]">
                      {r.insiderName} · {r.rawTitle || r.role}
                    </span>
                  </span>
                </Link>
              )}
              <span className="ml-auto flex items-center gap-3">
                <BadgeRow badges={r.badges} max={2} />
                <span className="tabular text-[13px] font-bold whitespace-nowrap">
                  {formatCurrency(r.value)}
                </span>
              </span>
            </li>
          );
        })}
      </ul>

      {locked && (
        <Link
          href={SUBSCRIBE_HREF}
          className="mt-3 flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-[13px] font-bold transition"
          style={{
            background: "color-mix(in srgb, var(--premium) 14%, var(--bg-2))",
            border: "1px solid color-mix(in srgb, var(--premium) 45%, var(--border))",
            color: "var(--text)",
          }}
        >
          Unlock who bought what
        </Link>
      )}

      <p className="text-faint text-[11px] mt-3 leading-relaxed">{TRADE_GRADE_DISCLAIMER}</p>
    </section>
  );
}
