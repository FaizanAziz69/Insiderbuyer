export const API_BASE = "/api/backend";

export interface RankingRow {
  rank: number;
  companyId: string;
  ticker: string | null;
  name: string;
  sector: string | null;
  marketCap: number | null;
  lastPrice: number | null;
  iqs: number; // 0–100 composite Insider Quality Score
  insiderWeight: number;
  transactionWeight: number;
  convictionWeight: number;
  historicalSuccessWeight: number;
  clusterWeight: number;
  marketTimingWeight: number;
  distinctBuyers: number;
  transactionCount: number;
  totalPurchaseValue: number;
  /** Volume-weighted average insider purchase price across Form 4 buys. */
  avgCost?: number | null;
  /** Most recent open-market insider purchase date (yyyy-mm-dd). */
  lastBuyDate?: string | null;
  /** Real intraday change % — present when the API is queried with live=1. */
  changePct?: number | null;
  livePrice?: number | null;
}

export interface RankingsResponse {
  total: number;
  rows: RankingRow[];
}

export interface CompanyDetail {
  company: {
    id: string;
    cik: string;
    ticker: string | null;
    name: string;
    sector: string | null;
    marketCap: number | null;
    lastPrice: number | null;
  };
  score: {
    iqs: number; // 0–100
    insiderWeight: number;
    transactionWeight: number;
    convictionWeight: number;
    historicalSuccessWeight: number;
    clusterWeight: number;
    marketTimingWeight: number;
    distinctBuyers: number;
    transactionCount: number;
    totalPurchaseValue: number;
    asOfDate: string;
  } | null;
  scoreHistory?: Array<{ asOfDate: string; iqs: number }>;
  transactions: Array<{
    id: string;
    insiderName: string;
    role: string;
    rawTitle: string;
    transactionDate: string;
    transactionCode: string;
    type?: "BUY" | "SELL";
    sharesBought: number;
    pricePerShare: number;
    totalValue: number;
    previousHoldings: number | null;
    postHoldings: number | null;
    filingUrl: string;
  }>;
}

export interface DashboardResponse {
  metrics: {
    insiderBuys24h: number;
    pct24hVs7d: number;
    totalRecentValue: number;
    confidence: number;
    topSector: { name: string; value: number };
  };
  sectors: Array<{ name: string; value: number; count: number }>;
  activity: Array<{ date: string; count: number; value: number }>;
  topTrades: Array<{
    id: string;
    insiderName: string;
    role: string;
    rawTitle: string;
    ticker: string | null;
    companyName: string;
    sector: string | null;
    totalValue: number;
    sharesBought: number;
    pricePerShare: number;
    transactionDate: string;
  }>;
}

export interface TradeRow {
  id: string;
  insiderName: string;
  role: string;
  rawTitle: string;
  type?: "BUY" | "SELL";
  ticker: string | null;
  companyName: string;
  sector: string | null;
  sharesBought: number;
  pricePerShare: number;
  totalValue: number;
  previousHoldings: number | null;
  transactionDate: string;
  filingUrl: string;
}

export interface TradesResponse {
  total: number;
  rows: TradeRow[];
}

export interface InsiderRow {
  name: string;
  role: string;
  ticker: string | null;
  company: string;
  city: string | null;
  state: string | null;
  country: string | null;
  totalValue: number;
  trades: number;
}

export type NewsCategory = "Market" | "Economy" | "Funds" | "Regulatory";
export type NewsRegion = "US" | "Canada";

export interface NewsItem {
  id: string;
  title: string;
  description: string;
  link: string;
  source: string;
  category: NewsCategory;
  region: NewsRegion;
  label: string;
  pubDate: string;
  tags?: string[];
}

export const TAG_LABELS: Record<string, string> = {
  ai: "AI",
  "analyst-ratings": "Analyst Ratings",
  biotech: "Biotech",
  dividends: "Dividends",
  earnings: "Earnings",
  ev: "Electric Vehicles",
  etf: "ETFs",
  "insider-trades": "Insider Trades",
  ipo: "IPOs",
  macro: "Macro",
  markets: "Markets",
  ma: "Mergers & Acquisitions",
  "rare-earth": "Rare Earth Minerals",
  semis: "Semiconductors",
  "short-interest": "Short Interest",
  space: "Space",
};

