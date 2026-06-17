"use client";
import { use, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowDown, ArrowUp, Building2, FileText } from "lucide-react";
import {
  API_BASE,
  CompanyDetail,
  fetcher,
  formatCurrency,
  formatNumber,
} from "@/lib/api";
import { AdSlot } from "@/components/AdSlot";
import { CompanyLogo } from "@/components/CompanyLogo";
import { PoliticianAvatar } from "@/components/PoliticianAvatar";
import { RightRailArticles } from "@/components/article/RightRailArticles";
import { RightRailStockLists } from "@/components/article/RightRailStockLists";
import { Indicators } from "@/components/Indicators";
import { IqsTooltip } from "@/components/IqsTooltip";
import { AiInsightsStrip } from "@/components/insights/AiInsightsStrip";
import { IqsTrendChart } from "@/components/IqsTrendChart";

interface CongressTrade {
  id: string;
  politicianName: string;
  chamber: "House" | "Senate";
  party: string | null;
  ticker: string;
  companyName: string;
  action: "Buy" | "Sell";
  amountMin: number | null;
  amountMax: number | null;
  transactionDate: string;
  reportedDate: string | null;
  photoUrl?: string | null;
}

type Tab = "all" | "insiders" | "congress";

export default function CompanyPage({
  params,
}: {
  params: Promise<{ ticker: string }>;
}) {
  const { ticker } = use(params);
  const { data, isLoading } = useSWR<CompanyDetail & { congressionalTrades?: CongressTrade[] }>(
    `${API_BASE}/companies/${encodeURIComponent(ticker)}`,
    fetcher,
    { revalidateOnFocus: false },
  );
  const [tab, setTab] = useState<Tab>("all");

  return (
    <div className="max-w-7xl mx-auto">
      <Link
        href="/stock-lists"
        className="inline-flex items-center gap-1.5 text-xs text-mute hover:text-accent transition mb-5"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        All stock lists
      </Link>

      {isLoading || !data ? (
        <div className="card p-12 h-64 animate-pulse" />
      ) : !data.company ? (
        <div className="card p-12 text-center text-mute">Company not found.</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-6 lg:gap-10">
          <main className="space-y-6 min-w-0">
            {/* Hero: logo + ticker + name + price + change */}
            <header className="card p-6">
              <div className="flex flex-col sm:flex-row sm:items-center gap-5">
                <div className="flex items-center gap-4">
                  <CompanyLogo
                    ticker={data.company.ticker}
                    name={data.company.name}
                    size={56}
                  />
                  <div>
                    <div className="text-mute text-[11px] uppercase tracking-wider font-mono font-bold">
                      {data.company.ticker || data.company.cik}
                    </div>
                    <h1
                      className="text-[26px] sm:text-[32px] font-semibold tracking-tight leading-tight"
                      style={{ letterSpacing: "-0.5px" }}
                    >
                      {data.company.name}
                    </h1>
                    <div className="flex flex-wrap gap-3 mt-1.5 text-[12px] text-mute">
                      {data.company.sector && (
                        <span
                          className="px-2 py-0.5 rounded-full"
                          style={{
                            background: "var(--bg-3)",
                            border: "1px solid var(--border)",
                          }}
                        >
                          {data.company.sector}
                        </span>
                      )}
                      {data.company.marketCap !== null && (
                        <span>Mkt cap {formatCurrency(data.company.marketCap)}</span>
                      )}
                    </div>
                  </div>
                </div>
                {data.score && data.company.lastPrice !== null && (
                  <div className="sm:ml-auto text-right">
                    <div className="text-mute text-[11px] uppercase tracking-wider font-mono font-bold">
                      Last
                    </div>
                    <div className="text-[26px] font-semibold tabular tracking-tight mt-1">
                      ${data.company.lastPrice.toFixed(2)}
                    </div>
                    <div className="inline-flex items-center gap-1 text-[12px] mt-0.5">
                      <IqsTooltip>
                        <span className="font-mono font-bold text-accent underline decoration-dotted underline-offset-2">
                          IQS
                        </span>
                      </IqsTooltip>{" "}
                      <span className="font-bold tabular text-accent">
                        {Number(data.score.iqs).toFixed(1)}/100
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </header>

            {/* Section 1: Insider Trading Activity */}
            <section>
              <h2
                className="text-[22px] sm:text-[26px] font-semibold tracking-tight mb-2"
                style={{ letterSpacing: "-0.4px" }}
              >
                Insider Trading Activity (Form 4 Filings)
              </h2>
              <p className="text-[13px] sm:text-[14px] text-soft leading-relaxed max-w-4xl">
                An insider trade occurs when an individual that has non-public information
                about a company buys or sells shares of that company&rsquo;s stock. Examples
                of people who would be considered insiders include a company&rsquo;s
                executive officers (CEO, CFO, COO), its board of directors, and its major
                shareholders. Insiders are required to submit their trading activity to the
                Securities and Exchange Commission through Form 4 filings.
              </p>
            </section>

            {/* Filter bar (read-only / display) */}
            <div
              className="card p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-[12px]"
              style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}
            >
              <FilterDisplay label="Country" value="USA (NYSE & NASDAQ)" />
              <FilterDisplay label="Sector" value={data.company.sector || "All"} />
              <FilterDisplay label="Market Cap" value={data.company.marketCap ? formatCurrency(data.company.marketCap) : "—"} />
              <FilterDisplay
                label="IQS Score"
                value="Premium"
                premium
              />
              <FilterDisplay label="Transaction Size" value="$25,000+" />
              <FilterDisplay label="Reporting Date" value="Last 90 days" />
            </div>

            {/* Insider trading table */}
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="table-base">
                  <thead>
                    <tr>
                      <th>Insider</th>
                      <th>Action</th>
                      <th className="text-right">Shares</th>
                      <th className="text-right">Total</th>
                      <th className="text-right">Held After</th>
                      <th>Date</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {data.transactions.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="text-center text-mute py-10">
                          No Form 4 filings in the last 90 days.
                        </td>
                      </tr>
                    ) : (
                      data.transactions.slice(0, 50).map((t, i) => {
                        const isBuy = t.transactionCode === "P";
                        return (
                          <motion.tr
                            key={t.id}
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.18, delay: Math.min(i, 12) * 0.02 }}
                          >
                            <td>
                              <div className="text-[13px] font-bold">{t.insiderName}</div>
                              <div className="text-[11px] text-mute">{t.role || t.rawTitle}</div>
                            </td>
                            <td>
                              <span
                                className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider"
                                style={{
                                  background: isBuy
                                    ? "color-mix(in srgb, var(--good) 18%, transparent)"
                                    : "color-mix(in srgb, var(--bad) 18%, transparent)",
                                  color: isBuy ? "var(--good)" : "var(--bad)",
                                }}
                              >
                                {isBuy ? "Buy" : t.transactionCode === "S" ? "Sell" : t.transactionCode}
                              </span>
                            </td>
                            <td className="text-right tabular">
                              {formatNumber(Number(t.sharesBought))}
                            </td>
                            <td className="text-right tabular font-semibold">
                              {formatCurrency(Number(t.totalValue))}
                            </td>
                            <td className="text-right tabular text-mute">
                              {t.postHoldings != null
                                ? formatNumber(Number(t.postHoldings))
                                : "—"}
                            </td>
                            <td className="text-[12px] text-soft">
                              {formatShortDate(t.transactionDate)}
                            </td>
                            <td>
                              <a
                                href={t.filingUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center text-mute hover:text-accent"
                                aria-label="Open Form 4 filing"
                              >
                                <FileText className="h-4 w-4" />
                              </a>
                            </td>
                          </motion.tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* IQS trend over time — one point per scoring run */}
            {data.scoreHistory && data.scoreHistory.length > 1 && (
              <IqsTrendChart history={data.scoreHistory} />
            )}

            <AdSlot slot="leaderboard" seed={`stock-${ticker}`} />

            {/* Section 2: Insider AND Congressional Trades History */}
            <section>
              <h2
                className="text-[22px] sm:text-[26px] font-semibold tracking-tight mb-2"
                style={{ letterSpacing: "-0.4px" }}
              >
                {data.company.name} Insider and Congressional Trades History
              </h2>
              <p className="text-[13px] sm:text-[14px] text-mute mb-4 max-w-4xl">
                Combined view of corporate Form 4 filings and U.S. House/Senate
                disclosures referencing {data.company.ticker}.
              </p>

              {/* Tabs */}
              <div
                className="inline-flex p-1 rounded-lg mb-4"
                style={{ background: "var(--bg-3)", border: "1px solid var(--border)" }}
              >
                {[
                  { key: "all" as Tab, label: "All" },
                  { key: "insiders" as Tab, label: "Insiders" },
                  { key: "congress" as Tab, label: "Congress" },
                ].map((t) => (
                  <button
                    key={t.key}
                    onClick={() => setTab(t.key)}
                    className="px-4 py-1.5 rounded-md text-[12px] font-bold transition"
                    style={
                      tab === t.key
                        ? {
                            background:
                              "linear-gradient(135deg, var(--accent), var(--accent-2))",
                            color: "white",
                          }
                        : { color: "var(--text-mute)" }
                    }
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              <div className="card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="table-base">
                    <thead>
                      <tr>
                        <th>Source</th>
                        <th>Insider / Politician</th>
                        <th>Action</th>
                        <th className="text-right">Amount</th>
                        <th>Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(tab === "all" || tab === "insiders") &&
                        data.transactions.slice(0, 15).map((t) => {
                          const isBuy = t.transactionCode === "P";
                          return (
                            <tr key={`tx-${t.id}`}>
                              <td>
                                <span
                                  className="inline-flex items-center px-2 py-0.5 rounded text-[10px] uppercase tracking-wider font-bold"
                                  style={{
                                    background: "var(--accent-soft)",
                                    color: "var(--accent)",
                                  }}
                                >
                                  Form 4
                                </span>
                              </td>
                              <td>
                                <div className="text-[13px] font-bold">{t.insiderName}</div>
                                <div className="text-[11px] text-mute">{t.role}</div>
                              </td>
                              <td>
                                <span
                                  className="text-[11px] font-bold uppercase tracking-wider"
                                  style={{ color: isBuy ? "var(--good)" : "var(--bad)" }}
                                >
                                  {isBuy ? "Buy" : t.transactionCode === "S" ? "Sell" : t.transactionCode}
                                </span>
                              </td>
                              <td className="text-right tabular font-semibold">
                                {formatCurrency(Number(t.totalValue))}
                              </td>
                              <td className="text-[12px] text-soft">
                                {formatShortDate(t.transactionDate)}
                              </td>
                            </tr>
                          );
                        })}
                      {(tab === "all" || tab === "congress") &&
                        (data.congressionalTrades || []).map((c) => {
                          const isBuy = c.action === "Buy";
                          return (
                            <tr key={`c-${c.id}`}>
                              <td>
                                <span
                                  className="inline-flex items-center px-2 py-0.5 rounded text-[10px] uppercase tracking-wider font-bold"
                                  style={{
                                    background:
                                      "color-mix(in srgb, var(--accent-2) 18%, transparent)",
                                    color: "var(--accent-2)",
                                  }}
                                >
                                  Congress · {c.chamber}
                                </span>
                              </td>
                              <td>
                                <div className="flex items-center gap-2">
                                  <PoliticianAvatar
                                    name={c.politicianName}
                                    photoUrl={c.photoUrl}
                                    party={c.party}
                                    size={28}
                                  />
                                  <div className="min-w-0">
                                    <div className="text-[13px] font-bold truncate">
                                      {c.politicianName}
                                    </div>
                                    <div className="text-[10px] uppercase tracking-wider font-bold text-mute">
                                      {c.party}
                                    </div>
                                  </div>
                                </div>
                              </td>
                              <td>
                                <span
                                  className="text-[11px] font-bold uppercase tracking-wider"
                                  style={{ color: isBuy ? "var(--good)" : "var(--bad)" }}
                                >
                                  {c.action}
                                </span>
                              </td>
                              <td className="text-right tabular text-[13px] font-semibold">
                                {c.amountMin != null && c.amountMax != null
                                  ? `${formatCurrency(c.amountMin)} – ${formatCurrency(c.amountMax)}`
                                  : "—"}
                              </td>
                              <td className="text-[12px] text-soft">
                                {formatShortDate(c.transactionDate)}
                              </td>
                            </tr>
                          );
                        })}
                      {((tab === "insiders" && data.transactions.length === 0) ||
                        (tab === "congress" && (data.congressionalTrades || []).length === 0) ||
                        (tab === "all" &&
                          data.transactions.length === 0 &&
                          (data.congressionalTrades || []).length === 0)) && (
                        <tr>
                          <td colSpan={5} className="text-center text-mute py-10">
                            No trades recorded for this view.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>

            {/* Indicators chip strip showing why this stock is interesting */}
            <section
              className="rounded-lg p-5"
              style={{
                background: "var(--bg-2)",
                border: "1px solid var(--border)",
              }}
            >
              <h3 className="text-[14px] font-bold uppercase tracking-wider text-mute mb-3">
                Indicators
              </h3>
              <Indicators
                flags={{
                  insiderTrade: data.transactions.some(
                    (t) =>
                      t.transactionCode === "P" &&
                      Date.now() - new Date(t.transactionDate).getTime() <
                        5 * 86400000,
                  )
                    ? "buy"
                    : data.transactions.some(
                        (t) =>
                          t.transactionCode === "S" &&
                          Date.now() - new Date(t.transactionDate).getTime() <
                            5 * 86400000,
                      )
                    ? "sell"
                    : null,
                  positiveNews: !!data.score && data.score.iqs >= 50,
                  analystUpgrade: false,
                  earningsDueSoon: false,
                }}
                size="md"
              />
            </section>

            {/* AI-generated insider-buying coverage for this ticker */}
            <section>
              <AiInsightsStrip
                title="AI Insights"
                ticker={ticker}
                limit={3}
                hideIfEmpty
              />
            </section>
          </main>

          {/* Right rail */}
          <aside className="space-y-5">
            <AdSlot slot="rail-top" seed={`stock-${ticker}-rail`} />
            <RightRailArticles tag="insider-trades" />
            <RightRailStockLists />
            <AdSlot slot="rail-bottom" seed={`stock-${ticker}-rail-bottom`} />
          </aside>
        </div>
      )}
    </div>
  );
}

function FilterDisplay({
  label,
  value,
  premium,
}: {
  label: string;
  value: string;
  premium?: boolean;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider font-bold text-mute mb-1">
        {label}
      </div>
      <div
        className="px-3 py-1.5 rounded-md text-[12px] font-semibold truncate"
        style={{
          background: premium ? "var(--bg-3)" : "var(--bg-2)",
          border: `1px solid ${premium ? "color-mix(in srgb, var(--accent) 30%, var(--border))" : "var(--border-strong)"}`,
          color: premium ? "var(--accent)" : "var(--text)",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function formatShortDate(s: string | null | undefined): string {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return String(s);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
