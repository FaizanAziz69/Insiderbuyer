"use client";
import useSWR from "swr";
import Link from "next/link";
import { ArrowUpRight, Receipt } from "lucide-react";
import { API_BASE, fetcher, formatCurrency } from "@/lib/api";
import { CompanyLogo } from "@/components/CompanyLogo";
import { TradeGradeChip, BadgeRow, TRADE_GRADE_DISCLAIMER } from "@/components/TradeGrade";

/**
 * "Top Insider Buys This Week" — homepage module (follow-up IQS 2.0 brief):
 * top five, A-grades only, trailing seven days. A-grade means the top decile
 * of every graded purchase in the last year, so an empty week is a real
 * answer and the module says so rather than padding itself with B rows.
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
        {rows.map((r) => (
          <li key={r.txId} className="flex items-center gap-3 py-2.5">
            <TradeGradeChip grade={r.grade} size="sm" />
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
            <span className="ml-auto flex items-center gap-3">
              <BadgeRow badges={r.badges} max={2} />
              <span className="tabular text-[13px] font-bold whitespace-nowrap">
                {formatCurrency(r.value)}
              </span>
            </span>
          </li>
        ))}
      </ul>

      <p className="text-faint text-[11px] mt-3 leading-relaxed">{TRADE_GRADE_DISCLAIMER}</p>
    </section>
  );
}
