"use client";

/**
 * INVESTOR DETAIL — Developer Project Brief (Aug 24 2026), §4.3:
 *  "URL pattern /investors/{slug}. Full holdings table (position, value, % of
 *   portfolio, change vs. prior quarter), transaction history by filing
 *   period, performance chart, and a 'Where this fund and insiders agree'
 *   module listing overlap tickers. This page is the internal-link target
 *   for the Top Performing Hedge Funds data article."
 */

import { use, useMemo, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { ArrowLeft, Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import { API_BASE } from "@/lib/api";
import { CompanyLogo } from "@/components/CompanyLogo";
import { DataTable, type Column } from "@/components/DataTable";
import { ComplianceFooter } from "@/components/ComplianceFooter";
import { fmtMoneyShort } from "@/components/investors/InvestorCard";

interface Holding {
  cusip: string;
  ticker: string | null;
  name: string;
  shares: number;
  value: number;
  putCall: string;
  link: string | null;
  priorShares: number | null;
  priorValue: number | null;
  pct: number;
  changeShares: number;
  isNew: boolean;
}
interface Change {
  ticker: string | null;
  name: string;
  kind: "new" | "closed" | "added" | "reduced";
  shares: number;
  prevShares: number;
  value: number;
  prevValue: number;
}
interface Detail {
  slug: string;
  person: string;
  firm: string;
  cik: string | null;
  photo: string | null;
  active: boolean;
  note: string | null;
  categories: string[];
  performance: number | null;
  perfNote: string | null;
  perfAsOf: string | null;
  legs: Array<{ from: string; to: string; returnPct: number; positions: number; weightCovered: number; fraction: number }>;
  asOf: string | null;
  priorPeriod: string | null;
  portfolioValue: number;
  summaries: Array<{ period: string; marketValue: number; previousMarketValue: number; positions: number; added: number; removed: number; turnover: number; fmpPerf1y: number | null }>;
  holdings: Holding[];
  holdingsTotal?: number;
  holdingsTruncated?: boolean;
  history: Array<{ period: string; filingDate: string | null; changes: Change[]; totalChanges: number }>;
  overlap: Array<{ ticker: string; name: string; fundValue: number; fundPct: number; insiderBought: number; buyers: number }>;
}

const fetcher = (url: string) => fetch(url).then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))));
const CAT_LABEL: Record<string, string> = { growth: "Growth", value: "Value", short: "Short seller", longterm: "Long-term" };

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
}

/** Cumulative performance curve from the legs: quarter-end points chained
 *  by compounding (the same arithmetic that produces the headline figure). */
function PerfChart({ legs }: { legs: Detail["legs"] }) {
  const pts = useMemo(() => {
    let g = 1;
    const out = [{ date: legs[0]?.from ?? "", value: 0 }];
    for (const l of legs) {
      g *= Math.pow(1 + l.returnPct / 100, l.fraction);
      out.push({ date: l.to, value: (g - 1) * 100 });
    }
    return out;
  }, [legs]);
  if (pts.length < 2) return null;
  const W = 640;
  const H = 180;
  const pad = 28;
  const min = Math.min(0, ...pts.map((p) => p.value));
  const max = Math.max(0, ...pts.map((p) => p.value));
  const y = (v: number) => H - pad - ((v - min) / (max - min || 1)) * (H - pad * 2);
  const x = (i: number) => pad + (i / (pts.length - 1)) * (W - pad * 2);
  const d = pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1].value;
  const color = last >= 0 ? "#10B981" : "#EF4444";
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Cumulative trailing performance by filing period">
      <line x1={pad} x2={W - pad} y1={y(0)} y2={y(0)} stroke="var(--border)" strokeDasharray="4 4" />
      <path d={d} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      {pts.map((p, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(p.value)} r={3.5} fill={color} />
          <text x={x(i)} y={H - 8} textAnchor="middle" fontSize={10} fill="var(--text-mute)">
            {p.date.slice(0, 7)}
          </text>
          <text x={x(i)} y={y(p.value) - 8} textAnchor="middle" fontSize={10.5} fontWeight={700} fill="var(--text)">
            {p.value > 0 ? "+" : ""}
            {p.value.toFixed(1)}%
          </text>
        </g>
      ))}
    </svg>
  );
}

