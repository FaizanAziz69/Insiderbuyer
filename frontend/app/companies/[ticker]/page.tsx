"use client";
import { use, useMemo, useState, useRef, useEffect } from "react";
import useSWR from "swr";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  Copy,
  FileText,
  Calendar,
  ExternalLink,
  Maximize2,
  Plus,
  Star,
} from "lucide-react";
import { useWatchlist } from "@/lib/watchlist";
import {
  API_BASE,
  CompanyDetail,
  fetcher,
  formatCurrency,
  formatDate,
  formatNumber,
} from "@/lib/api";
import { computeInsiderFlow } from "@/lib/insiderFlow";
import { AdSlot } from "@/components/AdSlot";
import { PaywallOverlay } from "@/components/PaywallOverlay";
import { InsiderBuySellMeter } from "@/components/stock/InsiderBuySellMeter";
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
import { PriceChart } from "@/components/PriceChart";
import { ScorePillarsCard } from "@/components/ScorePillarsCard";
import { ConversationsSection } from "@/components/stock/ConversationsSection";
import { CongressTradingCard, WhaleActivityCard, RevenueBreakdownCard, BullBearCard } from "@/components/stock/StockCivicGrid";
import {
  StrategyBanner, InsiderNetSharesCard, LobbyingStackedCard, ContractsStackedCard,
  PatentsCard, CnbcCard, EtfHoldersCard, ScoreCardQQ, AboutQQ,
  FinancialsTab, ForecastTab, InsidersIntro, InstitutionsTab, CompensationTab,
  GovernmentTab, OwnershipTab,
} from "@/components/stock/QQTabs";
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

type ProfileTab =
  | "overview" | "financials" | "forecast" | "insiders" | "institutions"
  | "compensation" | "government" | "ownership" | "news";
const TAB_KEYS: ProfileTab[] = ["overview", "financials", "forecast", "insiders", "institutions", "compensation", "government", "ownership", "news"];

