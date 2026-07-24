"use client";
import { use, useMemo, useState, useRef, useEffect } from "react";
import useSWR from "swr";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowDown,
  ArrowUp,
  FileText,
  Calendar,
  ExternalLink,
} from "lucide-react";
import {
  API_BASE,
  CompanyDetail,
  fetcher,
  formatCurrency,
  formatDate,
  formatNumber,
} from "@/lib/api";
import { AdSlot } from "@/components/AdSlot";
import { CompanyLogo } from "@/components/CompanyLogo";
import {
  AnalystRatingSection,
  StockFAQSection,
} from "@/components/stock/StockResearch";
import { PoliticianAvatar } from "@/components/PoliticianAvatar";
import { RightRailArticles } from "@/components/article/RightRailArticles";
import { RightRailStockLists } from "@/components/article/RightRailStockLists";
import { IqsTooltip } from "@/components/IqsTooltip";
import { TierBadge, tierFor } from "@/components/TierBadge";
import { WatchlistButton } from "@/components/WatchlistButton";
import { IqsTrendChart } from "@/components/IqsTrendChart";
import { ScorePillarsCard } from "@/components/ScorePillarsCard";
import { ConversationsSection } from "@/components/stock/ConversationsSection";
import { StockCivicGrid } from "@/components/stock/StockCivicGrid";
import { track } from "@/lib/analytics";

// ── Local types for endpoints not modelled in lib/api.ts ──────────────────
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

interface StockStats {
  symbol: string;
  name: string | null;
  currency: string;
  price: number | null;
  change: number | null;
  changePct: number | null;
  marketCap: number | null;
  revenue: number | null;
  netIncome: number | null;
  eps: number | null;
  sharesOut: number | null;
  peRatio: number | null;
  forwardPE: number | null;
  dividendRate: number | null;
  dividendYield: number | null;
  exDividendDate: string | null;
  volume: number | null;
  open: number | null;
  previousClose: number | null;
  dayLow: number | null;
  dayHigh: number | null;
  week52Low: number | null;
  week52High: number | null;
  beta: number | null;
  analystRating: string | null;
  priceTarget: number | null;
  priceTargetUpsidePct: number | null;
  earningsDate: string | null;
}

interface Profile {
  symbol: string;
  name: string;
  exchange: string | null;
  sector: string | null;
  industry: string | null;
  employees: number | null;
  website: string | null;
  phone: string | null;
  description: string | null;
  address: string | null;
  country: string | null;
  officers: { name: string | null; title: string | null; pay: number | null }[];
}

interface Bar {
  date: string;
  close: number;
  t?: number; // ms epoch (for intraday time labels)
}

const CHART_RANGES: { key: string; label: string }[] = [
  { key: "1d", label: "1D" },
  { key: "5d", label: "5D" },
  { key: "1mo", label: "1M" },
  { key: "3mo", label: "3M" },
  { key: "6mo", label: "6M" },
  { key: "1y", label: "1Y" },
  { key: "5y", label: "5Y" },
];

interface NewsItem {
  slug: string;
  title: string;
  summary: string;
  eyebrow: string | null;
  generatedAt: string;
}

const RATING_LABEL: Record<string, string> = {
  strong_buy: "Strong Buy",
  buy: "Buy",
  hold: "Hold",
  underperform: "Underperform",
  sell: "Sell",
};

type ProfileTab = "overview" | "financials" | "conversations";

