"use client";
import useSWR from "swr";
import Link from "next/link";
import { Flame, ArrowUp, ArrowDown } from "lucide-react";
import {
  API_BASE,
  RankingsResponse,
  RankingRow,
  fetcher,
  formatCurrency,
} from "@/lib/api";
import { CompanyLogo } from "@/components/CompanyLogo";
import { TierBadge } from "@/components/TierBadge";
import { DataTable } from "@/components/DataTable";
import { rankColumn } from "@/components/tableColumns";
import { AdSlot } from "@/components/AdSlot";

export default function MoversPage() {
  const { data, isLoading } = useSWR<RankingsResponse>(
    `${API_BASE}/rankings?limit=40&live=1`,
    fetcher,
    { refreshInterval: 60_000, revalidateOnFocus: false },
  );
  const rows = data?.rows || [];

  return (
    <div className="w-full space-y-6">
      <header>
        <div className="flex items-center gap-2 text-mute text-sm mb-1">
          <Flame className="h-4 w-4 text-accent" />
          <span className="font-mono uppercase tracking-wider text-[11px]">Biggest Movers</span>
        </div>
        <h1 className="text-[28px] sm:text-[34px] font-bold tracking-tight">
          Biggest Insider Movers
        </h1>
        <p className="text-mute text-[14px] mt-2 max-w-3xl leading-relaxed">
          The stocks seeing the most open-market insider buying right now — ranked
          by total purchase value and the number of distinct insiders, alongside
          each name&rsquo;s live price move and IQS. Click any column header to
          re-sort (e.g. by distinct insiders or price change).
        </p>
      </header>

      <AdSlot slot="leaderboard" seed="movers-top" />

      {isLoading && rows.length === 0 ? (
        <div className="card p-10 text-center text-mute">Loading live insider activity…</div>
      ) : (
        <div className="card overflow-hidden">
          <DataTable<RankingRow>
            rows={rows}
            rowKey={(r) => r.ticker || r.companyId}
            initialSort={{ key: "marketCap", dir: "desc" }}
            empty="No insider activity yet."
            columns={[
              rankColumn<RankingRow>(),
              {
                key: "company",
                label: "Company",
                sortValue: (r) => r.ticker || r.name,
                render: (r) => (
                  <Link
                    href={r.ticker ? `/companies/${encodeURIComponent(r.ticker)}` : "#"}
                    className="flex items-center gap-2.5 min-w-[200px]"
                  >
                    <CompanyLogo ticker={r.ticker || ""} name={r.name} size={26} />
                    <div className="min-w-0">
                      <div className="font-mono text-[15px] font-bold text-accent">
                        {r.ticker || "—"}
                      </div>
                      <div className="text-[14px] font-medium truncate max-w-[200px]" style={{ color: "var(--text)" }}>
                        {r.name}
                      </div>
                    </div>
                  </Link>
                ),
              },
              {
                key: "price",
                label: "Price",
                align: "right",
                sortValue: (r) => r.livePrice ?? r.lastPrice ?? null,
                render: (r) => {
                  const px = r.livePrice ?? r.lastPrice;
                  const ch = r.changePct;
                  const up = (ch ?? 0) >= 0;
                  return (
                    <div className="tabular font-bold text-[14px]">
                      {px != null ? `$${Number(px).toFixed(2)}` : "—"}
                      {ch != null && (
                        <div
                          className="text-[11px] tabular"
                          style={{ color: up ? "var(--good)" : "var(--bad)" }}
                        >
                          <span className="inline-flex items-center gap-0.5">
                            {up ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                            {up ? "+" : ""}
                            {ch.toFixed(2)}%
                          </span>
                        </div>
                      )}
                    </div>
                  );
                },
              },
              {
                key: "marketCap",
                label: "Market Cap",
                filterable: true,
                filterType: "marketCapPreset",
                filterLabelText: "Market Cap",
                align: "right",
                sortValue: (r) => r.marketCap,
                render: (r) => (
                  <span className="tabular text-mute text-[14px] font-bold">
                    {r.marketCap ? formatCurrency(r.marketCap) : "—"}
                  </span>
                ),
              },
              {
                key: "bought",
                label: "Insider $ Bought",
                align: "right",
                sortValue: (r) => r.totalPurchaseValue,
                render: (r) => (
                  <span className="tabular font-bold text-[14px] text-good">
                    {formatCurrency(r.totalPurchaseValue)}
                  </span>
                ),
              },
              {
                key: "buyers",
                label: "Distinct Insiders",
                align: "right",
                sortValue: (r) => r.distinctBuyers,
                render: (r) => <span className="tabular text-[14px] font-bold">{r.distinctBuyers}</span>,
              },
              {
                key: "filings",
                label: "Form 4 Buys",
                align: "right",
                sortValue: (r) => r.transactionCount,
                render: (r) => (
                  <span className="tabular text-mute text-[14px] font-bold">{r.transactionCount}</span>
                ),
              },
              {
                key: "iqs",
                label: "IQS",
                align: "center",
                sortValue: (r) => r.iqs,
                render: (r) => <TierBadge iqs={r.iqs} size="sm" />,
              },
            ]}
          />
        </div>
      )}

      <p className="text-[11px] text-faint">
        Source: live SEC Form 4 open-market purchases + live price quotes.
        Informational only, not financial advice.
      </p>
    </div>
  );
}