export interface IndexQuote {
  symbol: string;
  shortName: string;
  value: number;
  changePct: number;
  changeAbs: number;
}

export interface IndicesResponse {
  quotes: IndexQuote[];
}

export interface CongressionalTrade {
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
  source: string | null;
}

export interface CongressionalResponse {
  total: number;
  rows: CongressionalTrade[];
}

export interface BuySellMeter {
  month: string;
  year: number;
  monthLabel: string;
  buyVolume: number;
  sellVolume: number;
  ratio: number;
  totalBuys: number;
  totalSells: number;
}

export interface PredictionToday {
  ticker: string | null;
  name: string;
  sector: string | null;
  iqs: number;
  bought: number;
  buyers: number;
  why: string;
  asOfDate: string;
}

export interface StockListIndexEntry {
  slug: string;
  title: string;
  description: string;
  count: number;
  kind: "sector" | "persona" | "premium";
}

export interface StockListIndexResponse {
  lists: StockListIndexEntry[];
}

export interface PersonaHolding {
  ticker: string;
  name: string;
  sector: string;
  sharesHeld: number;
  dollarValue: number;
  lastReported: string;
  note?: string;
  iqs?: number;
}

export type StockListRow = RankingRow | PersonaHolding;

export interface StockListDetailResponse {
  slug: string;
  title: string;
  description: string;
  kind: "sector" | "persona" | "premium";
  total: number;
  rows: StockListRow[];
}

export interface NewsResponse {
  total: number;
  items: NewsItem[];
}

export interface ExtractedArticle {
  url: string;
  source: string;
  title: string;
  byline: string | null;
  publishedAt: string | null;
  html: string;
  textPreview: string;
}

export interface IdeaRow {
  companyId: string;
  ticker: string | null;
  name: string;
  sector: string | null;
  marketCap: number | null;
  iqs: number;
  distinctBuyers: number;
  transactionCount: number;
  totalPurchaseValue: number;
}

export interface IdeasResponse {
  lists: Array<{
    slug: string;
    title: string;
    subtitle: string;
    rows: IdeaRow[];
  }>;
}

export interface VolumeSeriesResponse {
  windowDays: number;
  totalCount: number;
  totalValue: number;
  avgPerDay: number;
  byRole: Record<"CEO" | "CFO" | "COO" | "Director" | "Other", number>;
  series: Array<{ date: string; count: number; value: number }>;
}

export type BlogKind =
  | "daily-summary"
  | "top-iqs"
  | "ticker-deep-dive"
  | "sector-roundup"
  | "cluster-buy"
  | "ceo-buying"
  | "stock-idea"
  | "weekly-report"
  | "topic-roundup";

export interface BlogPostListItem {
  slug: string;
  title: string;
  kind: BlogKind;
  ticker: string | null;
  sector: string | null;
  topic?: string | null;
  summary: string;
  eyebrow: string | null;
  imageUrl: string | null;
  tags: string[] | null;
  /** 1-3 tickers rendered as brand-logo overlays on the cover. */
  featuredTickers: string[] | null;
  generatedAt: string;
}

export interface BlogPost extends BlogPostListItem {
  body: string;
  imagePrompt: string | null;
  iqsAtGeneration: number | null;
  inputSnapshot: Record<string, unknown> | null;
  updatedAt: string;
}

export interface BlogListResponse {
  items: BlogPostListItem[];
}

export async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

export function formatCurrency(n: number | null | undefined, compact = true): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  if (compact) {
    const abs = Math.abs(n);
    if (abs >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
    if (abs >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
    if (abs >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
    if (abs >= 1e3) return `$${(n / 1e3).toFixed(2)}K`;
  }
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

export function formatNumber(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

export function formatDecimal(n: number | null | undefined, dp = 4): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return Number(n).toFixed(dp);
}

export function formatDate(s: string | null | undefined): string {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function formatRelative(s: string | null | undefined): string {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return formatDate(s);
}

export function scoreTier(iqs: number): { label: string; cls: string } {
  if (iqs >= 70) return { label: "Elite", cls: "score-grad-1" };
  if (iqs >= 55) return { label: "Strong", cls: "score-grad-2" };
  if (iqs >= 40) return { label: "Notable", cls: "score-grad-3" };
  return { label: "Watch", cls: "score-grad-4" };
}