export default function InvestorDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const [showAll, setShowAll] = useState(false);
  // The default payload carries the 500 largest positions; "Show all" refetches
  // the complete filing (BlackRock is ~5,700 lines).
  const { data, error, isLoading } = useSWR<Detail>(
    `${API_BASE}/investors/${encodeURIComponent(slug)}${showAll ? "?all=1" : ""}`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 120_000, keepPreviousData: true },
  );

  if (error) {
    return (
      <div className="card p-6">
        <h1 className="text-[22px] font-bold">Investor not found</h1>
        <Link href="/investors" className="text-accent text-[13px]">
          ← All investors
        </Link>
      </div>
    );
  }
  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <div className="card p-6">
          <div className="shimmer h-6 w-1/3 rounded mb-3" />
          <div className="shimmer h-4 w-1/4 rounded" />
        </div>
        <div className="card p-6" style={{ height: 240 }} />
      </div>
    );
  }
  const d = data;
  const shares = d.holdings.filter((h) => h.putCall === "Share");
  const rows = shares;
  const totalPositions = d.holdingsTotal ?? d.holdings.length;
  const up = (d.performance ?? 0) > 0;

  const cols: Column<Holding>[] = [
    {
      key: "ticker",
      label: "Position",
      sortValue: (h) => h.ticker || h.name,
      render: (h) => (
        <span className="inline-flex items-center gap-2 min-w-0">
          <CompanyLogo ticker={h.ticker} name={h.name} size={24} />
          <span className="min-w-0">
            {h.ticker ? (
              <Link href={`/companies/${encodeURIComponent(h.ticker)}`} className="font-mono font-bold text-accent">
                {h.ticker}
              </Link>
            ) : (
              <span className="font-mono text-[12px]">{h.cusip}</span>
            )}
            <span className="block text-[11.5px] truncate max-w-[220px]" style={{ color: "var(--text-mute)" }}>
              {h.name}
            </span>
          </span>
        </span>
      ),
    },
    { key: "value", label: "Value", align: "right", sortValue: (h) => h.value, render: (h) => <span className="tabular font-semibold">{fmtMoneyShort(h.value)}</span> },
    { key: "pct", label: "% of portfolio", align: "right", sortValue: (h) => h.pct, render: (h) => <span className="tabular">{h.pct.toFixed(2)}%</span> },
    { key: "shares", label: "Shares", align: "right", sortValue: (h) => h.shares, render: (h) => <span className="tabular">{Math.round(h.shares).toLocaleString()}</span> },
    {
      key: "change",
      label: `Change vs ${d.priorPeriod ?? "prior qtr"}`,
      align: "right",
      sortValue: (h) => h.changeShares,
      render: (h) =>
        h.isNew ? (
          <span className="text-[11px] font-bold uppercase" style={{ color: "#10B981" }}>
            New
          </span>
        ) : h.changeShares === 0 ? (
          <span style={{ color: "var(--text-mute)" }}>—</span>
        ) : (
          <span className="tabular font-semibold" style={{ color: h.changeShares > 0 ? "#10B981" : "#EF4444" }}>
            {h.changeShares > 0 ? "+" : ""}
            {Math.round(h.changeShares).toLocaleString()} sh
            {h.priorShares ? (
              <span className="block text-[11px] font-normal" style={{ color: "var(--text-mute)" }}>
                {((h.changeShares / h.priorShares) * 100).toFixed(1)}%
              </span>
            ) : null}
          </span>
        ),
    },
  ];

  return (
    <div className="w-full space-y-6">
      <Link href="/investors" className="text-accent text-[13px] inline-flex items-center gap-1">
        <ArrowLeft className="h-4 w-4" /> All investors
      </Link>

      <header className="card p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          {d.photo ? (
            <img src={d.photo} alt={d.person} width={80} height={80} className="rounded-full object-cover flex-shrink-0" style={{ width: 80, height: 80, border: "2px solid var(--accent)" }} />
          ) : (
            <div className="rounded-full flex items-center justify-center text-[22px] font-bold flex-shrink-0" style={{ width: 80, height: 80, background: "var(--accent-soft)", color: "var(--accent)" }}>
              {initials(d.person)}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="text-[26px] sm:text-[32px] font-bold tracking-tight leading-tight">{d.person}</h1>
            <div className="text-[14px]" style={{ color: "var(--text-mute)" }}>
              {d.firm}
              {d.cik ? ` · CIK ${d.cik}` : ""}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {d.categories.map((c) => (
                <Link key={c} href={`/investors?tab=${c}`} className="rounded px-2 py-0.5 text-[11.5px] font-semibold" style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}>
                  {CAT_LABEL[c] ?? c}
                </Link>
              ))}
              {!d.active && (
                <span className="rounded px-2 py-0.5 text-[11.5px] font-semibold" style={{ background: "var(--bg-2)", border: "1px solid var(--border)", color: "var(--text-mute)" }}>
                  No current filings
                </span>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:text-right">
            <div>
              <div className="text-[10.5px] uppercase tracking-wider font-bold" style={{ color: "var(--text-mute)" }}>
                Performance · 12 mo
              </div>
              {d.performance != null ? (
                <div className="text-[24px] font-bold inline-flex items-center gap-1" style={{ color: up ? "#10B981" : "#EF4444" }}>
                  {up ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
                  {d.performance > 0 ? "+" : ""}
                  {d.performance.toFixed(2)}%
                </div>
              ) : (
                <div className="text-[13px] mt-1" style={{ color: "var(--text-mute)" }} title={d.perfNote ?? undefined}>
                  — <span className="block text-[11px]">{d.perfNote}</span>
                </div>
              )}
            </div>
            <div>
              <div className="text-[10.5px] uppercase tracking-wider font-bold" style={{ color: "var(--text-mute)" }}>
                Portfolio · 13F {d.asOf ?? ""}
              </div>
              <div className="text-[24px] font-bold">{d.portfolioValue ? fmtMoneyShort(d.portfolioValue) : "—"}</div>
              <div className="text-[11.5px]" style={{ color: "var(--text-mute)" }}>
                {shares.length} positions
              </div>
            </div>
          </div>
        </div>
        {d.note && (
          <p className="mt-4 text-[13px]" style={{ color: "var(--text-mute)" }}>
            {d.note}
          </p>
        )}
      </header>

      {/* Performance chart (§4.3) */}
      {d.legs.length > 0 && (
        <section className="card p-5">
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <h2 className="text-[16px] font-bold">Performance by filing period</h2>
            <Link href="/methodology#top-insiders" className="text-[12px] font-semibold text-accent">
              How this is computed →
            </Link>
          </div>
          <p className="text-[12.5px] mt-1" style={{ color: "var(--text-mute)" }}>
            Cumulative return of disclosed long positions, value-weighted and rebalanced at each
            13F filing date; the last point runs from the latest quarter-end to today at live prices.
          </p>
          <div className="mt-3">
            <PerfChart legs={d.legs} />
          </div>
          <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[12px]">
            {d.legs.map((l) => (
              <div key={l.from + l.to} className="rounded-lg px-3 py-2" style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}>
                <div style={{ color: "var(--text-mute)" }}>
                  {l.from} → {l.to}
                  {l.fraction < 1 ? ` · ${Math.round(l.fraction * 100)}% in window` : ""}
                </div>
                <div className="font-bold" style={{ color: l.returnPct >= 0 ? "#10B981" : "#EF4444" }}>
                  {l.returnPct > 0 ? "+" : ""}
                  {l.returnPct.toFixed(2)}%
                </div>
                <div style={{ color: "var(--text-mute)" }}>
                  {l.positions} positions · {Math.round(l.weightCovered * 100)}% of value priced
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Where this fund and insiders agree (§4.3) */}
      <section className="card p-5" id="overlap">
        <h2 className="text-[16px] font-bold inline-flex items-center gap-2">
          <Sparkles className="h-4 w-4" style={{ color: "#C9A227" }} /> Where this fund and insiders agree
        </h2>
        <p className="text-[12.5px] mt-1" style={{ color: "var(--text-mute)" }}>
          Holdings in the latest 13F where corporate insiders have also made open-market purchases (SEC Form 4) in the last 90 days.
        </p>
        {d.overlap.length ? (
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {d.overlap.map((o) => (
              <Link key={o.ticker} href={`/companies/${encodeURIComponent(o.ticker)}`} className="rounded-lg px-3 py-2.5 flex items-center gap-3" style={{ background: "var(--bg-2)", border: "1px solid #C9A22766" }}>
                <CompanyLogo ticker={o.ticker} name={o.name} size={30} />
                <div className="min-w-0 flex-1">
                  <div className="font-mono font-bold text-[13px]">{o.ticker}</div>
                  <div className="text-[11.5px] truncate" style={{ color: "var(--text-mute)" }}>
                    {o.name}
                  </div>
                </div>
                <div className="text-right text-[11.5px]">
                  <div className="font-semibold" style={{ color: "#10B981" }}>
                    {fmtMoneyShort(o.insiderBought)} insider buys
                  </div>
                  <div style={{ color: "var(--text-mute)" }}>
                    {o.buyers} buyer{o.buyers === 1 ? "" : "s"} · {o.fundPct > 0 && o.fundPct < 0.1 ? "<0.1" : o.fundPct.toFixed(1)}% of fund
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-[13px] mt-3" style={{ color: "var(--text-mute)" }}>
            None of the current holdings has open-market insider buying in the last 90 days.
          </p>
        )}
      </section>

      {/* Full holdings table (§4.3) */}
      <section className="card p-5">
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <h2 className="text-[16px] font-bold">Holdings · 13F for {d.asOf ?? "—"}</h2>
          <span className="text-[12px]" style={{ color: "var(--text-mute)" }}>
            {totalPositions} positions{d.holdingsTruncated ? ` · showing the ${shares.length} largest` : ""}{d.holdings.length > shares.length ? ` · ${d.holdings.length - shares.length} option positions not shown` : ""}
          </span>
        </div>
        {rows.length ? (
          <>
            <div className="mt-3 overflow-x-auto">
              <DataTable columns={cols} rows={rows} rowKey={(h) => h.cusip} initialSort={{ key: "value", dir: "desc" }} />
            </div>
            {(d.holdingsTruncated || showAll) && (
              <button onClick={() => setShowAll((v) => !v)} className="mt-3 text-[13px] font-semibold text-accent">
                {showAll ? "Show the 500 largest" : `Show all ${totalPositions} positions`}
              </button>
            )}
          </>
        ) : (
          <p className="text-[13px] mt-3" style={{ color: "var(--text-mute)" }}>
            {d.note || "No holdings on record."}
          </p>
        )}
      </section>

      {/* Transaction history by filing period (§4.3) */}
      {d.history.length > 0 && (
        <section className="card p-5">
          <h2 className="text-[16px] font-bold">Transaction history by filing period</h2>
          <p className="text-[12.5px] mt-1" style={{ color: "var(--text-mute)" }}>
            Positions opened, closed, added to or reduced between consecutive 13F filings, largest changes first.
          </p>
          <div className="mt-3 space-y-4">
            {d.history.map((h) => (
              <div key={h.period}>
                <div className="text-[13px] font-bold">
                  Quarter ended {h.period}
                  {h.filingDate ? <span className="font-normal" style={{ color: "var(--text-mute)" }}> · filed {h.filingDate}</span> : null}
                  <span className="font-normal" style={{ color: "var(--text-mute)" }}> · {h.totalChanges} changes</span>
                </div>
                <div className="mt-1.5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
                  {h.changes.slice(0, 12).map((c, i) => (
                    <div key={i} className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[12.5px]" style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}>
                      <span
                        className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded"
                        style={{
                          background: c.kind === "new" || c.kind === "added" ? "rgba(16,185,129,0.15)" : "rgba(239,68,68,0.15)",
                          color: c.kind === "new" || c.kind === "added" ? "#10B981" : "#EF4444",
                        }}
                      >
                        {c.kind}
                      </span>
                      <span className="font-mono font-bold">{c.ticker ?? "—"}</span>
                      <span className="truncate flex-1" style={{ color: "var(--text-mute)" }}>
                        {c.name}
                      </span>
                      <span className="tabular whitespace-nowrap">
                        {c.kind === "closed" ? fmtMoneyShort(c.prevValue) : fmtMoneyShort(c.value)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <ComplianceFooter
        methodology="/methodology#top-insiders"
        extra={<>Holdings are as reported on SEC Form 13F-HR and reflect positions at quarter-end, disclosed up to 45 days later. </>}
      />
    </div>
  );
}
