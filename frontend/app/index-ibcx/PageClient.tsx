"use client";

/**
 * The InsiderBuying Conviction Index (IBCX) — Brief v6 §1, published as a
 * data product under §10.
 *
 * §10 governs what this page may say, and the rules are load-bearing rather
 * than decorative: the index is information and not advice, it is not an
 * offer of any fund, agency clients are excluded by rule and the page says so
 * (turning a conflict risk into a credibility feature), and nothing
 * forward-looking is promised. Any backtested figure shown here would have to
 * be labelled hypothetical and reviewed by counsel first, so this page shows
 * only the live index level and its constituents.
 */

import useSWR from "swr";
import Link from "next/link";
import { LineChart, ShieldCheck } from "lucide-react";
import { API_BASE, fetcher, formatDate } from "@/lib/api";
import { CompanyLogo } from "@/components/CompanyLogo";
import { BacktestChart } from "@/components/backtest/BacktestChart";

interface IndexPayload {
  indexId: string;
  name: string;
  level: number | null;
  inception: string | null;
  sinceInception: number | null;
  series: Array<{ date: string; level: number; reconstituted: boolean }>;
  constituents: Array<{ symbol: string; weight: number; sector: string | null; sleeves: string[] }>;
  asOf: string | null;
  disclaimer: string;
}

const SLEEVE_LABEL: Record<string, string> = {
  core: "Core",
  contrarian: "Contrarian",
  smallcap: "Small cap",
};

export default function IbcxPage() {
  const { data, isLoading } = useSWR<IndexPayload>(`${API_BASE}/quant/index`, fetcher, { revalidateOnFocus: false });
  const series = data?.series || [];
  const curve = series.map((p) => ({ t: new Date(`${p.date}T00:00:00Z`).getTime(), s: p.level / 10, b: 100 }));

  return (
    <div className="w-full space-y-5">
      <header>
        <div className="flex items-center gap-2 mb-1.5">
          <LineChart className="h-5 w-5" style={{ color: "var(--accent)" }} />
          <span className="text-[11px] font-bold uppercase tracking-[2px]" style={{ color: "var(--text-mute)" }}>
            Proprietary index
          </span>
        </div>
        <h1 className="text-[28px] sm:text-[32px] font-bold tracking-tight leading-tight">
          {data?.name || "InsiderBuying Conviction Index"}
        </h1>
        <p className="mt-2 text-[15px] max-w-[76ch]" style={{ color: "var(--text-mute)" }}>
          A rules-based index of companies that clear a downside-protection screen and show real insider conviction.
          Built only from public disclosures and as-reported financial statements, scored on what was knowable on each
          date, and reconstituted quarterly.
        </p>
      </header>

      {isLoading && !data ? (
        <div className="card p-6">
          <div className="shimmer h-8 w-40 rounded mb-3" />
          <div className="shimmer h-64 w-full rounded" />
        </div>
      ) : !data?.level ? (
        <div className="card p-6 text-[14px]" style={{ color: "var(--text-mute)" }}>
          The index publishes once the ranking engine has produced its first reconstitution.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Tile label="Index level" value={data.level.toLocaleString(undefined, { maximumFractionDigits: 2 })} />
            <Tile
              label="Since inception"
              value={data.sinceInception == null ? "—" : `${data.sinceInception >= 0 ? "+" : ""}${(data.sinceInception * 100).toFixed(1)}%`}
              tone={data.sinceInception == null ? undefined : data.sinceInception >= 0 ? "up" : "down"}
            />
            <Tile label="Constituents" value={String(data.constituents.length)} />
            <Tile label="As of" value={data.asOf ? formatDate(data.asOf) : "—"} />
          </div>

          {curve.length > 1 ? (
            <section className="card p-4 sm:p-5">
              <h2 className="text-[15px] font-bold mb-3">Index level</h2>
              <BacktestChart curve={curve} height={280} strategyLabel="IBCX" benchmarkLabel="Base 1000" />
              <p className="text-[11px] mt-2" style={{ color: "var(--text-faint)" }}>
                Base 1000 at inception{data.inception ? ` (${formatDate(data.inception)})` : ""}. The index holds no cash
                buffer and applies no tranche or liquidity logic; those belong to a managed portfolio, not to a published index.
              </p>
            </section>
          ) : null}

          <section>
            <h2 className="text-[15px] font-bold uppercase tracking-wide mb-2">Constituents</h2>
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="table-base">
                  <thead>
                    <tr className="text-[10.5px] uppercase tracking-wider" style={{ background: "var(--bg-2)", color: "var(--text-mute)" }}>
                      <th className="text-left font-bold px-3.5 py-2">Company</th>
                      <th className="text-left font-bold px-3.5 py-2">Sector</th>
                      <th className="text-left font-bold px-3.5 py-2">Sleeve</th>
                      <th className="text-right font-bold px-3.5 py-2">Weight</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.constituents.map((c) => (
                      <tr key={c.symbol} style={{ borderTop: "1px solid var(--border)" }}>
                        <td className="px-3.5 py-2.5">
                          <Link href={`/companies/${c.symbol}`} className="flex items-center gap-2 group">
                            <CompanyLogo ticker={c.symbol} name={c.symbol} size={22} />
                            <span className="font-mono font-semibold group-hover:text-accent transition">{c.symbol}</span>
                          </Link>
                        </td>
                        <td className="px-3.5 py-2.5 text-[12.5px]" style={{ color: "var(--text-soft)" }}>{c.sector || "—"}</td>
                        <td className="px-3.5 py-2.5">
                          <span className="inline-flex gap-1 flex-wrap">
                            {(c.sleeves || []).map((s) => (
                              <span key={s} className="text-[10.5px] font-semibold rounded-full px-2 py-0.5"
                                style={{ background: "var(--bg-3)", color: "var(--text-soft)", border: "1px solid var(--border)" }}>
                                {SLEEVE_LABEL[s] || s}
                              </span>
                            ))}
                          </span>
                        </td>
                        <td className="px-3.5 py-2.5 text-right tabular font-semibold">{(c.weight * 100).toFixed(2)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </>
      )}

      <section className="rounded-lg p-4 text-[12.5px] leading-relaxed" style={{ background: "var(--bg-3)", border: "1px solid var(--border)", color: "var(--text-soft)" }}>
        <div className="flex items-center gap-2 mb-2">
          <ShieldCheck className="h-4 w-4" style={{ color: "var(--accent)" }} />
          <span className="font-bold uppercase tracking-wider text-[11px]">How this index is built, and what it is not</span>
        </div>
        <p className="mb-2">
          Two gates decide membership. The first is absolute: more assets than debt, a healthy current ratio and interest
          coverage, growing revenue, free cash flow that is positive or clearly improving, and enough size and traded volume
          to be buyable. A company failing any one of them is ineligible regardless of anything else. The second scores
          insider conviction over 24 months of filings, weighting the last six months most heavily, counting open-market
          purchases as the dominant signal and excluding planned sales entirely, because a scheduled sale says nothing about
          conviction.
        </p>
        <p>{data?.disclaimer}</p>
      </section>
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" }) {
  return (
    <div className="rounded-lg p-3" style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}>
      <div className="text-[10.5px] uppercase tracking-wider font-bold" style={{ color: "var(--text-mute)" }}>{label}</div>
      <div className="text-[20px] font-bold tabular mt-0.5" style={{ color: tone === "up" ? "#10B981" : tone === "down" ? "#EF4444" : "var(--text)" }}>
        {value}
      </div>
    </div>
  );
}