export default function CompanyPage({
  params,
}: {
  params: Promise<{ ticker: string }>;
}) {
  const { ticker } = use(params);
  const sym = ticker.toUpperCase();
  const [tab, setTabState] = useState<ProfileTab>("overview");
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("tab") as ProfileTab | null;
    if (q && TAB_KEYS.includes(q)) setTabState(q);
  }, []);
  const setTab = (t: ProfileTab) => {
    setTabState(t);
    const url = new URL(window.location.href);
    if (t === "overview") url.searchParams.delete("tab");
    else url.searchParams.set("tab", t);
    window.history.replaceState(null, "", url.toString());
  };

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
        <div className="space-y-6">
          {/* Header + price chart run the FULL page width; everything else
              keeps the two-column layout with the side rail. */}
          <CompanyHeader
            company={data.company}
            score={data.score}
            stats={stats}
            profile={profile}
            earningsDate={earningsDate}
          />

          {/* Half-and-half: key-data card on the left, price chart on the right,
              both spanning the full page width above the two-column region. */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch [&>*]:min-w-0 [&_.card]:h-full">
            <StockOverviewGrid
              ticker={sym}
              stats={stats}
              profile={profile}
              fallbackMarketCap={data.company.marketCap}
              fallbackPrice={data.company.lastPrice}
              earningsDate={earningsDate}
            />
            <div className="card p-4">
              <PriceChart ticker={sym} bare />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-6 lg:gap-10">
            <main className="space-y-6 min-w-0">

            {/* About — reference-style full-width block */}
            <AboutQQ
              ticker={sym}
              name={data.company.name}
              description={profile?.description ?? null}
              address={(profile as { address?: string | null } | null)?.address ?? null}
              marketCap={stats?.marketCap ?? data.company.marketCap ?? null}
              employees={profile?.employees ?? null}
              industry={profile?.industry ?? null}
            />

            {/* "What are insiders doing?" — buy/sell balance meter, right under About. */}
            <InsiderBuySellMeter transactions={data.transactions} />

            {/* ── 9-tab nav (reference layout) ── */}
            <div className="w-full" style={{ borderBottom: "1px solid var(--border)" }}>
              <div className="flex items-center gap-1 overflow-x-auto scrollbar-none pb-2" role="tablist" aria-label="Stock profile sections">
                {(
                  [
                    ["overview", "Overview"],
                    ["financials", "Financials"],
                    ["forecast", "Forecast"],
                    ["insiders", "Insiders"],
                    ["institutions", "Institutions"],
                    ["compensation", "Compensation"],
                    ["government", "Government"],
                    ["ownership", "Ownership"],
                    ["news", "News"],
                  ] as [ProfileTab, string][]
                ).map(([key, label]) => (
                  <button
                    key={key}
                    role="tab"
                    aria-selected={tab === key}
                    onClick={() => setTab(key)}
                    className="px-4 py-2 rounded-lg text-[13.5px] font-bold whitespace-nowrap transition"
                    style={{
                      background: tab === key ? "var(--bg-2)" : "transparent",
                      color: tab === key ? "var(--text)" : "var(--text-mute)",
                      boxShadow: tab === key ? "0 1px 5px rgba(0,0,0,0.10)" : "none",
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Everything below the tab nav is gated. The nav itself stays live
                so visitors can see what each section holds. */}
            <PaywallOverlay
              subtitle={`Unlock the full ${sym} breakdown — financials, forecasts, insiders, institutions and more`}
            >
            {tab === "financials" ? (
              <FinancialsTab sym={sym} />
            ) : tab === "forecast" ? (
              <ForecastTab
                sym={sym}
                coverage={
                  <div className="space-y-6">
                    <AnalystRatingSection ticker={sym} price={stats?.price ?? data.company.lastPrice} />
                    <AnalystCoverageCard ticker={sym} />
                  </div>
                }
              />
            ) : tab === "insiders" ? (
              <div className="space-y-6">
                <InsidersIntro sym={sym} transactions={data.transactions as never} />
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

                {/* Scored-window strip — the EXACT numbers behind this stock's
                    row in the rankings table (same stored score row), so the
                    table and the profile can never disagree. The full filing
                    history below is a different, clearly-labeled thing. */}
                {data.score && (
                  <div
                    className="rounded-lg px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-1"
                    style={{ background: "var(--accent-soft)", border: "1px solid var(--border)" }}
                  >
                    <span className="text-[11px] uppercase tracking-wider font-bold text-accent">
                      Scored window · last 90 days
                    </span>
                    <span className="text-[13px] tabular">
                      <strong>{Number(data.score.transactionCount)}</strong> qualifying buy
                      {Number(data.score.transactionCount) === 1 ? "" : "s"}
                    </span>
                    <span className="text-[13px] tabular">
                      <strong>{Number(data.score.distinctBuyers)}</strong> insider
                      {Number(data.score.distinctBuyers) === 1 ? "" : "s"}
                    </span>
                    <span className="text-[13px] tabular">
                      <strong>{formatCurrency(Number(data.score.totalPurchaseValue))}</strong> bought
                    </span>
                    <span className="text-[12px] text-mute">
                      — these are the numbers in the rankings table; the full history below shows
                      every filing (buys, sells and older activity).
                    </span>
                  </div>
                )}

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
                              No Form 4 filings on record for this company.
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
                                  {t.priceSuspect ? (
                                    <span className="text-faint" title="Filer-reported dollar figure looks erroneous — excluded from totals">
                                      —
                                    </span>
                                  ) : (
                                    formatCurrency(Number(t.totalValue))
                                  )}
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

              </div>
            ) : tab === "institutions" ? (
              <InstitutionsTab sym={sym} name={data.company.name} />
            ) : tab === "compensation" ? (
              <CompensationTab sym={sym} name={data.company.name} />
            ) : tab === "government" ? (
              <div className="space-y-6">
                <GovernmentTab sym={sym} name={data.company.name} />
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

              </div>
            ) : tab === "ownership" ? (
              <OwnershipTab sym={sym} name={data.company.name} />
            ) : tab === "news" ? (
              <div className="space-y-6">
            {/* ── Company News & Press Releases ───────────────────────── */}
            <section>
              <h2
                className="text-[20px] sm:text-[24px] font-semibold tracking-tight mb-3"
                style={{ letterSpacing: "-0.4px" }}
              >
                Company News &amp; Press Releases
              </h2>
              <RecentNews ticker={sym} name={data.company.name} />
            </section>
                <ConversationsSection ticker={sym} />
              </div>
            ) : (
              <>
            {/* Price performance row — 1D / 5D / 1M / 6M / 1Y (TradingView-style).
                The chart itself now lives inside the header card above. */}
            <PricePerformanceRow ticker={sym} />

            {/* Featured-in strip (our own datasets; no external links) */}
            <StrategyBanner
              ticker={sym}
              hasScore={!!data.score}
              hasCongress={(data.congressionalTrades || []).length > 0}
            />

            {/* Reference-layout 2-column card grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
              <CongressTradingCard ticker={sym} />
              <WhaleActivityCard ticker={sym} companyName={data.company.name} />
              <InsiderNetSharesCard ticker={sym} transactions={data.transactions as never} />
              <LobbyingStackedCard ticker={sym} companyName={data.company.name} />
              <RevenueBreakdownCard ticker={sym} />
              <PatentsCard ticker={sym} companyName={data.company.name} />
              <ContractsStackedCard ticker={sym} companyName={data.company.name} />
              <CnbcCard ticker={sym} />
              <EtfHoldersCard ticker={sym} />
              <ScoreCardQQ
                ticker={sym}
                iqs={data.score ? Number(data.score.iqs) : null}
                dataCompleteness={
                  data.score && (data.score as any).dataCompleteness != null
                    ? Number((data.score as any).dataCompleteness)
                    : null
                }
              />
              <BullBearCard
                ticker={sym}
                companyName={data.company.name}
                sector={profile?.sector || data.company.sector}
                insiderScore={data.score ? Number(data.score.iqs) : null}
              />
            </div>




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
            </PaywallOverlay>

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
      {/* stockanalysis.com-style header (client reference): "Name (TICKER)"
          with action buttons on the right, subtitle line, then a large price
          with inline change and a timestamped market-state line. */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="min-w-0">
          <h1
            className="text-[24px] sm:text-[28px] font-bold tracking-tight leading-tight"
            style={{ letterSpacing: "-0.4px" }}
          >
            {company.name} ({company.ticker || company.cik})
          </h1>
          <div className="text-mute text-[13px] font-medium mt-1">
            {tickerLabel} · Real-Time Price · USD
          </div>
        </div>

        {company.ticker && (
          <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
            <HeaderActionBtn
              href={`/chart/${encodeURIComponent(company.ticker)}`}
              icon={<Maximize2 className="h-4 w-4" />}
            >
              Full Chart
            </HeaderActionBtn>
            <HeaderWatchlistBtn ticker={company.ticker} />
            <HeaderActionBtn
              href={`/compare?s=${encodeURIComponent(company.ticker)}`}
              icon={<Copy className="h-4 w-4" />}
            >
              Compare
            </HeaderActionBtn>
          </div>
        )}
      </div>

      {price != null && (
        <div className="mt-4">
          <div className="flex items-baseline gap-3 flex-wrap">
            <span className="text-[36px] sm:text-[40px] font-bold tabular tracking-tight leading-none">
              {price.toFixed(2)}
            </span>
            {change != null && changePct != null && (
              <span
                className="text-[18px] font-semibold tabular"
                style={{ color: up ? "var(--good)" : "var(--bad)" }}
              >
                {up ? "+" : ""}
                {change.toFixed(2)} ({up ? "+" : ""}
                {changePct.toFixed(2)}%)
              </span>
            )}
          </div>
          <MarketStateLine />
        </div>
      )}

      {/* Price chart — merged into the header card so it reads as one box. */}
      {chart && (
        <div id="price-chart" className="mt-5 pt-5" style={{ borderTop: "1px solid var(--border)" }}>
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
  // Quarterly statements — 9 periods, so TTM (q0–q3) can be compared with the
  // prior TTM (q4–q7) for real year-over-year growth.
  const { data: stmt } = useSWR<{
    income: { date: string; values: Record<string, number | null> }[];
  }>(
    `${API_BASE}/market-stats/statements?symbol=${encodeURIComponent(ticker)}`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 30 * 60_000 },
  );
  // 1-year price return — the honest proxy for market-cap growth.
  const { data: perf } = useSWR<{ returns: Record<string, PeriodReturns> }>(
    `${API_BASE}/market-stats/performance?symbols=${encodeURIComponent(ticker)}`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 5 * 60_000 },
  );

  const dec = (n: number | null | undefined, dp = 2) =>
    n === null || n === undefined || Number.isNaN(n) ? "—" : Number(n).toFixed(dp);
  const usd = (n: number | null | undefined) =>
    n === null || n === undefined || Number.isNaN(n) ? "—" : `$${Number(n).toFixed(2)}`;
  const cur = (n: number | null | undefined) =>
    n === null || n === undefined ? "—" : formatCurrency(n);
  const num = (n: number | null | undefined) =>
    n === null || n === undefined ? "—" : formatNumber(n);
  const range = (lo: number | null | undefined, hi: number | null | undefined) =>
    lo == null || hi == null ? "—" : `${Number(lo).toFixed(2)} - ${Number(hi).toFixed(2)}`;

  /** Sum a metric over `n` quarters starting at `from`; null if any is missing. */
  const ttm = (key: string, from: number, n = 4): number | null => {
    const rows = stmt?.income || [];
    if (rows.length < from + n) return null;
    let total = 0;
    for (let i = from; i < from + n; i++) {
      const v = rows[i]?.values?.[key];
      if (v == null) return null;
      total += Number(v);
    }
    return total;
  };
  const growth = (key: string): number | null => {
    const nowV = ttm(key, 0);
    const prevV = ttm(key, 4);
    if (nowV == null || prevV == null || prevV === 0) return null;
    return ((nowV - prevV) / Math.abs(prevV)) * 100;
  };

  const revenueTtm = ttm("TotalRevenue", 0) ?? stats?.revenue ?? null;
  const netIncomeTtm = ttm("NetIncome", 0) ?? stats?.netIncome ?? null;
  const epsTtm = ttm("BasicEPS", 0) ?? stats?.eps ?? null;
  const marketCap = stats?.marketCap ?? fallbackMarketCap;

  const gRevenue = growth("TotalRevenue");
  const gNetIncome = growth("NetIncome");
  const gEps = growth("BasicEPS");
  const gMarketCap = perf?.returns?.[ticker.toUpperCase()]?.y1 ?? null;

  /** A row value with an optional green/red growth figure beside it. */
  const Val = ({ v, g }: { v: string; g?: number | null }) => (
    <span className="inline-flex items-baseline gap-1.5 justify-end">
      <span className="font-bold tabular">{v}</span>
      {g != null && Number.isFinite(g) && (
        <span
          className="font-bold tabular text-[13.5px]"
          style={{ color: g >= 0 ? "var(--good)" : "var(--bad)" }}
        >
          {g >= 0 ? "+" : ""}
          {g.toFixed(1)}%
        </span>
      )}
    </span>
  );

  type Row = { label: string; value: React.ReactNode };

  const left: Row[] = [
    { label: "Market Cap", value: <Val v={cur(marketCap)} g={gMarketCap} /> },
    { label: "Revenue (ttm)", value: <Val v={cur(revenueTtm)} g={gRevenue} /> },
    { label: "Net Income (ttm)", value: <Val v={cur(netIncomeTtm)} g={gNetIncome} /> },
    { label: "EPS (ttm)", value: <Val v={dec(epsTtm)} g={gEps} /> },
    { label: "Shares Out", value: <Val v={num(stats?.sharesOut)} /> },
    { label: "PE Ratio", value: <Val v={dec(stats?.peRatio)} /> },
    { label: "Forward PE", value: <Val v={dec(stats?.forwardPE)} /> },
    {
      label: "Dividend",
      value: (
        <Val
          v={
            stats?.dividendRate != null
              ? `${usd(stats.dividendRate)}${
                  stats.dividendYield != null ? ` (${dec(stats.dividendYield)}%)` : ""
                }`
              : "—"
          }
        />
      ),
    },
    {
      label: "Ex-Dividend Date",
      value: <Val v={stats?.exDividendDate ? formatShortDate(stats.exDividendDate) : "—"} />,
    },
  ];

  const right: Row[] = [
    { label: "Volume", value: <Val v={num(stats?.volume)} /> },
    { label: "Open", value: <Val v={dec(stats?.open)} /> },
    { label: "Previous Close", value: <Val v={dec(stats?.previousClose)} /> },
    { label: "Day's Range", value: <Val v={range(stats?.dayLow, stats?.dayHigh)} /> },
    { label: "52-Week Range", value: <Val v={range(stats?.week52Low, stats?.week52High)} /> },
    { label: "Beta", value: <Val v={dec(stats?.beta)} /> },
    {
      label: "Analysts",
      value: (
        <Val
          v={stats?.analystRating ? RATING_LABEL[stats.analystRating] || stats.analystRating : "—"}
        />
      ),
    },
    {
      label: "Price Target",
      value: (
        <Val
          v={
            stats?.priceTarget != null
              ? `${Number(stats.priceTarget).toFixed(2)}${
                  stats.priceTargetUpsidePct != null
                    ? ` (${stats.priceTargetUpsidePct >= 0 ? "+" : ""}${Number(
                        stats.priceTargetUpsidePct,
                      ).toFixed(2)}%)`
                    : ""
                }`
              : "—"
          }
        />
      ),
    },
    { label: "Earnings Date", value: <Val v={earningsDate ? formatShortDate(earningsDate) : "—"} /> },
  ];

  const Col = ({ rows }: { rows: Row[] }) => (
    <dl>
      {rows.map((r) => (
        <div
          key={r.label}
          className="flex items-center justify-between gap-3 py-3 text-[15.5px]"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <dt className="whitespace-nowrap" style={{ color: "var(--text-soft)" }}>
            {r.label}
          </dt>
          <dd className="text-right whitespace-nowrap">{r.value}</dd>
        </div>
      ))}
    </dl>
  );

  return (
    <div className="card p-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
        <Col rows={left} />
        <Col rows={right} />
      </div>
    </div>
  );
}

const SCORE_FACTORS: {
  key: keyof NonNullable<CompanyDetail["score"]>;
  label: string;
  desc: string;
}[] = [
  { key: "insiderWeight", label: "Insider Activity", desc: "Open-market Form 4 buying" },
  { key: "transactionWeight", label: "Transaction Size", desc: "Purchase $ vs. market cap" },
  { key: "convictionWeight", label: "Insider Ownership", desc: "Stake increase by buyers" },
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
  // Same helper the buy/sell meter uses, so these figures reconcile with it.
  const flow = computeInsiderFlow(transactions);
  const buyValue = flow.buyValue;
  const distinctBuyers = flow.distinctBuyers;

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
        <Stat label="Buys" value={formatNumber(flow.buyCount)} good />
        <Stat label="Sells" value={formatNumber(flow.sellCount)} />
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
interface PressItem {
  title: string;
  source: string;
  date: number;
  link: string;
  kind?: "news" | "press";
}

/**
 * Company News & Press Releases — real published coverage (Google News and
 * Yahoo Finance feeds) merged with our own InsiderBuying articles for the same
 * ticker, newest first. Our pieces are badged so a reader can always tell our
 * analysis apart from third-party reporting.
 */
function RecentNews({
  ticker,
  name,
  compact = false,
}: {
  ticker: string;
  name?: string;
  compact?: boolean;
}) {
  const { data: press, isLoading } = useSWR<{ items: PressItem[] }>(
    `${API_BASE}/content/news/${encodeURIComponent(ticker)}${
      name ? `?name=${encodeURIComponent(name)}` : ""
    }`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 10 * 60_000 },
  );
  const { data: ours } = useSWR<{ items: NewsItem[] }>(
    `${API_BASE}/content/by-ticker/${encodeURIComponent(ticker)}?limit=6`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 10 * 60_000 },
  );

  type Row = {
    key: string;
    title: string;
    source: string;
    date: number;
    href: string;
    external: boolean;
    summary?: string | null;
    kind: "news" | "press";
  };

  const rows: Row[] = [
    ...(ours?.items || []).map((it) => ({
      key: `own-${it.slug}`,
      title: it.title,
      source: "InsiderBuying",
      date: Date.parse(it.generatedAt) || 0,
      href: `/insights/${it.slug}`,
      external: false,
      summary: it.summary,
      kind: "news" as const,
    })),
    ...(press?.items || [])
      .filter((p) => p.title && p.link)
      .map((p) => ({
        key: `ext-${p.link}`,
        title: p.title,
        source: p.source || "Newswire",
        date: p.date || 0,
        href: p.link,
        external: true,
        kind: (p.kind ?? "news") as "news" | "press",
      })),
  ].sort((a, b) => b.date - a.date);
  const newsRows = rows.filter((r) => r.kind === "news").slice(0, compact ? 4 : 16);
  const pressRows = rows.filter((r) => r.kind === "press").slice(0, 12);

  if (isLoading && rows.length === 0)
    return <div className="card p-5 h-40 shimmer rounded-lg" />;
  if (rows.length === 0) {
    if (compact) return null;
    return (
      <div className="card p-8 text-center text-mute text-sm">
        No recent news or press releases found for {ticker}.
      </div>
    );
  }

  const renderRow = (it: Row) => {
          const inner = (
            <>
              <span
                className="flex-shrink-0 rounded-md overflow-hidden bg-white flex items-center justify-center"
                style={{ width: 52, height: 52, padding: 4, border: "1px solid var(--border)" }}
              >
                <CompanyLogo ticker={ticker} name={ticker} size={44} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 mb-1">
                  <span
                    className="text-[10px] uppercase tracking-wider font-bold"
                    style={{ color: it.external ? "var(--text-mute)" : "var(--accent)" }}
                  >
                    {it.source}
                  </span>
                  {!it.external && (
                    <span
                      className="text-[9.5px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded"
                      style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
                    >
                      Our analysis
                    </span>
                  )}
                </span>
                <span className="block text-[15px] font-semibold leading-snug">{it.title}</span>
                {it.summary && (
                  <span className="block text-[13px] text-mute mt-1 line-clamp-2">{it.summary}</span>
                )}
                <span className="block text-[11px] text-faint mt-1.5 tabular">
                  {it.date ? formatDate(new Date(it.date).toISOString()) : ""}
                </span>
              </span>
              {it.external && (
                <ExternalLink className="h-3.5 w-3.5 flex-shrink-0 mt-1" style={{ color: "var(--text-faint)" }} />
              )}
            </>
          );
          const cls = "flex gap-3 p-4 hover:bg-[var(--bg-3)] transition";
          return it.external ? (
            <a
              key={it.key}
              href={it.href}
              target="_blank"
              rel="noopener noreferrer"
              className={cls}
              style={{ borderColor: "var(--border)" }}
            >
              {inner}
            </a>
          ) : (
            <Link key={it.key} href={it.href} className={cls} style={{ borderColor: "var(--border)" }}>
              {inner}
            </Link>
          );
  };

  return (
    <section className="space-y-6">
      {compact ? (
        <>
          <h2 className="text-[16px] font-semibold mb-3">Latest News</h2>
          <div className="card divide-y" style={{ borderColor: "var(--border)" }}>
            {newsRows.map(renderRow)}
          </div>
        </>
      ) : (
        <>
          <div>
            <h2 className="text-[18px] font-bold mb-3">News</h2>
            <div className="card divide-y" style={{ borderColor: "var(--border)" }}>
              {newsRows.length ? newsRows.map(renderRow) : (
                <div className="p-6 text-center text-mute text-sm">No recent news for {ticker}.</div>
              )}
            </div>
          </div>
          {pressRows.length > 0 && (
            <div>
              <h2 className="text-[18px] font-bold mb-3">Press Releases</h2>
              <div className="card divide-y" style={{ borderColor: "var(--border)" }}>
                {pressRows.map(renderRow)}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

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
  const items: [string, React.ReactNode][] = [
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
      row.upsidePct != null ? (
        <span style={{ color: row.upsidePct >= 0 ? "var(--good)" : "var(--bad)" }}>
          {row.upsidePct >= 0 ? "+" : ""}
          {row.upsidePct.toFixed(1)}%
        </span>
      ) : (
        "—"
      ),
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

/** "As of today at 18:46 UTC-04:00 (Market Open/Closed)" — US market hours
/** Solid slate action button — the stockanalysis.com header style. */
function HeaderActionBtn({
  href,
  icon,
  children,
}: {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 rounded-md px-3.5 h-9 text-[13.5px] font-semibold transition hover:brightness-110"
      style={{ background: "#33526E", color: "#fff" }}
    >
      {icon}
      {children}
    </Link>
  );
}

/** Watchlist toggle in the same solid header style (star fills when saved). */
function HeaderWatchlistBtn({ ticker }: { ticker: string }) {
  const { has, toggle } = useWatchlist();
  const saved = has(ticker);
  return (
    <button
      type="button"
      onClick={() => toggle(ticker)}
      aria-pressed={saved}
      className="inline-flex items-center gap-1.5 rounded-md px-3.5 h-9 text-[13.5px] font-semibold transition hover:brightness-110"
      style={{ background: "#33526E", color: "#fff" }}
    >
      {saved ? (
        <Star className="h-4 w-4" fill="var(--gold)" stroke="var(--gold)" />
      ) : (
        <Plus className="h-4 w-4" />
      )}
      Watchlist
    </button>
  );
}

/** "Aug 7, 2026, 3:16 PM EDT - Market open" — the reference's timestamp
 *  line. Open/closed is computed client-side (Mon–Fri 9:30–16:00 ET,
 *  holidays not modeled). */
function MarketStateLine() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  if (!now) return null;
  const et = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const mins = et.getHours() * 60 + et.getMinutes();
  const isWeekday = et.getDay() >= 1 && et.getDay() <= 5;
  const open = isWeekday && mins >= 9 * 60 + 30 && mins < 16 * 60;
  // Reference format: "Aug 7, 2026, 3:16 PM EDT - Market open"
  const stamp = now.toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZoneName: "short",
  });
  return (
    <div className="text-[12.5px] text-mute mt-1.5">
      {stamp} - {open ? "Market open" : "Market closed"}
    </div>
  );
}