export default function CompanyPage({
  params,
}: {
  params: Promise<{ ticker: string }>;
}) {
  const { ticker } = use(params);
  const sym = ticker.toUpperCase();
  const [tab, setTab] = useState<ProfileTab>("overview");

  const { data, isLoading } = useSWR<
    CompanyDetail & { congressionalTrades?: CongressTrade[] }
  >(`${API_BASE}/companies/${encodeURIComponent(ticker)}`, fetcher, {
    revalidateOnFocus: false,
  });
  const { data: statsData } = useSWR<{ stats: StockStats | null }>(
    `${API_BASE}/market-stats/stats?symbol=${encodeURIComponent(ticker)}`,
    fetcher,
    { revalidateOnFocus: false, refreshInterval: 60_000 },
  );
  const { data: profileData } = useSWR<{ profile: Profile | null }>(
    `${API_BASE}/market-stats/profile?symbol=${encodeURIComponent(ticker)}`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 10 * 60_000 },
  );

  const stats = statsData?.stats ?? null;
  const profile = profileData?.profile ?? null;
  const earningsDate = stats?.earningsDate ?? null;

  // §6.5 — company page view
  useEffect(() => {
    track("web_company_view", { ticker: sym });
  }, [sym]);

  return (
    <div className="w-full">
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
            <CompanyHeader
              company={data.company}
              score={data.score}
              stats={stats}
              profile={profile}
              earningsDate={earningsDate}
              chart={<PriceChart ticker={sym} bare />}
            />

            {/* ── Tabs (StockAnalysis / TipRanks-style): clean Overview by
                default; Financials focuses on the analyst forecast view. ── */}
            <div
              className="flex items-center gap-1 rounded-lg p-1 w-fit"
              style={{ background: "var(--bg-3)", border: "1px solid var(--border)" }}
              role="tablist"
              aria-label="Stock profile sections"
            >
              {(
                [
                  ["overview", "Overview"],
                  ["financials", "Financials & Forecast"],
                  ["conversations", "Conversations"],
                ] as [ProfileTab, string][]
              ).map(([key, label]) => (
                <button
                  key={key}
                  role="tab"
                  aria-selected={tab === key}
                  onClick={() => setTab(key)}
                  className="px-4 py-1.5 rounded-md text-[13px] font-bold transition"
                  style={{
                    background: tab === key ? "var(--bg-2)" : "transparent",
                    color: tab === key ? "var(--accent)" : "var(--text-mute)",
                    boxShadow: tab === key ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            {tab === "financials" ? (
              /* ── Financials & Forecast: forecast chart, consensus buy meter,
                    and analyst coverage — nothing else. ── */
              <div className="space-y-6">
                <AnalystRatingSection ticker={sym} price={stats?.price ?? data.company.lastPrice} />
                <AnalystCoverageCard ticker={sym} />
              </div>
            ) : tab === "conversations" ? (
              /* ── Conversations: community posts mentioning this ticker ── */
              <ConversationsSection ticker={sym} />
            ) : (
              <>
            {/* Price performance row — 1D / 5D / 1M / 6M / 1Y (TradingView-style).
                The chart itself now lives inside the header card above. */}
            <PricePerformanceRow ticker={sym} />

            {/* Key data — the 3-column overview (trading ranges | market cap &
                financials | other data). */}
            <StockOverviewGrid
              ticker={sym}
              stats={stats}
              profile={profile}
              fallbackMarketCap={data.company.marketCap}
              fallbackPrice={data.company.lastPrice}
              earningsDate={earningsDate}
            />

            {/* QuiverQuant-style uniform card grid — Congress Trading,
                Government Contracts, Insider Trading (quarterly), Lobbying. */}
            <StockCivicGrid
              ticker={sym}
              companyName={data.company.name}
              sector={profile?.sector || data.company.sector}
              insiderScore={data.score ? Number(data.score.iqs) : null}
            />

            {/* About — directly under the key data (client spec). */}
            {profile?.description && (
              <section className="card p-5">
                <h2 className="text-[16px] font-semibold mb-2">
                  About {data.company.name}
                </h2>
                <p className="text-[14px] text-soft leading-relaxed">
                  {profile.description}
                </p>
                <div className="flex flex-wrap gap-x-6 gap-y-1 mt-3 text-[13px] text-mute">
                  {(profile.sector || data.company.sector) && (
                    <span>
                      Sector: <span className="font-bold text-[var(--text)]">{profile.sector || data.company.sector}</span>
                    </span>
                  )}
                  {profile.industry && (
                    <span>
                      Industry: <span className="font-bold text-[var(--text)]">{profile.industry}</span>
                    </span>
                  )}
                  {profile.employees != null && (
                    <span>
                      Employees: <span className="font-bold text-[var(--text)]">{formatNumber(profile.employees)}</span>
                    </span>
                  )}
                  {profile.country && (
                    <span>
                      Country: <span className="font-bold text-[var(--text)]">{profile.country}</span>
                    </span>
                  )}
                  {profile.website && (
                    <a
                      href={profile.website}
                      target="_blank"
                      rel="noreferrer"
                      className="text-accent hover:underline inline-flex items-center gap-1"
                    >
                      {profile.website.replace(/^https?:\/\//, "")}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </section>
            )}


            {/* ── Overview ───────────────────────────────────────────── */}
            <div className="space-y-6">
                {data.score && <SmartScorePanel score={data.score} />}

                {/* Composite pillars — insider + analyst + news sentiment */}
                <ScorePillarsCard ticker={sym} />

                {/* Recent insider-buy summary */}
                <InsiderSummary transactions={data.transactions} />

                {/* Insider Score trend over time */}
                {data.scoreHistory && data.scoreHistory.length > 1 && (
                  <IqsTrendChart history={data.scoreHistory} />
                )}

                <AdSlot slot="leaderboard" seed={`stock-${ticker}`} />
              </div>

            {/* ── Insider Trades (live Form 4 table) ──────────────────── */}
            <div className="space-y-4">
                <section>
                  <h2
                    className="text-[20px] sm:text-[24px] font-semibold tracking-tight mb-2"
                    style={{ letterSpacing: "-0.4px" }}
                  >
                    Insider Trading Activity (Form 4 Filings)
                  </h2>
                  <p className="text-[13px] sm:text-[14px] text-soft leading-relaxed max-w-4xl">
                    An insider trade occurs when an individual that has non-public
                    information about a company buys or sells shares of that
                    company&rsquo;s stock. Examples of insiders include a
                    company&rsquo;s executive officers (CEO, CFO, COO), its board of
                    directors, and its major shareholders. Insiders are required to
                    submit their trading activity to the SEC through Form 4 filings.
                  </p>
                </section>

                <div className="card overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="table-base">
                      <thead>
                        <tr>
                          <th>Insider</th>
                          <th>Action</th>
                          <th className="text-right">Shares</th>
                          <th className="text-right">Avg Cost</th>
                          <th className="text-right">Total</th>
                          <th className="text-right">&Delta; Holdings</th>
                          <th className="text-right">Held After</th>
                          <th>Date</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {data.transactions.length === 0 ? (
                          <tr>
                            <td colSpan={9} className="text-center text-mute py-10">
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
                                transition={{
                                  duration: 0.18,
                                  delay: Math.min(i, 12) * 0.02,
                                }}
                              >
                                <td>
                                  <Link href={`/insiders/${encodeURIComponent(t.insiderName)}`}
                                    className="text-[15px] font-bold hover:text-accent transition">
                                    {t.insiderName}
                                  </Link>
                                  <div className="text-[12px] text-mute">
                                    {t.role || t.rawTitle}
                                  </div>
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
                                    {isBuy
                                      ? "Buy"
                                      : t.transactionCode === "S"
                                        ? "Sell"
                                        : t.transactionCode}
                                  </span>
                                </td>
                                <td className="text-right tabular text-[14px] font-bold">
                                  {formatNumber(Number(t.sharesBought))}
                                </td>
                                <td className="text-right tabular text-[14px] font-bold text-soft">
                                  {Number(t.pricePerShare) > 0
                                    ? `$${Number(t.pricePerShare).toFixed(2)}`
                                    : "—"}
                                </td>
                                <td className="text-right tabular font-bold text-[14px]">
                                  {formatCurrency(Number(t.totalValue))}
                                </td>
                                <td className="text-right tabular text-[13.5px] font-bold">
                                  {(() => {
                                    const prev = Number(t.previousHoldings) || 0;
                                    const sh = Number(t.sharesBought) || 0;
                                    if (sh <= 0) return <span className="text-faint">—</span>;
                                    if (prev <= 0) {
                                      // First reported position — an infinite % is meaningless.
                                      return isBuy ? (
                                        <span
                                          className="inline-flex items-center gap-0.5"
                                          style={{ color: "var(--good)" }}
                                        >
                                          <ArrowUp className="h-3.5 w-3.5" /> New
                                        </span>
                                      ) : (
                                        <span className="text-faint">—</span>
                                      );
                                    }
                                    const pct = (sh / prev) * 100;
                                    const label = `${pct >= 100 ? Math.round(pct) : pct.toFixed(1)}%`;
                                    return isBuy ? (
                                      <span
                                        className="inline-flex items-center gap-0.5"
                                        style={{ color: "var(--good)" }}
                                      >
                                        <ArrowUp className="h-3.5 w-3.5" /> {label}
                                      </span>
                                    ) : (
                                      <span
                                        className="inline-flex items-center gap-0.5"
                                        style={{ color: "var(--bad)" }}
                                      >
                                        <ArrowDown className="h-3.5 w-3.5" /> {label}
                                      </span>
                                    );
                                  })()}
                                </td>
                                <td className="text-right tabular text-mute text-[14px] font-bold">
                                  {t.postHoldings != null
                                    ? formatNumber(Number(t.postHoldings))
                                    : "—"}
                                </td>
                                <td className="text-[14px] font-bold tabular text-soft">
                                  {formatShortDate(t.transactionDate)}
                                </td>
                                <td>
                                  <a
                                    href={t.filingUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={() => track("web_form4_filing_click", { ticker: sym })}
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
              </div>

            {/* ── Congressional Trades ────────────────────────────────── */}
            <div className="space-y-4">
                <section>
                  <h2
                    className="text-[20px] sm:text-[24px] font-semibold tracking-tight mb-2"
                    style={{ letterSpacing: "-0.4px" }}
                  >
                    Congressional Trades
                  </h2>
                  <p className="text-[13px] sm:text-[14px] text-mute max-w-4xl">
                    U.S. House and Senate disclosures referencing {sym}, reported
                    under the STOCK Act.
                  </p>
                </section>

                <div className="card overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="table-base">
                      <thead>
                        <tr>
                          <th>Politician</th>
                          <th>Chamber</th>
                          <th>Action</th>
                          <th className="text-right">Amount</th>
                          <th>Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(data.congressionalTrades || []).length === 0 ? (
                          <tr>
                            <td colSpan={5} className="text-center text-mute py-10">
                              No congressional trades recorded for {sym}.
                            </td>
                          </tr>
                        ) : (
                          (data.congressionalTrades || []).map((c) => {
                            const isBuy = c.action === "Buy";
                            return (
                              <tr key={`c-${c.id}`}>
                                <td>
                                  <div className="flex items-center gap-2">
                                    <PoliticianAvatar
                                      name={c.politicianName}
                                      photoUrl={c.photoUrl}
                                      party={c.party}
                                      size={28}
                                    />
                                    <div className="min-w-0">
                                      <Link href={`/politicians/${encodeURIComponent(c.politicianName)}`}
                                        className="block text-[15px] font-bold truncate hover:text-accent transition">
                                        {c.politicianName}
                                      </Link>
                                      <div className="text-[10px] uppercase tracking-wider font-bold text-mute">
                                        {c.party}
                                      </div>
                                    </div>
                                  </div>
                                </td>
                                <td className="text-[13px] text-soft">{c.chamber}</td>
                                <td>
                                  <span
                                    className="text-[11px] font-bold uppercase tracking-wider"
                                    style={{
                                      color: isBuy ? "var(--good)" : "var(--bad)",
                                    }}
                                  >
                                    {c.action}
                                  </span>
                                </td>
                                <td className="text-right tabular text-[14px] font-bold">
                                  {c.amountMin != null && c.amountMax != null
                                    ? `${formatCurrency(c.amountMin)} – ${formatCurrency(c.amountMax)}`
                                    : "—"}
                                </td>
                                <td className="text-[14px] font-bold tabular text-soft">
                                  {formatShortDate(c.transactionDate)}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

            {/* ── Company News & Press Releases ───────────────────────── */}
            <section>
              <h2
                className="text-[20px] sm:text-[24px] font-semibold tracking-tight mb-3"
                style={{ letterSpacing: "-0.4px" }}
              >
                Company News &amp; Press Releases
              </h2>
              <RecentNews ticker={sym} />
            </section>

            {/* ── FAQ (auto-generated from this company's data) ────────── */}
            <StockFAQSection
              ticker={sym}
              name={data.company.name}
              stats={stats}
              profile={profile}
              marketCap={data.company.marketCap}
            />
              </>
            )}

            {/* Disclaimer */}
            <div
              className="rounded-lg p-4 text-[12px] text-mute leading-relaxed"
              style={{
                background: "var(--bg-2)",
                border: "1px solid var(--border)",
              }}
            >
              <span className="font-bold">Disclaimer</span> — Informational only —
              not investment advice. Insider transaction data is sourced from SEC
              Form 4 filings; market data from public feeds and may be delayed. The
              Insider Score is a proprietary score for research purposes and does not predict
              future performance. Always do your own research.
            </div>
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

// ── Header ─────────────────────────────────────────────────────────────────
function CompanyHeader({
  company,
  score,
  stats,
  profile,
  earningsDate,
  chart,
}: {
  company: CompanyDetail["company"];
  score: CompanyDetail["score"];
  stats: StockStats | null;
  profile: Profile | null;
  earningsDate: string | null;
  chart?: React.ReactNode;
}) {
  const price = stats?.price ?? company.lastPrice;
  const change = stats?.change ?? null;
  const changePct = stats?.changePct ?? null;
  const up = (changePct ?? 0) >= 0;
  const exchange = profile?.exchange;
  const tickerLabel = company.ticker
    ? exchange
      ? `${exchange}: ${company.ticker}`
      : company.ticker
    : company.cik;

  return (
    <header className="card p-6">
      <div className="flex flex-col sm:flex-row sm:items-start gap-5">
        <div className="flex items-center gap-4 min-w-0">
          <CompanyLogo
            ticker={company.ticker}
            name={company.name}
            size={56}
          />
          <div className="min-w-0">
            <div className="text-mute text-[11px] uppercase tracking-wider font-mono font-bold">
              {tickerLabel}
            </div>
            <h1
              className="text-[24px] sm:text-[30px] font-semibold tracking-tight leading-tight"
              style={{ letterSpacing: "-0.5px" }}
            >
              {company.name}
            </h1>
            <div className="flex flex-wrap gap-2 mt-2 text-[12px] text-mute">
              {(profile?.sector || company.sector) && (
                <Chip>{profile?.sector || company.sector}</Chip>
              )}
              {profile?.industry && <Chip>{profile.industry}</Chip>}
              {earningsDate && (
                <Chip>
                  <Calendar className="h-3 w-3" />
                  Next earnings: {formatDate(earningsDate)}
                </Chip>
              )}
            </div>
            {company.ticker && (
              <div className="mt-3">
                <WatchlistButton ticker={company.ticker} variant="button" />
              </div>
            )}
          </div>
        </div>

        <div className="sm:ml-auto flex items-start gap-6">
          {price != null && (
            <div className="text-right">
              <div className="text-mute text-[11px] uppercase tracking-wider font-mono font-bold">
                Last
              </div>
              <div className="text-[26px] font-semibold tabular tracking-tight mt-1">
                ${price.toFixed(2)}
              </div>
              {change != null && changePct != null && (
                <div
                  className="inline-flex items-center gap-1 text-[13px] font-bold tabular mt-0.5"
                  style={{ color: up ? "var(--good)" : "var(--bad)" }}
                >
                  {up ? (
                    <ArrowUp className="h-3.5 w-3.5" />
                  ) : (
                    <ArrowDown className="h-3.5 w-3.5" />
                  )}
                  {up ? "+" : ""}
                  {change.toFixed(2)} ({up ? "+" : ""}
                  {changePct.toFixed(2)}%)
                </div>
              )}
            </div>
          )}

          {score && (
            <div
              className="rounded-lg px-4 py-3 text-center"
              style={{
                background: "var(--bg-3)",
                border: "1px solid var(--border)",
              }}
            >
              <IqsTooltip>
                <div className="text-[10px] uppercase tracking-wider font-bold text-accent underline decoration-dotted underline-offset-2 cursor-help">
                  Insider Score
                </div>
              </IqsTooltip>
              <div className="text-[26px] font-bold tabular text-accent leading-none mt-1">
                {Number(score.iqs).toFixed(0)}
                <span className="text-[13px] text-mute font-semibold">/100</span>
              </div>
              <div className="mt-1.5 flex justify-center">
                <TierBadge iqs={score.iqs} size="sm" />
              </div>
              {/* <Link
                href="/methodology"
                className="block mt-1.5 text-[10px] font-semibold text-mute hover:text-accent transition"
              >
                How the score works →
              </Link> */}
            </div>
          )}
        </div>
      </div>

      {/* Price chart — merged into the header card so it reads as one box. */}
      {chart && (
        <div className="mt-5 pt-5" style={{ borderTop: "1px solid var(--border)" }}>
          {chart}
        </div>
      )}
    </header>
  );
}

// ── Price performance row (TradingView-style: 1D / 5D / 1M / 6M / 1Y) ─────────
interface PeriodReturns {
  d1: number | null;
  d7: number | null;
  d30: number | null;
  d180: number | null;
  y1: number | null;
}
const PERF_PERIODS: [string, keyof PeriodReturns][] = [
  ["1 Day", "d1"],
  ["5 Days", "d7"],
  ["1 Month", "d30"],
  ["6 Months", "d180"],
  ["1 Year", "y1"],
];
function PricePerformanceRow({ ticker }: { ticker: string }) {
  const { data } = useSWR<{ returns: Record<string, PeriodReturns> }>(
    `${API_BASE}/market-stats/performance?symbols=${encodeURIComponent(ticker)}`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 5 * 60_000 },
  );
  const r = data?.returns?.[ticker.toUpperCase()];
  if (!r) return <div className="card p-4 h-[68px] shimmer rounded-lg" />;
  return (
    <div className="card px-5 py-3">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-y-3 gap-x-4 divide-x divide-[var(--border)]">
        {PERF_PERIODS.map(([label, key], i) => {
          const v = r[key];
          const up = (v ?? 0) >= 0;
          return (
            <div key={key} className={i === 0 ? "pl-0 text-center sm:text-left sm:pl-0" : "text-center"}>
              <div className="text-[11px] uppercase tracking-wider text-mute font-bold">
                {label}
              </div>
              <div
                className="text-[16px] font-bold tabular mt-0.5"
                style={{ color: v == null ? "var(--text-mute)" : up ? "var(--good)" : "var(--bad)" }}
              >
                {v == null ? "—" : `${up ? "+" : ""}${v.toFixed(2)}%`}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full"
      style={{ background: "var(--bg-3)", border: "1px solid var(--border)" }}
    >
      {children}
    </span>
  );
}

// ── Interactive price chart (timeframe tabs + crosshair, TipRanks-style) ─────
function PriceChart({ ticker, bare = false }: { ticker: string; bare?: boolean }) {
  const [range, setRange] = useState<string>("1d");
  const [hover, setHover] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const { data, isLoading } = useSWR<{
    history: { bars: Bar[]; intraday?: boolean } | null;
  }>(
    `${API_BASE}/market-stats/history?symbol=${encodeURIComponent(ticker)}&range=${range}`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60_000 },
  );
  const bars = useMemo(() => data?.history?.bars || [], [data]);
  const intraday = !!data?.history?.intraday || range === "1d" || range === "5d";

  const W = 1000;
  const H = 200;
  const geo = useMemo(() => {
    if (bars.length < 2) return null;
    const closes = bars.map((b) => b.close);
    const min = Math.min(...closes);
    const max = Math.max(...closes);
    const rng = max - min || 1;
    const pts = closes.map((c, i) => ({
      x: (i / (closes.length - 1)) * W,
      y: H - ((c - min) / rng) * H,
    }));
    return {
      pts,
      min,
      max,
      d: "M " + pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" L "),
      area:
        "M " +
        pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" L ") +
        ` L ${W},${H} L 0,${H} Z`,
    };
  }, [bars]);

  const first = bars[0]?.close ?? 0;
  const last = bars[bars.length - 1]?.close ?? 0;
  const chgPct = first ? ((last - first) / first) * 100 : 0;
  const up = last >= first;
  const stroke = up ? "var(--good)" : "var(--bad)";

  const fmtLabel = (b: Bar) => {
    const d = new Date(b.t ?? b.date);
    return intraday
      ? d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
      : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  };

  const onMove = (e: React.MouseEvent) => {
    const el = wrapRef.current;
    if (!el || bars.length < 2) return;
    const rect = el.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    setHover(Math.round(frac * (bars.length - 1)));
  };

  const hb = hover != null ? bars[hover] : null;
  const hp = hover != null && geo ? geo.pts[hover] : null;

  return (
    <div className={bare ? "" : "card p-5"}>
      {/* Header: price + timeframe tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex items-baseline gap-3">
          <span className="text-[22px] font-bold tabular">${last.toFixed(2)}</span>
          <span
            className="text-[14px] font-bold tabular"
            style={{ color: up ? "var(--good)" : "var(--bad)" }}
          >
            {chgPct >= 0 ? "▲ +" : "▼ "}
            {chgPct.toFixed(2)}%
          </span>
        </div>
        <div className="flex items-center gap-1">
          {CHART_RANGES.map((r) => {
            const on = r.key === range;
            return (
              <button
                key={r.key}
                onClick={() => {
                  setRange(r.key);
                  setHover(null);
                  track("web_chart_timeframe_change", { ticker, range: r.key });
                }}
                className="px-2.5 py-1 rounded-md text-[12px] font-bold transition"
                style={{
                  background: on ? "var(--accent)" : "transparent",
                  color: on ? "var(--on-accent)" : "var(--text-mute)",
                }}
              >
                {r.label}
              </button>
            );
          })}
        </div>
      </div>

      {isLoading && !geo ? (
        <div className="h-[200px] shimmer rounded-lg" />
      ) : !geo ? (
        <div className="h-[200px] flex items-center justify-center text-mute text-sm">
          No price history available.
        </div>
      ) : (
        <div
          ref={wrapRef}
          className="relative"
          style={{ height: H }}
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
        >
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-full">
            <defs>
              <linearGradient id="cp-area" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={stroke} stopOpacity="0.22" />
                <stop offset="100%" stopColor={stroke} stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={geo.area} fill="url(#cp-area)" />
            <path d={geo.d} fill="none" stroke={stroke} strokeWidth="2" vectorEffect="non-scaling-stroke" />
            {hp && (
              <line
                x1={hp.x}
                y1={0}
                x2={hp.x}
                y2={H}
                stroke="var(--text-mute)"
                strokeWidth="1"
                strokeDasharray="4 3"
                vectorEffect="non-scaling-stroke"
              />
            )}
          </svg>

          {/* Crosshair dot (HTML, so it isn't stretched by the SVG) */}
          {hp && hover != null && (
            <div
              className="absolute h-2.5 w-2.5 rounded-full pointer-events-none"
              style={{
                left: `${(hover / (bars.length - 1)) * 100}%`,
                top: `${(hp.y / H) * 100}%`,
                transform: "translate(-50%, -50%)",
                background: stroke,
                boxShadow: "0 0 0 3px var(--bg-2)",
              }}
            />
          )}

          {/* Tooltip */}
          {hb && hover != null && (
            <div
              className="absolute pointer-events-none rounded-md px-2.5 py-1.5 text-[12px] shadow-lg"
              style={{
                left: `${(hover / (bars.length - 1)) * 100}%`,
                top: 4,
                transform:
                  hover / (bars.length - 1) > 0.5
                    ? "translateX(calc(-100% - 10px))"
                    : "translateX(10px)",
                background: "var(--bg-1)",
                border: "1px solid var(--border-strong)",
                whiteSpace: "nowrap",
              }}
            >
              <div className="font-bold tabular">${hb.close.toFixed(2)}</div>
              <div className="text-mute">{fmtLabel(hb)}</div>
            </div>
          )}
        </div>
      )}

      {/* Axis footer */}
      {geo && bars.length > 1 && (
        <div className="flex justify-between text-[11px] text-mute mt-2 tabular">
          <span>{fmtLabel(bars[0])}</span>
          <span>
            Hi ${geo.max.toFixed(2)} · Lo ${geo.min.toFixed(2)}
          </span>
          <span>{fmtLabel(bars[bars.length - 1])}</span>
        </div>
      )}
    </div>
  );
}

// ── Standard 3-column overview (trading | financials | other) ────────────────
// Same layout for every stock (missing values show "—"), matching the
// industry-standard stock-profile summary (StockAnalysis / TipRanks).
interface FinStatement {
  income: Record<string, number | string | null>[];
  balance: Record<string, number | string | null>[];
  cashflow: Record<string, number | string | null>[];
}
function StockOverviewGrid({
  ticker,
  stats,
  profile,
  fallbackMarketCap,
  fallbackPrice,
  earningsDate,
}: {
  ticker: string;
  stats: StockStats | null;
  profile: Profile | null;
  fallbackMarketCap: number | null;
  fallbackPrice: number | null;
  earningsDate: string | null;
}) {
  // Shared with FinancialsSection — SWR dedupes the identical key so this is free.
  const { data: finData } = useSWR<{ financials: FinStatement }>(
    `${API_BASE}/market-stats/financials?symbol=${encodeURIComponent(ticker)}`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 10 * 60_000 },
  );

  const dec = (n: number | null | undefined, dp = 2) =>
    n === null || n === undefined || Number.isNaN(n) ? "—" : Number(n).toFixed(dp);
  const usd = (n: number | null | undefined) =>
    n === null || n === undefined || Number.isNaN(n) ? "—" : `$${Number(n).toFixed(2)}`;
  const cur = (n: number | null | undefined) =>
    n === null || n === undefined ? "—" : formatCurrency(n);
  const num = (n: number | null | undefined) =>
    n === null || n === undefined ? "—" : formatNumber(n);
  const range = (a: number | null | undefined, b: number | null | undefined) =>
    a == null || b == null ? "—" : `${dec(a)} – ${dec(b)}`;

  const marketCap = stats?.marketCap ?? fallbackMarketCap;

  // Latest annual statement values for derived ratios.
  const fin = finData?.financials;
  const last = <T,>(arr: T[] | undefined): T | undefined => (arr && arr.length ? arr[arr.length - 1] : undefined);
  const inc = last(fin?.income);
  const n = (r: Record<string, number | string | null> | undefined, k: string): number | null =>
    r && typeof r[k] === "number" ? (r[k] as number) : null;

  const revenue = stats?.revenue ?? n(inc, "revenue");
  const netIncome = stats?.netIncome ?? n(inc, "netIncome");

  const trading: [string, string][] = [
    ["Price", usd(stats?.price ?? fallbackPrice)],
    ["Day Range", range(stats?.dayLow, stats?.dayHigh)],
    ["52-Week Range", range(stats?.week52Low, stats?.week52High)],
    ["Open", usd(stats?.open)],
    ["Previous Close", usd(stats?.previousClose)],
    ["Volume", num(stats?.volume)],
  ];
  const financials: [string, string][] = [
    ["Market Cap", cur(marketCap)],
    ["P/E Ratio", dec(stats?.peRatio)],
    ["Forward P/E", dec(stats?.forwardPE)],
    ["EPS (ttm)", dec(stats?.eps)],
    ["Revenue (ttm)", cur(revenue)],
    ["Net Income (ttm)", cur(netIncome)],
    ["Shares Out", num(stats?.sharesOut)],
  ];
  const other: [string, string][] = [
    ["Beta", dec(stats?.beta)],
    ["Dividend Yield", stats?.dividendYield != null ? `${dec(stats.dividendYield)}%` : "—"],
    ["Dividend Rate", usd(stats?.dividendRate)],
    ["Ex-Dividend", stats?.exDividendDate ? formatShortDate(stats.exDividendDate) : "—"],
    ["Earnings Date", earningsDate ? formatShortDate(earningsDate) : "—"],
    [
      "Analyst Rating",
      stats?.analystRating ? RATING_LABEL[stats.analystRating] || stats.analystRating : "—",
    ],
    [
      "Price Target",
      stats?.priceTarget != null
        ? `$${Number(stats.priceTarget).toFixed(2)}${
            stats.priceTargetUpsidePct != null
              ? ` (${stats.priceTargetUpsidePct >= 0 ? "+" : ""}${Number(stats.priceTargetUpsidePct).toFixed(1)}%)`
              : ""
          }`
        : "—",
    ],
    ["Industry", profile?.industry || "—"],
    ["Employees", profile?.employees != null ? num(profile.employees) : "—"],
  ];

  const Col = ({ title, rows }: { title: string; rows: [string, string][] }) => (
    <div>
      <div
        className="text-[11px] font-bold uppercase tracking-wider text-mute mb-2 pb-1 inline-block"
        style={{ borderBottom: "2px solid var(--accent)" }}
      >
        {title}
      </div>
      <dl>
        {rows.map(([l, v]) => (
          <div
            key={l}
            className="flex items-center justify-between py-1.5 text-[13px]"
            style={{ borderBottom: "1px solid var(--border)" }}
          >
            <dt className="text-mute">{l}</dt>
            <dd className="font-bold tabular text-right">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );

  return (
    <div className="card p-5">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-x-8 gap-y-5">
        <Col title="Trading" rows={trading} />
        <Col title="Market Cap & Financials" rows={financials} />
        <Col title="Other Data" rows={other} />
      </div>
    </div>
  );
}

// ── Insider Score panel (gauge + factor breakdown) ──────────────
const SCORE_FACTORS: {
  key: keyof NonNullable<CompanyDetail["score"]>;
  label: string;
  desc: string;
}[] = [
  { key: "insiderWeight", label: "Insider Activity", desc: "Open-market Form 4 buying" },
  { key: "transactionWeight", label: "Transaction Size", desc: "Purchase $ vs. market cap" },
  { key: "convictionWeight", label: "Insider Conviction", desc: "Stake increase by buyers" },
  { key: "clusterWeight", label: "Buyer Cluster", desc: "Multiple insiders buying together" },
  { key: "historicalSuccessWeight", label: "Track Record", desc: "Past insider-buy performance" },
  { key: "marketTimingWeight", label: "Market Timing", desc: "Timing vs. recent price trend" },
];

function factorRating(pct: number): { label: string; color: string } {
  if (pct >= 60) return { label: "Strong", color: "var(--good)" };
  if (pct >= 30)
    return { label: "Positive", color: "color-mix(in srgb, var(--good) 65%, var(--warn))" };
  // Neutral still gets a visible amber bar (not an invisible grey sliver).
  return { label: "Neutral", color: "var(--gold)" };
}

function ringColorForTier(iqs: number): string {
  const tier = tierFor(iqs);
  if (tier === "Bullish") return "var(--good)";
  if (tier === "Neutral") return "var(--gold)";
  return "var(--bad)";
}

function SmartScorePanel({ score }: { score: NonNullable<CompanyDetail["score"]> }) {
  const iqs = Math.round(Number(score.iqs) || 0);
  const ring = ringColorForTier(iqs);
  const R = 52;
  const C = 2 * Math.PI * R;
  const off = C * (1 - Math.max(0, Math.min(100, iqs)) / 100);
  const weights = SCORE_FACTORS.map((f) => Math.max(0, Number(score[f.key]) || 0));
  const maxW = Math.max(...weights, 0.0001);
  return (
    <section className="card p-5">
      <h2 className="text-[16px] font-semibold">Insider Score</h2>
      <p className="text-[12px] text-mute mb-4">
        Our 0&ndash;100 Insider Score and the signals behind it.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-6 items-center">
        {/* Circular gauge */}
        <div
          className="relative flex items-center justify-center mx-auto sm:mx-0"
          style={{ width: 132, height: 132 }}
        >
          <svg width={132} height={132}>
            <circle cx={66} cy={66} r={R} fill="none" stroke="var(--bg-3)" strokeWidth={11} />
            <circle
              cx={66}
              cy={66}
              r={R}
              fill="none"
              stroke={ring}
              strokeWidth={11}
              strokeLinecap="round"
              strokeDasharray={C}
              strokeDashoffset={off}
              transform="rotate(-90 66 66)"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span
              className="text-[34px] font-extrabold tabular leading-none"
              style={{ color: ring }}
            >
              {iqs}
            </span>
            <span className="text-[10px] text-mute mb-1">/ 100</span>
            <TierBadge iqs={iqs} size="sm" />
          </div>
        </div>
        {/* Factor breakdown bars */}
        <div className="space-y-2.5 w-full">
          {SCORE_FACTORS.map((f, i) => {
            const pct = Math.min(100, (weights[i] / maxW) * 100);
            const rt = factorRating(pct);
            return (
              <div key={f.key} className="flex items-center gap-3">
                <div className="w-32 sm:w-40 shrink-0">
                  <div
                    className="text-[12.5px] font-semibold leading-tight"
                    style={{ color: "var(--text)" }}
                  >
                    {f.label}
                  </div>
                  <div className="text-[10.5px] text-mute leading-tight">{f.desc}</div>
                </div>
                <div
                  className="flex-1 h-2 rounded-full overflow-hidden"
                  style={{ background: "var(--bg-3)" }}
                >
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${Math.max(8, pct)}%`, background: rt.color }}
                  />
                </div>
                <span
                  className="w-16 text-right text-[11px] font-bold"
                  style={{ color: rt.color }}
                >
                  {rt.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}


// ── Insider buy summary (overview) ───────────────────────────────────────────
function InsiderSummary({
  transactions,
}: {
  transactions: CompanyDetail["transactions"];
}) {
  const buys = transactions.filter((t) => t.transactionCode === "P");
  const sells = transactions.filter((t) => t.transactionCode === "S");
  const buyValue = buys.reduce((a, t) => a + Number(t.totalValue || 0), 0);
  const distinctBuyers = new Set(buys.map((t) => t.insiderName)).size;

  if (transactions.length === 0) {
    return (
      <section className="card p-5">
        <h2 className="text-[16px] font-semibold mb-1">Recent Insider Activity</h2>
        <p className="text-[13px] text-mute">
          No Form 4 filings in the last 90 days.
        </p>
      </section>
    );
  }

  return (
    <section className="card p-5">
      <h2 className="text-[16px] font-semibold mb-3">Recent Insider Activity</h2>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Stat label="Buys" value={formatNumber(buys.length)} good />
        <Stat label="Sells" value={formatNumber(sells.length)} />
        <Stat label="Buy Value" value={formatCurrency(buyValue)} good />
        <Stat label="Distinct Buyers" value={formatNumber(distinctBuyers)} />
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  good,
}: {
  label: string;
  value: string;
  good?: boolean;
}) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-mute font-bold">
        {label}
      </div>
      <div
        className="text-[18px] font-bold tabular"
        style={good ? { color: "var(--good)" } : undefined}
      >
        {value}
      </div>
    </div>
  );
}

// ── News ─────────────────────────────────────────────────────────────────────
function RecentNews({
  ticker,
  compact = false,
}: {
  ticker: string;
  compact?: boolean;
}) {
  const { data, isLoading } = useSWR<{ items: NewsItem[] }>(
    `${API_BASE}/content/by-ticker/${encodeURIComponent(ticker)}?limit=${compact ? 3 : 12}`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 10 * 60_000 },
  );
  const items = data?.items || [];

  if (isLoading) return <div className="card p-5 h-40 shimmer rounded-lg" />;
  if (items.length === 0) {
    if (compact) return null;
    return (
      <div className="card p-8 text-center text-mute text-sm">
        No news available for {ticker}.
      </div>
    );
  }

  return (
    <section>
      <h2 className="text-[16px] font-semibold mb-3">
        {compact ? "Latest News" : `${ticker} News & Analysis`}
      </h2>
      <div className="card divide-y" style={{ borderColor: "var(--border)" }}>
        {items.map((it) => (
          <Link
            key={it.slug}
            href={`/insights/${it.slug}`}
            className="flex gap-3 p-4 hover:bg-[var(--bg-3)] transition"
            style={{ borderColor: "var(--border)" }}
          >
            {/* Small thumbnail on the left (company logo) */}
            <span
              className="flex-shrink-0 rounded-md overflow-hidden bg-white flex items-center justify-center"
              style={{ width: 52, height: 52, padding: 4, border: "1px solid var(--border)" }}
            >
              <CompanyLogo ticker={ticker} name={ticker} size={44} />
            </span>
            <span className="min-w-0 flex-1">
              {it.eyebrow && (
                <span className="block text-[10px] uppercase tracking-wider font-bold text-accent mb-1">
                  {it.eyebrow}
                </span>
              )}
              <span className="block text-[15px] font-semibold leading-snug">{it.title}</span>
              {it.summary && (
                <span className="block text-[13px] text-mute mt-1 line-clamp-2">{it.summary}</span>
              )}
              <span className="block text-[11px] text-faint mt-1.5 tabular">
                {formatDate(it.generatedAt)}
              </span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

// ── Analyst coverage (Financials tab) — who covers the stock ────────────────
interface CoverageRow {
  symbol: string;
  recommendation: string | null;
  numAnalysts: number | null;
  targetMean: number | null;
  targetHigh: number | null;
  targetLow: number | null;
  upsidePct: number | null;
}
function AnalystCoverageCard({ ticker }: { ticker: string }) {
  const { data } = useSWR<{ rows: CoverageRow[] }>(
    `${API_BASE}/market-stats/analyst-ratings?symbols=${encodeURIComponent(ticker)}`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 10 * 60_000 },
  );
  const row = data?.rows?.find((r) => r.symbol.toUpperCase() === ticker.toUpperCase()) ?? null;
  if (!row) return null;
  const items: [string, string][] = [
    ["Covering analysts", row.numAnalysts != null ? String(row.numAnalysts) : "—"],
    [
      "Consensus",
      row.recommendation ? RATING_LABEL[row.recommendation] || row.recommendation : "—",
    ],
    ["Average target", row.targetMean != null ? `$${row.targetMean.toFixed(2)}` : "—"],
    ["Highest target", row.targetHigh != null ? `$${row.targetHigh.toFixed(2)}` : "—"],
    ["Lowest target", row.targetLow != null ? `$${row.targetLow.toFixed(2)}` : "—"],
    [
      "Implied upside",
      row.upsidePct != null ? `${row.upsidePct >= 0 ? "+" : ""}${row.upsidePct.toFixed(1)}%` : "—",
    ],
  ];
  return (
    <section className="card p-5">
      <h2 className="text-[16px] font-semibold mb-1">Analyst Coverage</h2>
      <p className="text-[12px] text-mute mb-4">
        Aggregated sell-side coverage for {ticker} — consensus, targets, and the
        number of covering firms. Individual analyst-by-analyst breakdowns are
        rolling out.
      </p>
      <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-8 gap-y-3">
        {items.map(([l, v]) => (
          <div key={l}>
            <dt className="text-[11px] uppercase tracking-wider text-mute font-bold">{l}</dt>
            <dd className="text-[16px] font-bold tabular mt-0.5">{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

// ── Hooks / helpers ──────────────────────────────────────────────────────────
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
