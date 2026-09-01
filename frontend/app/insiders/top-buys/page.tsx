"use client";
import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { Receipt } from "lucide-react";
import { API_BASE, fetcher, formatCurrency } from "@/lib/api";
import { AdSlot } from "@/components/AdSlot";
import { CompanyLogo } from "@/components/CompanyLogo";
import { SectorFilter, SectorValue } from "@/components/SectorFilter";
import { sectorGroupFor } from "@/lib/sector-groups";
import {
  TradeGradeChip,
  BadgeRow,
  BADGE_META,
  TRADE_GRADE_DISCLAIMER,
} from "@/components/TradeGrade";

/**
 * Top Insider Buys — the ranked TRANSACTION list (follow-up IQS 2.0 brief).
 *
 * Its sibling, Top Insider Scores, ranks companies by the Insider Score. This
 * page ranks individual purchases by Trade Grade, so the unit of the list is a
 * filing, and every row links to that filing on EDGAR — the house rule that
 * nothing is asserted without the document behind it.
 */
interface Row {
  txId: string;
  date: string;
  grade: string;
  tradeScore: number;
  badges: string[];
  percentile: number;
  insiderName: string | null;
  rawTitle: string | null;
  role: string | null;
  shares: number;
  price: number;
  value: number;
  filingUrl: string | null;
  ticker: string;
  name: string;
  sector: string | null;
  marketCap: number | null;
}

