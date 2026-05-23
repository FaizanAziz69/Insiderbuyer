export const API_BASE = "/api/backend";

export interface RankingRow {
  rank: number;
  companyId: string;
  ticker: string | null;
  name: string;
  sector: string | null;
  marketCap: number | null;
  lastPrice: number | null;
  iqs: number;
  purchaseVolumeFactor: number;
  clusterFactor: number;
  roleWeightedVolume: number;
  holdingChangeFactor: number;
  distinctBuyers: number;
  transactionCount: number;
  totalPurchaseValue: number;
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
    iqs: number;
    purchaseVolumeFactor: number;
    clusterFactor: number;
    roleWeightedVolume: number;
    holdingChangeFactor: number;
    distinctBuyers: number;
    transactionCount: number;
    totalPurchaseValue: number;
    asOfDate: string;
  } | null;
  transactions: Array<{
    id: string;
    insiderName: string;
    role: string;
    rawTitle: string;
    transactionDate: string;
    transactionCode: string;
    sharesBought: number;
    pricePerShare: number;
    totalValue: number;
    previousHoldings: number | null;
    postHoldings: number | null;
    filingUrl: string;
  }>;
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

export function scoreTier(iqs: number): { label: string; cls: string } {
  if (iqs >= 4) return { label: "Elite", cls: "score-grad-1" };
  if (iqs >= 2.5) return { label: "Strong", cls: "score-grad-2" };
  if (iqs >= 1) return { label: "Notable", cls: "score-grad-3" };
  return { label: "Watch", cls: "score-grad-4" };
}
