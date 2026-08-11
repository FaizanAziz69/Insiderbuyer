"use client";
import useSWR from "swr";
import Link from "next/link";
import { useState } from "react";
import { Landmark } from "lucide-react";
import { API_BASE, fetcher, formatCurrency } from "@/lib/api";
import { AdSlot } from "@/components/AdSlot";
import { DataTable, Column } from "@/components/DataTable";
import { CompanyLogo } from "@/components/CompanyLogo";
import { PriceTargetCell } from "@/components/PriceTargetCell";
import { rankColumn } from "@/components/tableColumns";
import { IqsScoreCell } from "@/components/IqsScoreCell";

/** One public federal contractor — trailing-12-month contract dollars from
 *  USAspending.gov, its top awarding agency, plus live analyst consensus and
 *  implied upside. Feeds the "Government & Big Contracts" list. */
interface GovRow {
  ticker: string;
  name: string;
  sector: string;
  ttmAmount: number;
  topAgency: string | null;
  hasData: boolean;
  price: number | null;
  marketCap: number | null;
  targetMean: number | null;
  upsidePct: number | null;
  recommendation: string | null;
  numAnalysts: number | null;
  iqs: number | null;
}

const REC: Record<string, { label: string; color: string; rank: number }> = {
  strong_buy: { label: "Strong Buy", color: "var(--good)", rank: 5 },
  buy: { label: "Buy", color: "var(--good)", rank: 4 },
  hold: { label: "Hold", color: "var(--gold)", rank: 3 },
  underperform: { label: "Underperform", color: "var(--bad)", rank: 2 },
  sell: { label: "Sell", color: "var(--bad)", rank: 1 },
  strong_sell: { label: "Strong Sell", color: "var(--bad)", rank: 0 },
};
const recOf = (k: string | null) => (k ? REC[k] : undefined);