const PERIODS: Array<[string, string]> = [
  ["24h", "24 hours"],
  ["7d", "7 days"],
  ["30d", "30 days"],
];
const GRADES: Array<[string, string]> = [
  ["", "All grades"],
  ["A", "A only"],
  ["B", "B and better"],
];
const CAPS: Array<[string, string, string]> = [
  ["", "Any size", ""],
  ["micro", "Under $300M", "&maxMarketCap=300000000"],
  ["small", "$300M – $2B", "&minMarketCap=300000000&maxMarketCap=2000000000"],
  ["mid", "$2B – $10B", "&minMarketCap=2000000000&maxMarketCap=10000000000"],
  ["large", "Over $10B", "&minMarketCap=10000000000"],
];
const BADGE_OPTIONS = ["", ...Object.keys(BADGE_META)];

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export default function TopBuysPage() {
  const [period, setPeriod] = useState("7d");
  const [grade, setGrade] = useState("");
  const [badge, setBadge] = useState("");
  const [cap, setCap] = useState("");
  const [sector, setSector] = useState<SectorValue>("all");
  const [q, setQ] = useState("");

  const capQs = CAPS.find(([v]) => v === cap)?.[2] || "";
  const { data, isLoading } = useSWR<{ rows: Row[]; count: number }>(
    `${API_BASE}/iqs2/top-buys?period=${period}&limit=200` +
      (grade ? `&grade=${grade}` : "") +
      (badge ? `&badge=${badge}` : "") +
      capQs,
    fetcher,
    { refreshInterval: 15 * 60_000, revalidateOnFocus: false },
  );

  const rows = (data?.rows || []).filter((r) => {
    // Same classifier the score tables use, so "Technology" here means what it
    // means everywhere else — the raw sector column mixes GICS names with SIC
    // descriptions, and a substring match would file biotech under tech.
    if (sector !== "all" && sectorGroupFor(r.sector)?.slug !== sector) return false;
    if (!q) return true;
    const hay = `${r.ticker} ${r.name} ${r.insiderName || ""}`.toLowerCase();
    return hay.includes(q.toLowerCase());
  });

  return (
    <div className="w-full max-w-6xl mx-auto space-y-5 pb-16">
      <header className="pt-2">
        <div className="flex items-center gap-2 text-mute text-sm mb-1">
          <Receipt className="h-4 w-4" />
          <span className="font-mono uppercase tracking-wider text-[11px]">Top Insider Buys</span>
        </div>
        <h1 className="text-[30px] sm:text-[38px] font-semibold tracking-tight">
          Top Insider Buys
        </h1>
        <p className="text-mute text-[14px] sm:text-[15px] mt-2 max-w-4xl leading-relaxed">
          The best-graded individual insider purchases, filing by filing. Top
          Insider Scores ranks <em>companies</em>; this ranks the{" "}
          <strong style={{ color: "var(--text)" }}>purchases themselves</strong>.
          Every open-market buy by an officer or director is graded A+ to F on
          its size and stake growth, the buyer&rsquo;s record and seniority,
          whether the buying is opportunistic or routine, whether they bought
          into weakness, and the company&rsquo;s valuation and size. Awards,
          option exercises, tax withholding, gifts and 10b5-1 plan trades are
          not purchases and are never graded.
        </p>
      </header>

      <AdSlot slot="leaderboard" seed="top-buys" />

      <div className="card p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12px] font-bold uppercase tracking-wider text-mute">Period</span>
            <div
              className="inline-flex items-center gap-1 rounded-lg p-1"
              style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}
            >
              {PERIODS.map(([v, label]) => (
                <button
                  key={v}
                  onClick={() => setPeriod(v)}
                  className="px-3 py-1.5 rounded-md text-[13px] font-semibold transition"
                  style={{
                    background: period === v ? "var(--accent)" : "transparent",
                    color: period === v ? "#fff" : "var(--text)",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {[
            ["Grade", grade, setGrade, GRADES.map(([v, l]) => [v, l] as [string, string])],
            [
              "Badge",
              badge,
              setBadge,
              BADGE_OPTIONS.map(
                (b) => [b, b ? BADGE_META[b].label : "Any badge"] as [string, string],
              ),
            ],
            ["Market cap", cap, setCap, CAPS.map(([v, l]) => [v, l] as [string, string])],
          ].map(([label, value, setter, options]) => (
            <div key={String(label)} className="flex items-center gap-2">
              <span className="text-[12px] font-bold uppercase tracking-wider text-mute">
                {label as string}
              </span>
              <select
                value={value as string}
                onChange={(e) => (setter as (v: string) => void)(e.target.value)}
                className="px-3 py-1.5 rounded-lg text-[13px] font-semibold"
                style={{
                  background: "var(--bg-2)",
                  border: "1px solid var(--border)",
                  color: "var(--text)",
                }}
              >
                {(options as Array<[string, string]>).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
          ))}

          <SectorFilter value={sector} onChange={setSector} />
        </div>

        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ticker, company or insider…"
          className="w-full sm:max-w-xs px-3 py-2 rounded-md text-[13px]"
          style={{
            background: "var(--bg-1)",
            border: "1px solid var(--border-strong)",
            color: "var(--text)",
          }}
        />
      </div>

      <div className="card overflow-hidden">
        {isLoading && !data ? (
          <div className="text-center text-mute py-10">Loading graded purchases…</div>
        ) : !rows.length ? (
          <div className="text-center text-mute py-10">
            No graded purchases match these filters in the last {period}.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-mute text-left" style={{ borderBottom: "1px solid var(--border)" }}>
                  <th className="py-2.5 px-3">Grade</th>
                  <th className="py-2.5 px-3">Company</th>
                  <th className="py-2.5 px-3">Insider</th>
                  <th className="py-2.5 px-3 text-right">Value</th>
                  <th className="py-2.5 px-3 text-right">Shares @ price</th>
                  <th className="py-2.5 px-3">Filed</th>
                  <th className="py-2.5 px-3">Signals</th>
                  <th className="py-2.5 px-3">Filing</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.txId} style={{ borderTop: "1px solid var(--border)" }}>
                    <td className="py-2.5 px-3">
                      <TradeGradeChip grade={r.grade} />
                    </td>
                    <td className="py-2.5 px-3">
                      <Link href={`/companies/${r.ticker}`} className="flex items-center gap-2 group">
                        <CompanyLogo ticker={r.ticker} name={r.name} size={22} />
                        <span className="min-w-0">
                          <span className="block font-bold text-[13px] group-hover:text-accent">
                            {r.ticker}
                          </span>
                          <span className="block text-[11.5px] text-mute truncate max-w-[170px]">
                            {r.name}
                          </span>
                        </span>
                      </Link>
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="block truncate max-w-[180px]">{r.insiderName}</span>
                      <span className="block text-[11.5px] text-mute truncate max-w-[180px]">
                        {r.rawTitle || r.role}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right tabular font-bold">
                      {formatCurrency(r.value)}
                    </td>
                    <td className="py-2.5 px-3 text-right tabular text-mute">
                      {Math.round(r.shares).toLocaleString()} @ ${Number(r.price).toFixed(2)}
                    </td>
                    <td className="py-2.5 px-3 text-mute whitespace-nowrap">{fmtDate(r.date)}</td>
                    <td className="py-2.5 px-3">
                      <BadgeRow badges={r.badges} />
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      {r.filingUrl && (
                        <a
                          href={r.filingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-accent hover:underline text-[12.5px] font-semibold"
                        >
                          Form 4
                        </a>
                      )}
                      <Link
                        href={`/score-explainer?t=${r.ticker}`}
                        className="ml-2 text-[12.5px] text-mute hover:underline"
                      >
                        How it scored
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-faint text-[12px] leading-relaxed max-w-4xl">
        {TRADE_GRADE_DISCLAIMER} Grades are percentile ranks against every graded
        purchase of the last twelve months, recomputed daily. Insider Buying is a
        publisher, not an investment adviser.
      </p>
    </div>
  );
}
