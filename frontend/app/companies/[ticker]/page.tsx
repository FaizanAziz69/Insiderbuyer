"use client";
import { use, useMemo, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowDown,
  ArrowUp,
  FileText,
  Calendar,
  TrendingUp,
  Newspaper,
  Landmark,
  BarChart3,
  Users2,
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
  StockDetailPanel,
} from "@/components/stock/StockDetailTabs";
import { PoliticianAvatar } from "@/components/PoliticianAvatar";
import { RightRailArticles } from "@/components/article/RightRailArticles";
import { RightRailStockLists } from "@/components/article/RightRailStockLists";
import { Indicators } from "@/components/Indicators";
import { IqsTooltip } from "@/components/IqsTooltip";
import { TierBadge, tierFor } from "@/components/TierBadge";
import { IqsTrendChart } from "@/components/IqsTrendChart";

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

interface AnalystRow {
  symbol: string;
  name: string;
  sector: string | null;
  price: number;
  targetMean: number | null;
  targetHigh: number | null;
  targetLow: number | null;
  upsidePct: number | null;
  recommendation: string | null;
  numAnalysts: number | null;
}

interface Bar {
  date: string;
  close: number;
}

interface NewsItem {
  slug: string;
  title: string;
  summary: string;
  eyebrow: string | null;
  generatedAt: string;
}

type Tab =
  | "overview"
  | "insiders"
  | "congress"
  | "financials"
  | "analysts"
  | "news";

const TABS: { key: Tab; label: string; icon: typeof TrendingUp }[] = [
  { key: "overview", label: "Overview", icon: BarChart3 },
  { key: "insiders", label: "Insider Trades", icon: FileText },
  { key: "congress", label: "Congressional", icon: Landmark },
  { key: "financials", label: "Financials", icon: BarChart3 },
  { key: "analysts", label: "Analyst Ratings", icon: Users2 },
  { key: "news", label: "News", icon: Newspaper },
];

const RATING_LABEL: Record<string, string> = {
  strong_buy: "Strong Buy",
  buy: "Buy",
  hold: "Hold",
  underperform: "Underperform",
  sell: "Sell",
};