/** Compact $ for large contract totals: $28.4B, $970M, $4.1M. */
function fmtBig(v: number | null): string {
  if (v == null || !Number.isFinite(v) || v <= 0) return "—";
  const a = Math.abs(v);
  if (a >= 1e9) return `$${(v / 1e9).toFixed(a >= 1e10 ? 1 : 2)}B`;
  if (a >= 1e6) return `$${(v / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M`;
  if (a >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${Math.round(v)}`;
}

export default function GovernmentContractsPage() {
  const [q, setQ] = useState("");
  const { data, isLoading } = useSWR<{ rows: GovRow[] }>(
    `${API_BASE}/gov-contracts`,
    fetcher,
    { refreshInterval: 30 * 60_000, revalidateOnFocus: false },
  );
  const rows = (data?.rows || []).filter(
    (r) =>
      !q ||
      r.ticker.toLowerCase().includes(q.toLowerCase()) ||
      (r.name || "").toLowerCase().includes(q.toLowerCase()) ||
      (r.sector || "").toLowerCase().includes(q.toLowerCase()) ||
      (r.topAgency || "").toLowerCase().includes(q.toLowerCase()),
  );

  const columns: Column<GovRow>[] = [
    rankColumn<GovRow>(),
    {
      key: "ticker",
      label: "Company",
      sortValue: (r) => r.ticker,
      render: (r) => (
        <Link href={`/companies/${r.ticker}`} className="flex items-center gap-2.5 group">
          <span
            className="flex-shrink-0 rounded-md overflow-hidden bg-white flex items-center justify-center"
            style={{ width: 30, height: 30, padding: 3, border: "1px solid var(--border)" }}
          >
            <CompanyLogo ticker={r.ticker} name={r.name} size={24} />
          </span>
          <span className="min-w-0">
            <span className="block font-bold text-[13.5px] leading-tight group-hover:text-accent" style={{ color: "var(--text)" }}>
              {r.ticker}
            </span>
            <span className="block text-[11.5px] text-mute leading-tight truncate max-w-[190px]">{r.name}</span>
          </span>
        </Link>
      ),
    },
    {
      key: "ttmAmount",
      label: "Gov Contracts (TTM)",
      align: "right",
      info: "Total obligated U.S. federal contract dollars awarded to this company over the trailing 12 months, from the official USAspending.gov award records. Ranked highest first.",
      sortValue: (r) => r.ttmAmount ?? 0,
      render: (r) => (
        <span
          className="tabular font-bold text-[14px]"
          style={{ color: r.ttmAmount > 0 ? "var(--good)" : "var(--text-mute)" }}
        >
          {fmtBig(r.ttmAmount)}
        </span>
      ),
    },
    {
      key: "iqs",
      label: "Insider Score",
      pro: true,
      align: "center",
      info: "Our 0–99 Insider Score for contractors that are also in our scored insider-buying universe. Blank when the company has no recent open-market insider buys.",
      sortValue: (r) => r.iqs ?? null,
      render: (r) => (r.iqs != null ? <IqsScoreCell iqs={r.iqs} /> : <span className="text-faint text-[12px]">—</span>),
    },
    {
      key: "topAgency",
      label: "Top Agency",
      sortValue: (r) => r.topAgency || "",
      render: (r) => (
        <span className="text-[12.5px] text-soft truncate inline-block max-w-[210px]" title={r.topAgency || ""}>
          {r.topAgency || "—"}
        </span>
      ),
    },
    {
      key: "recommendation",
      label: "Analyst Consensus",
      sortValue: (r) => recOf(r.recommendation)?.rank ?? -1,
      render: (r) => {
        const rec = recOf(r.recommendation);
        if (!rec) return <span className="text-faint text-[12px]">—</span>;
        return (
          <span
            className="inline-flex items-center text-[11.5px] font-bold px-2 py-0.5 rounded-full"
            style={{ background: `color-mix(in srgb, ${rec.color} 15%, transparent)`, color: rec.color }}
          >
            {rec.label}
          </span>
        );
      },
    },
    {
      key: "upside",
      label: "Price Target",
      align: "center",
      info: "Mean analyst price target and the implied upside/downside from the current price.",
      sortValue: (r) => r.upsidePct ?? -9999,
      render: (r) => <PriceTargetCell target={r.targetMean} upsidePct={r.upsidePct} />,
    },
    {
      key: "marketCap",
      label: "Market Cap",
      align: "right",
      sortValue: (r) => r.marketCap ?? 0,
      render: (r) => (
        <span className="tabular text-[13px] text-mute font-semibold">{formatCurrency(r.marketCap)}</span>
      ),
    },
    {
      key: "sector",
      label: "Sector",
      filterable: true,
      sortValue: (r) => r.sector || "",
      render: (r) => <span className="text-[12.5px] text-mute">{r.sector || "—"}</span>,
    },
  ];

  return (
    <div className="w-full space-y-6">
      <header>
        <div className="flex items-center gap-2 text-mute text-sm mb-1">
          <Landmark className="h-4 w-4" />
          <span className="font-mono uppercase tracking-wider text-[11px]">Government & Big Contracts</span>
        </div>
        <h1
          className="text-[32px] sm:text-[40px] font-semibold tracking-tight"
          style={{ letterSpacing: "-0.6px" }}
        >
          Government & Big Contract Stocks
        </h1>
        <p className="text-mute text-[14px] sm:text-[15px] mt-3 max-w-4xl leading-relaxed">
          Public companies winning the largest U.S. federal contracts — ranked by
          their trailing-12-month contract dollars from the official{" "}
          <a href="https://www.usaspending.gov" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
            USAspending.gov
          </a>{" "}
          award records, with each company&rsquo;s top awarding agency, analyst
          consensus and implied upside. Informational, not investment advice.
        </p>
      </header>

      <AdSlot slot="leaderboard" seed="gov-contracts" />

      <div
        className="card p-4"
        style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}
      >
        <label className="block text-[11px] uppercase tracking-wider font-bold text-mute mb-1">
          Search
        </label>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ticker, company, agency or sector…"
          className="w-full sm:max-w-xs px-3 py-2 rounded-md text-[13px]"
          style={{
            background: "var(--bg-1)",
            border: "1px solid var(--border-strong)",
            color: "var(--text)",
          }}
        />
      </div>

      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="text-center text-mute py-10">Loading federal contract data…</div>
        ) : (
          <DataTable<GovRow>
            rows={rows}
            rowKey={(r) => r.ticker}
            initialSort={{ key: "ttmAmount", dir: "desc" }}
            empty="No contractors match your search."
            columns={columns}
            gate={{
              label: "Government Contracts",
              bullets: [
                "All contractors ranked by federal contract dollars",
                "Live USAspending.gov TTM totals + top agency",
                "Analyst consensus and implied upside per name",
                "Insider Scores where insiders are buying",
              ],
            }}
          />
        )}
      </div>

      <p className="text-[12px] text-mute leading-relaxed">
        Contract totals are the sum of obligated federal award dollars matched to
        each company over the trailing twelve months, sourced from USAspending.gov
        and refreshed daily. Amounts reflect federal awards only (large commercial
        contracts aren&rsquo;t included in the dollar total). Analyst consensus,
        price targets and quotes are live. Informational, not investment advice.
      </p>
    </div>
  );
}
