"use client";
import useSWR from "swr";
import Link from "next/link";
import { useState } from "react";
import { Landmark } from "lucide-react";
import { API_BASE, fetcher } from "@/lib/api";
import { CtsScoreCell } from "@/components/congress-trades/CtsScoreCell";
import { EvidenceChain } from "@/components/congress-trades/EvidenceChain";

/**
 * Brief v5 §4 — "Per-stock module: On stock report pages: 'Government
 * contracts + congressional holders' block when applicable."
 *
 * "When applicable" is doing real work: almost no listed company has a member
 * of Congress holding its stock while that member's committee oversees the
 * agency that just paid it. The module renders nothing at all otherwise,
 * rather than announcing an absence on thousands of stock pages.
 */

interface Row {
  id: number;
  member: string;
  party: string | null;
  chamber: string | null;
  ticker: string;
  company: string | null;
  agency: string;
  awardValue: number;
  awardDate: string | null;
  tradeDate: string | null;
  tradeAction: string | null;
  committee: string;
  role: string;
  score: number | null;
  components: Record<string, number | null>;
  headline: string;
  evidence: any;
}

function money(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return "—";
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${Math.round(v / 1e6)}M`;
  return `$${Math.round(v).toLocaleString()}`;
}

function day(v: string | null): string {
  if (!v) return "—";
  const d = new Date(v);
  return isNaN(d.getTime())
    ? String(v).slice(0, 10)
    : d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

export function CongressContractsPanel({ ticker }: { ticker: string }) {
  const [open, setOpen] = useState<number | null>(null);
  const { data } = useSWR<{ rows: Row[]; frame: string; amountNote: string }>(
    ticker ? `${API_BASE}/congress-trades/ticker/${encodeURIComponent(ticker)}` : null,
    fetcher,
    { revalidateOnFocus: false, shouldRetryOnError: false },
  );

  if (!data?.rows?.length) return null;

  const agencies = [...new Set(data.rows.map((r) => r.agency))];

  return (
    <section className="rounded-lg p-4" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
      <h2 className="flex items-center gap-2 text-[15px] font-bold m-0 mb-1" style={{ color: "var(--text)" }}>
        <Landmark size={16} style={{ color: "var(--accent)" }} />
        Government contracts and congressional holders
      </h2>
      <p className="text-[12.5px] leading-relaxed m-0 mb-3" style={{ color: "var(--text-soft)" }}>
        {ticker} has been awarded federal contracts by {agencies.length === 1 ? "an agency" : "agencies"} overseen by
        committees that members holding this stock sit on. Each row links to the filing, the committee record and the
        award.
      </p>

      <ul className="list-none p-0 m-0 flex flex-col gap-2">
        {data.rows.map((r) => (
          <li key={r.id}>
            <div
              className="rounded-lg p-3 flex flex-wrap items-center gap-x-4 gap-y-1.5"
              style={{ background: "var(--bg-3)", border: "1px solid var(--border)" }}
            >
              <CtsScoreCell score={r.score} components={r.components} />
              <span className="min-w-0 flex-1">
                <Link
                  href={`/politicians/${encodeURIComponent(r.member)}`}
                  className="block text-[13px] font-bold hover:text-accent"
                  style={{ color: "var(--text)" }}
                >
                  {r.member}
                  {r.party ? <span className="ml-1.5 font-normal text-mute">{r.party}</span> : null}
                </Link>
                <span className="block text-[11.5px] truncate" style={{ color: "var(--text-mute)" }}>
                  {r.committee}
                </span>
              </span>
              <span className="text-[12px] whitespace-nowrap text-right" style={{ color: "var(--text-soft)" }}>
                {money(r.awardValue)}
                <span className="block text-[11px]" style={{ color: "var(--text-mute)" }}>
                  {r.agency} · {day(r.awardDate)}
                </span>
              </span>
              <button
                onClick={() => setOpen(open === r.id ? null : r.id)}
                className="text-[12px] font-semibold text-accent hover:underline whitespace-nowrap"
              >
                {open === r.id ? "Hide" : "Evidence"}
              </button>
            </div>
            {open === r.id ? <EvidenceChain row={r} onClose={() => setOpen(null)} /> : null}
          </li>
        ))}
      </ul>

      <p className="text-[11px] leading-relaxed mt-3 m-0" style={{ color: "var(--text-mute)" }}>
        {data.frame}
      </p>

      <Link href="/top-congress-trades" className="inline-block mt-2 text-[12.5px] font-semibold text-accent hover:underline">
        Full congress trade rankings →
      </Link>
    </section>
  );
}