export default function CompanyPage({
  params,
}: {
  params: Promise<{ ticker: string }>;
}) {
  const { ticker } = use(params);
  const sym = ticker.toUpperCase();

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

  const [tab, setTab] = useState<Tab>("overview");

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
            <CompanyHeader
              company={data.company}
              score={data.score}
              stats={stats}
              profile={profile}
              earningsDate={earningsDate}
            />

            {/* Live price chart */}
            <PriceChart ticker={sym} />

            {/* Key stats strip */}
            <KeyStatsStrip
              stats={stats}
              fallbackMarketCap={data.company.marketCap}
              fallbackPrice={data.company.lastPrice}
            />

            {/* Tab bar */}
            <div
              className="border-b overflow-x-auto"
              style={{ borderColor: "var(--border)" }}
            >
              <div className="flex items-center gap-1 min-w-max">
                {TABS.map((t) => {
                  const on = tab === t.key;
                  const Icon = t.icon;
                  return (
                    <button
                      key={t.key}
                      onClick={() => setTab(t.key)}
                      className="relative inline-flex items-center gap-1.5 px-4 py-2.5 text-[14px] font-semibold transition whitespace-nowrap"
                      style={{ color: on ? "var(--accent)" : "var(--text-mute)" }}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {t.label}
                      {on && (
                        <span
                          className="absolute left-2 right-2 -bottom-px h-0.5 rounded-full"
                          style={{ background: "var(--accent)" }}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ── Overview ───────────────────────────────────────────── */}
            {tab === "overview" && (
              <div className="space-y-6">
                {data.score && <SmartScorePanel score={data.score} />}

                {profile?.description && (
                  <section className="card p-5">
                    <h2 className="text-[16px] font-semibold mb-2">
                      About {data.company.name}
                    </h2>
                    <p className="text-[14px] text-soft leading-relaxed">
                      {profile.description}
                    </p>
                    {(profile.industry || profile.employees != null) && (
                      <div className="flex flex-wrap gap-x-6 gap-y-1 mt-3 text-[12px] text-mute">
                        {profile.industry && (
                          <span>Industry: {profile.industry}</span>
                        )}
                        {profile.employees != null && (
                          <span>
                            Employees: {formatNumber(profile.employees)}
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
                    )}
                  </section>
                )}

                <AnalystConsensus ticker={sym} stats={stats} />

                {/* Recent insider-buy summary */}
                <InsiderSummary transactions={data.transactions} />

                {/* IQS trend over time */}
                {data.scoreHistory && data.scoreHistory.length > 1 && (
                  <IqsTrendChart history={data.scoreHistory} />
                )}

                {/* Recent news headlines */}
                <RecentNews ticker={sym} compact />

                {/* Indicators chip strip */}
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
                      insiderTrade: recentInsiderFlag(data.transactions),
                      positiveNews: !!data.score && data.score.iqs >= 50,
                      analystUpgrade:
                        stats?.analystRating === "buy" ||
                        stats?.analystRating === "strong_buy",
                      earningsDueSoon: isEarningsSoon(earningsDate),
                    }}
                    size="md"
                  />
                </section>

                <AdSlot slot="leaderboard" seed={`stock-${ticker}`} />
              </div>
            )}

            {/* ── Insider Trades (PRESERVED live Form 4 table) ────────── */}
            {tab === "insiders" && (
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
                                transition={{
                                  duration: 0.18,
                                  delay: Math.min(i, 12) * 0.02,
                                }}
                              >
                                <td>
                                  <div className="text-[15px] font-bold">
                                    {t.insiderName}
                                  </div>
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
                                <td className="text-right tabular font-bold text-[14px]">
                                  {formatCurrency(Number(t.totalValue))}
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
            )}

            {/* ── Congressional Trades (PRESERVED) ────────────────────── */}
            {tab === "congress" && (
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
                                      <div className="text-[15px] font-bold truncate">
                                        {c.politicianName}
                                      </div>
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
            )}

            {/* ── Financials (reuse stockanalysis-style panel) ───────── */}
            {tab === "financials" && (
              <StockDetailPanel
                ticker={sym}
                view="financials"
                fallbackMarketCap={data.company.marketCap}
                fallbackPrice={data.company.lastPrice}
              />
            )}

            {/* ── Analyst Ratings ─────────────────────────────────────── */}
            {tab === "analysts" && (
              <AnalystRatingsPanel ticker={sym} stats={stats} />
            )}

            {/* ── News ────────────────────────────────────────────────── */}
            {tab === "news" && <RecentNews ticker={sym} />}

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
              Form 4 filings; market data from public feeds and may be delayed. IQS
              is a proprietary score for research purposes and does not predict
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
}: {
  company: CompanyDetail["company"];
  score: CompanyDetail["score"];
  stats: StockStats | null;
  profile: Profile | null;
  earningsDate: string | null;
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
                  Insider Quality Score
                </div>
              </IqsTooltip>
              <div className="text-[26px] font-bold tabular text-accent leading-none mt-1">
                {Number(score.iqs).toFixed(0)}
                <span className="text-[13px] text-mute font-semibold">/100</span>
              </div>
              <div className="mt-1.5 flex justify-center">
                <TierBadge iqs={score.iqs} size="sm" />
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
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

// ── Price chart (inline SVG area) ────────────────────────────────────────────
function PriceChart({ ticker }: { ticker: string }) {
  const { data } = useSWR<{ history: { bars: Bar[] } | null }>(
    `${API_BASE}/market-stats/history?symbol=${encodeURIComponent(ticker)}&range=1y`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 5 * 60_000 },
  );
  const bars = useMemo(() => data?.history?.bars || [], [data]);
  const geo = useMemo(() => {
    if (bars.length < 2) return null;
    const closes = bars.map((b) => b.close);
    const min = Math.min(...closes);
    const max = Math.max(...closes);
    const range = max - min || 1;
    const W = 1000;
    const H = 280;
    const pts = closes.map((c, i) => {
      const x = (i / (closes.length - 1)) * W;
      const y = H - ((c - min) / range) * H;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    return {
      d: `M ${pts.join(" L ")}`,
      area: `M ${pts.join(" L ")} L ${W},${H} L 0,${H} Z`,
      min,
      max,
      W,
      H,
    };
  }, [bars]);

  if (!data) return <div className="card p-5 h-72 shimmer rounded-lg" />;
  if (!geo)
    return (
      <div className="card p-8 text-center text-mute text-sm">
        No price history available.
      </div>
    );

  const first = bars[0].close;
  const last = bars[bars.length - 1].close;
  const chgPct = first ? ((last - first) / first) * 100 : 0;
  const up = last >= first;
  const stroke = up ? "var(--good)" : "var(--bad)";

  return (
    <div className="card p-5">
      <div className="flex items-baseline justify-between mb-4 flex-wrap gap-2">
        <div className="text-[15px] font-semibold">{ticker} · 1-Year Price</div>
        <div
          className="text-[14px] font-bold tabular"
          style={{ color: up ? "var(--good)" : "var(--bad)" }}
        >
          {chgPct >= 0 ? "+" : ""}
          {chgPct.toFixed(2)}% · ${last.toFixed(2)}
        </div>
      </div>
      <svg
        viewBox={`0 0 ${geo.W} ${geo.H}`}
        preserveAspectRatio="none"
        className="w-full"
        style={{ height: 280 }}
      >
        <defs>
          <linearGradient id="cp-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.22" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={geo.area} fill="url(#cp-area)" />
        <path
          d={geo.d}
          fill="none"
          stroke={stroke}
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="flex justify-between text-[11px] text-mute mt-2 tabular">
        <span>{bars[0].date}</span>
        <span>
          Hi ${geo.max.toFixed(2)} · Lo ${geo.min.toFixed(2)}
        </span>
        <span>{bars[bars.length - 1].date}</span>
      </div>
    </div>
  );
}

// ── Key stats strip ──────────────────────────────────────────────────────────
function KeyStatsStrip({
  stats,
  fallbackMarketCap,
  fallbackPrice,
}: {
  stats: StockStats | null;
  fallbackMarketCap: number | null;
  fallbackPrice: number | null;
}) {
  const dec = (n: number | null | undefined, dp = 2) =>
    n === null || n === undefined || Number.isNaN(n) ? null : Number(n).toFixed(dp);

  const marketCap = stats?.marketCap ?? fallbackMarketCap;
  const cells: { label: string; value: string }[] = [];
  const push = (label: string, value: string | null | undefined) => {
    if (value) cells.push({ label, value });
  };

  push("Market Cap", marketCap != null ? formatCurrency(marketCap) : null);
  push("P/E Ratio", dec(stats?.peRatio));
  push("EPS (ttm)", dec(stats?.eps));
  push(
    "Dividend Yield",
    stats?.dividendYield != null ? `${dec(stats.dividendYield)}%` : null,
  );
  push("Beta", dec(stats?.beta));
  push(
    "52-Week Range",
    stats?.week52Low != null && stats?.week52High != null
      ? `${dec(stats.week52Low)} – ${dec(stats.week52High)}`
      : null,
  );
  push("Volume", stats?.volume != null ? formatNumber(stats.volume) : null);
  push("Revenue (ttm)", stats?.revenue != null ? formatCurrency(stats.revenue) : null);
  push(
    "Shares Out",
    stats?.sharesOut != null ? formatNumber(stats.sharesOut) : null,
  );

  // Always show market cap fallback even if everything else is empty.
  if (cells.length === 0 && fallbackPrice == null) {
    return (
      <div className="card p-8 text-center text-mute text-sm">
        No key statistics available.
      </div>
    );
  }
  if (cells.length === 0) return null;

  return (
    <div className="card p-5">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 gap-x-8 gap-y-3">
        {cells.map((c) => (
          <div
            key={c.label}
            className="flex items-center justify-between py-1.5 text-[13px]"
            style={{ borderBottom: "1px solid var(--border)" }}
          >
            <span className="text-mute">{c.label}</span>
            <span className="font-semibold tabular text-right">{c.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Smart Score panel (TipRanks-style gauge + factor breakdown) ──────────────
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
  return { label: "Neutral", color: "var(--text-mute)" };
}

function ringColorForTier(iqs: number): string {
  const tier = tierFor(iqs);
  if (tier === "Gold") return "var(--good)";
  if (tier === "Silver") return "color-mix(in srgb, var(--good) 60%, var(--warn))";
  if (tier === "Bronze") return "var(--warn)";
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
      <h2 className="text-[16px] font-semibold">Smart Score</h2>
      <p className="text-[12px] text-mute mb-4">
        Our 0&ndash;100 Insider Quality Score (IQS) and the signals behind it.
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
                    style={{ width: `${pct}%`, background: rt.color }}
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

// ── Analyst consensus (overview summary) ─────────────────────────────────────
function AnalystConsensus({
  ticker,
  stats,
}: {
  ticker: string;
  stats: StockStats | null;
}) {
  const row = useAnalystRow(ticker);
  const rating = row?.recommendation ?? stats?.analystRating ?? null;
  const target = row?.targetMean ?? stats?.priceTarget ?? null;
  const upside = row?.upsidePct ?? stats?.priceTargetUpsidePct ?? null;
  const numAnalysts = row?.numAnalysts ?? null;

  if (!rating && target == null) return null;

  return (
    <section className="card p-5">
      <h2 className="text-[16px] font-semibold mb-3">Analyst Consensus</h2>
      <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
        {rating && (
          <div>
            <div className="text-[11px] uppercase tracking-wider text-mute font-bold">
              Rating
            </div>
            <div className="text-[18px] font-bold text-good">
              {RATING_LABEL[rating] || rating}
            </div>
            {numAnalysts != null && (
              <div className="text-[12px] text-mute">
                {numAnalysts} analyst{numAnalysts === 1 ? "" : "s"}
              </div>
            )}
          </div>
        )}
        {target != null && (
          <div>
            <div className="text-[11px] uppercase tracking-wider text-mute font-bold">
              Avg Price Target
            </div>
            <div className="text-[18px] font-bold tabular">
              ${target.toFixed(2)}
            </div>
            {upside != null && (
              <div
                className="text-[12px] font-semibold tabular"
                style={{ color: upside >= 0 ? "var(--good)" : "var(--bad)" }}
              >
                {upside >= 0 ? "+" : ""}
                {upside.toFixed(2)}% vs current
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

// ── Analyst Ratings tab ──────────────────────────────────────────────────────
function AnalystRatingsPanel({
  ticker,
  stats,
}: {
  ticker: string;
  stats: StockStats | null;
}) {
  const row = useAnalystRow(ticker);
  const { isLoading } = useSWR<{ rows: AnalystRow[] }>(
    `${API_BASE}/market-stats/analyst-ratings`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 10 * 60_000 },
  );

  const rating = row?.recommendation ?? stats?.analystRating ?? null;
  const price = row?.price ?? stats?.price ?? null;
  const target = row?.targetMean ?? stats?.priceTarget ?? null;
  const high = row?.targetHigh ?? null;
  const low = row?.targetLow ?? null;
  const upside = row?.upsidePct ?? stats?.priceTargetUpsidePct ?? null;
  const numAnalysts = row?.numAnalysts ?? null;

  if (isLoading && !row) return <div className="card p-5 h-48 shimmer rounded-lg" />;

  if (!rating && target == null) {
    return (
      <div className="card p-8 text-center text-mute text-sm">
        No analyst ratings available for {ticker}.
      </div>
    );
  }

  const facts: [string, React.ReactNode][] = [
    [
      "Consensus Rating",
      rating ? (
        <span className="font-bold text-good">
          {RATING_LABEL[rating] || rating}
        </span>
      ) : (
        "—"
      ),
    ],
    ["Analysts Covering", numAnalysts != null ? formatNumber(numAnalysts) : "—"],
    ["Current Price", price != null ? `$${price.toFixed(2)}` : "—"],
    ["Average Target", target != null ? `$${target.toFixed(2)}` : "—"],
    [
      "Implied Upside",
      upside != null ? (
        <span
          className="font-bold tabular"
          style={{ color: upside >= 0 ? "var(--good)" : "var(--bad)" }}
        >
          {upside >= 0 ? "+" : ""}
          {upside.toFixed(2)}%
        </span>
      ) : (
        "—"
      ),
    ],
    ["High Target", high != null ? `$${high.toFixed(2)}` : "—"],
    ["Low Target", low != null ? `$${low.toFixed(2)}` : "—"],
  ];

  return (
    <div className="card p-5">
      <h2 className="text-[16px] font-semibold mb-1">Analyst Ratings &amp; Price Targets</h2>
      <p className="text-[12px] text-mute mb-4">
        Wall Street consensus for {ticker}.
      </p>
      {/* Price-target bar */}
      {price != null && target != null && low != null && high != null && high > low && (
        <PriceTargetBar price={price} target={target} low={low} high={high} />
      )}
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 mt-4">
        {facts.map(([label, value]) => (
          <div
            key={label}
            className="flex items-center justify-between py-2 text-[14px]"
            style={{ borderBottom: "1px solid var(--border)" }}
          >
            <dt className="text-mute">{label}</dt>
            <dd className="font-semibold tabular text-right">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function PriceTargetBar({
  price,
  target,
  low,
  high,
}: {
  price: number;
  target: number;
  low: number;
  high: number;
}) {
  const span = high - low || 1;
  const pos = (v: number) => Math.min(100, Math.max(0, ((v - low) / span) * 100));
  return (
    <div className="mt-2 mb-2">
      <div
        className="relative h-2 rounded-full"
        style={{
          background:
            "linear-gradient(90deg, var(--bad), var(--bg-3), var(--good))",
        }}
      >
        <Marker pos={pos(price)} color="var(--text)" label="Now" />
        <Marker pos={pos(target)} color="var(--accent)" label="Target" />
      </div>
      <div className="flex justify-between text-[11px] text-mute tabular mt-3">
        <span>Low ${low.toFixed(2)}</span>
        <span>High ${high.toFixed(2)}</span>
      </div>
    </div>
  );
}

function Marker({
  pos,
  color,
  label,
}: {
  pos: number;
  color: string;
  label: string;
}) {
  return (
    <div
      className="absolute -top-1 flex flex-col items-center"
      style={{ left: `${pos}%`, transform: "translateX(-50%)" }}
    >
      <div
        className="h-4 w-4 rounded-full border-2"
        style={{ background: color, borderColor: "var(--bg-2)" }}
      />
      <span className="text-[10px] font-bold mt-0.5" style={{ color }}>
        {label}
      </span>
    </div>
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
            className="block p-4 hover:bg-[var(--bg-3)] transition"
            style={{ borderColor: "var(--border)" }}
          >
            {it.eyebrow && (
              <div className="text-[10px] uppercase tracking-wider font-bold text-accent mb-1">
                {it.eyebrow}
              </div>
            )}
            <div className="text-[15px] font-semibold leading-snug">{it.title}</div>
            {it.summary && (
              <p className="text-[13px] text-mute mt-1 line-clamp-2">{it.summary}</p>
            )}
            <div className="text-[11px] text-faint mt-1.5 tabular">
              {formatDate(it.generatedAt)}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

// ── Hooks / helpers ──────────────────────────────────────────────────────────
/** Fetches the universe-wide analyst-ratings list once and returns this
 *  ticker's row (the endpoint has no per-symbol variant). */
function useAnalystRow(ticker: string): AnalystRow | null {
  const { data } = useSWR<{ rows: AnalystRow[] }>(
    `${API_BASE}/market-stats/analyst-ratings`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 10 * 60_000 },
  );
  return (
    data?.rows?.find((r) => r.symbol.toUpperCase() === ticker.toUpperCase()) ??
    null
  );
}

function recentInsiderFlag(
  txs: CompanyDetail["transactions"],
): "buy" | "sell" | null {
  const within = (code: string) =>
    txs.some(
      (t) =>
        t.transactionCode === code &&
        Date.now() - new Date(t.transactionDate).getTime() < 5 * 86400000,
    );
  if (within("P")) return "buy";
  if (within("S")) return "sell";
  return null;
}

function isEarningsSoon(date: string | null): boolean {
  if (!date) return false;
  const d = new Date(date).getTime();
  if (Number.isNaN(d)) return false;
  const diff = d - Date.now();
  return diff > 0 && diff < 14 * 86400000;
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
