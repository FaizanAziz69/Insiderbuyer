"use client";
import { useMemo, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import {
  Landmark, FileText, Scale, Newspaper, Tv, Layers, PieChart, Award,
  BadgeDollarSign, Users, TrendingUp, Gauge,
} from "lucide-react";
import { API_BASE, fetcher, formatCurrency, formatDate, formatNumber } from "@/lib/api";
import { Card, Empty, CongressTradingCard, RevenueBreakdownCard, WhaleActivityCard, BullBearCard } from "@/components/stock/StockCivicGrid";
import { StackedYearBars, NetSharesBars, PriceBubbleChart, InstitutionsTreemap } from "@/components/charts/StockCharts";

/* ─────────────────────────────────────────────────────────────────────────
 * Shared bits
 * ──────────────────────────────────────────────────────────────────────── */

export interface Tx {
  insiderName: string;
  role?: string | null;
  rawTitle?: string | null;
  transactionCode: string;
  sharesBought: number;
  pricePerShare: number;
  totalValue: number;
  postHoldings?: number | null;
  previousHoldings?: number | null;
  transactionDate: string;
  reportedAt?: string | null;
  filingUrl?: string | null;
}

/** 111180000000 → "111.18 B" (reference number style). */
export function abbr(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const a = Math.abs(n);
  if (a >= 1e9) return `${(n / 1e9).toFixed(2)} B`;
  if (a >= 1e6) return `${(n / 1e6).toFixed(2)} M`;
  if (a >= 1e3) return `${(n / 1e3).toFixed(2)} K`;
  return `${(+n).toFixed(2)}`;
}
const fyQuarter = (iso: string) => {
  const d = new Date(iso);
  return `Q${Math.floor(d.getUTCMonth() / 3) + 1} ${d.getUTCFullYear()}`;
};

/* ─────────────────────────────────────────────────────────────────────────
 * Overview cards
 * ──────────────────────────────────────────────────────────────────────── */

/** "$T stock is featured in our …" strip — built from lists the ticker is
 *  actually in on OUR site (no invented strategies, no external links). */
export function StrategyBanner({ ticker, hasScore, hasCongress }: { ticker: string; hasScore: boolean; hasCongress: boolean }) {
  const feats: { label: string; href: string }[] = [];
  if (hasScore) feats.push({ label: "Insider Score Rankings", href: "/stocks" });
  if (hasCongress) feats.push({ label: "Congress Trading", href: "/congressional-trades" });
  feats.push({ label: "Insider Trades", href: "/trades" });
  return (
    <div className="card px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
      <p className="text-[13.5px]">
        <span className="font-bold">${ticker}</span> stock is featured in our{" "}
        {feats.map((f, i) => (
          <span key={f.label}>
            <Link href={f.href} className="text-accent font-semibold hover:underline">{f.label}</Link>
            {i < feats.length - 2 ? ", " : i === feats.length - 2 ? ", and " : ""}
          </span>
        ))}{" "}
        datasets.
      </p>
      <Link href="/stock-lists" className="text-[13px] font-bold text-accent whitespace-nowrap">→ All Stock Lists</Link>
    </div>
  );
}

/** Insider Trading — quarterly NET shares purchased (hangs below zero). */
export function InsiderNetSharesCard({ ticker, transactions }: { ticker: string; transactions: Tx[] }) {
  const data = useMemo(() => {
    const byQ = new Map<string, number>();
    for (const t of transactions) {
      const d = new Date(t.transactionDate);
      if (isNaN(d.getTime())) continue;
      const k = `${d.getUTCFullYear()}Q${Math.floor(d.getUTCMonth() / 3) + 1}`;
      const sh = Number(t.sharesBought) || 0;
      byQ.set(k, (byQ.get(k) || 0) + (t.transactionCode === "P" ? sh : t.transactionCode === "S" ? -sh : 0));
    }
    // Last 5 calendar quarters, gaps stay null (reference renders empty slots).
    const now = new Date();
    const out: { label: string; value: number | null }[] = [];
    let y = now.getUTCFullYear(), q = Math.floor(now.getUTCMonth() / 3) + 1;
    for (let i = 0; i < 5; i++) {
      out.unshift({ label: `${y}Q${q}`, value: byQ.has(`${y}Q${q}`) ? (byQ.get(`${y}Q${q}`) as number) : null });
      q--; if (q === 0) { q = 4; y--; }
    }
    return out;
  }, [transactions]);
  const any = data.some((d) => d.value != null);
  return (
    <Card icon={<TrendingUp className="h-4 w-4" />} title="Insider Trading" subtitle={`Quarterly net insider trading by ${ticker}'s directors and management`}>
      {any ? <NetSharesBars data={data} /> : <Empty text={`No SEC Form 4 activity for ${ticker} in the last 5 quarters.`} />}
      <p className="text-[10px] text-faint mt-2">Source: SEC EDGAR (Form 4)</p>
    </Card>
  );
}

/** Parse "FY25 Q3"-style labels into {year, quarterIndex}. */
function parseFyLabel(label: string): { year: number; qi: number } | null {
  const m = label.match(/FY(\d{2})\s*(?:Q(\d)|H(\d))/i);
  if (!m) return null;
  const year = 2000 + Number(m[1]);
  const qi = m[2] ? Number(m[2]) - 1 : (Number(m[3]) - 1) * 2; // H1→Q1 slot, H2→Q3 slot
  return { year, qi: Math.min(3, Math.max(0, qi)) };
}
function toStacked(quarters: { label: string; amount: number }[], years = 5) {
  const byYear = new Map<number, (number | null)[]>();
  for (const p of quarters) {
    const parsed = parseFyLabel(p.label);
    if (!parsed) continue;
    const arr = byYear.get(parsed.year) || [null, null, null, null];
    arr[parsed.qi] = (arr[parsed.qi] || 0) + p.amount;
    byYear.set(parsed.year, arr);
  }
  return Array.from(byYear.entries())
    .sort((a, b) => a[0] - b[0])
    .slice(-years)
    .map(([year, q]) => ({ year, q }));
}

/** Corporate Lobbying — stacked quarterly bars per year (reference style). */
export function LobbyingStackedCard({ ticker, companyName }: { ticker: string; companyName: string }) {
  const { data } = useSWR<{ quarters: { label: string; amount: number }[]; enabled: boolean }>(
    `${API_BASE}/company-civic/lobbying?name=${encodeURIComponent(companyName)}`, fetcher, { revalidateOnFocus: false });
  const stacked = toStacked(data?.quarters || []);
  return (
    <Card icon={<Scale className="h-4 w-4" />} title="Corporate Lobbying" subtitle={`${ticker} Estimated quarterly lobbying spending`}>
      {stacked.length === 0 ? (
        <Empty text={data && !data.enabled ? "Lobbying data activates once an LDA_API_KEY (free, Senate LDA) is set." : `No lobbying filings found for ${ticker}.`} />
      ) : (
        <StackedYearBars data={stacked} base="#8B5CF6" yLabel="Lobbying Amount" />
      )}
      <p className="text-[10px] text-faint mt-2">Source: U.S. Senate LDA</p>
    </Card>
  );
}

/** Government Contracts — stacked quarterly bars per year. */
export function ContractsStackedCard({ ticker, companyName }: { ticker: string; companyName: string }) {
  const { data } = useSWR<{ quarters: { label: string; amount: number }[] }>(
    `${API_BASE}/company-civic/contracts?name=${encodeURIComponent(companyName)}`, fetcher, { revalidateOnFocus: false });
  const stacked = toStacked(data?.quarters || []);
  return (
    <Card icon={<FileText className="h-4 w-4" />} title="Government Contracts" subtitle={`Estimated quarterly amount awarded to ${ticker} from public contracts`}>
      {stacked.length === 0 ? <Empty text={`No recent federal contracts found for ${ticker}.`} /> : (
        <StackedYearBars data={stacked} base="var(--gold)" yLabel="Government Contracts Amount" />
      )}
      <p className="text-[10px] text-faint mt-2">Source: USAspending.gov</p>
    </Card>
  );
}

/** U.S. Patents — scrollable list of grant cards. */
export function PatentsCard({ ticker, companyName }: { ticker: string; companyName: string }) {
  const { data, isLoading } = useSWR<{ items: { title: string; date: string }[]; enabled: boolean }>(
    `${API_BASE}/company-civic/patents?name=${encodeURIComponent(companyName)}`, fetcher, { revalidateOnFocus: false, dedupingInterval: 60 * 60_000 });
  const items = data?.items || [];
  return (
    <Card icon={<Award className="h-4 w-4" />} title="U.S. Patents" subtitle={`New ${ticker} patent grants`}>
      {isLoading ? (
        <div className="h-full flex items-center justify-center text-[12.5px] text-mute py-8">Loading patent grants…</div>
      ) : items.length === 0 ? (
        <Empty text={data && !data.enabled
          ? "Patent data activates once a free USPTO Open Data Portal key (USPTO_API_KEY) is set."
          : `No recent patent grants found for ${ticker}.`} />
      ) : (
        <div className="overflow-auto scrollbar-visible space-y-2.5 pr-1" style={{ maxHeight: 300 }}>
          {items.map((p, i) => (
            <div key={i} className="rounded-lg px-3.5 py-3 flex items-start justify-between gap-3"
              style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}>
              <div className="min-w-0">
                <div className="text-[10.5px] uppercase tracking-wider text-mute font-bold">Patent Title:</div>
                <div className="text-[13px] font-semibold leading-snug mt-0.5">{p.title}</div>
              </div>
              <span className="text-[12px] font-bold text-accent whitespace-nowrap flex-shrink-0">
                {new Date(p.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              </span>
            </div>
          ))}
        </div>
      )}
      <p className="text-[10px] text-faint mt-2">Source: USPTO Open Data Portal</p>
    </Card>
  );
}

/** News — OUR AI insight articles first (clickable → /insights/slug), with
 *  real wire headlines listed beneath them. */
interface AiPost { slug: string; title: string; summary?: string | null; eyebrow?: string | null; imageUrl?: string | null; generatedAt: string }

export function NewsCard({ ticker, name, tall = false }: { ticker: string; name: string; tall?: boolean }) {
  const { data: ai, isLoading: aiLoading } = useSWR<{ items: AiPost[] }>(
    `${API_BASE}/content/by-ticker/${encodeURIComponent(ticker)}?limit=${tall ? 12 : 6}`,
    fetcher, { revalidateOnFocus: false, dedupingInterval: 15 * 60_000 });
  const { data: wire } = useSWR<{ items: { title: string; source: string; date: number }[] }>(
    `${API_BASE}/content/news/${encodeURIComponent(ticker)}?name=${encodeURIComponent(name)}`,
    fetcher, { revalidateOnFocus: false, dedupingInterval: 15 * 60_000 });
  const posts = ai?.items || [];
  const headlines = wire?.items || [];
  return (
    <Card icon={<Newspaper className="h-4 w-4" />} title={`${ticker} News`} subtitle={`Recent insights relating to ${ticker}`}>
      {aiLoading ? (
        <div className="h-full flex items-center justify-center text-[12.5px] text-mute py-8">Loading insights…</div>
      ) : posts.length === 0 && headlines.length === 0 ? (
        <Empty text={`No recent coverage found for ${ticker}.`} />
      ) : (
        <div className="overflow-auto scrollbar-visible space-y-2 pr-1" style={{ maxHeight: tall ? 680 : 300 }}>
          {posts.map((p) => (
            <Link key={p.slug} href={`/insights/${p.slug}`}
              className="block rounded-lg px-3 py-2.5 transition hover:border-[var(--border-strong)]"
              style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}>
              <div className="flex items-start gap-3">
                {p.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.imageUrl} alt="" className="flex-shrink-0 h-10 w-10 rounded object-cover" style={{ background: "#0b1220" }} />
                ) : (
                  <span className="flex-shrink-0 h-10 w-10 rounded flex items-center justify-center text-[13px] font-extrabold"
                    style={{ background: "var(--bg-3)", color: "var(--accent)" }}>AI</span>
                )}
                <div className="min-w-0">
                  {p.eyebrow && <div className="text-[10px] uppercase tracking-wider font-bold text-accent">{p.eyebrow}</div>}
                  <div className="text-[13px] font-semibold leading-snug hover:text-accent transition"
                    style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                    {p.title}
                  </div>
                  <div className="text-[11px] text-mute mt-0.5">InsiderBuying Insights · {formatDate(p.generatedAt)}</div>
                </div>
              </div>
            </Link>
          ))}
          {headlines.length > 0 && (
            <div className="text-[10px] uppercase tracking-wider font-bold text-mute pt-2 pb-0.5">Wire headlines</div>
          )}
          {headlines.slice(0, tall ? 20 : 6).map((n, i) => (
            <div key={i} className="rounded-lg px-3 py-2.5 flex items-start gap-3"
              style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}>
              <span className="flex-shrink-0 h-9 w-9 rounded flex items-center justify-center text-[13px] font-extrabold"
                style={{ background: "var(--bg-3)", color: "var(--accent)" }}>
                {(n.source || "?").slice(0, 1).toUpperCase()}
              </span>
              <div className="min-w-0">
                <div className="text-[13px] font-semibold leading-snug" style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                  {n.title}
                </div>
                <div className="text-[11px] text-mute mt-0.5">
                  {n.source}{n.date ? ` · ${new Date(n.date).toLocaleString()}` : ""}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

/** CNBC Recommendations — no free data source exists; honest empty state. */
export function CnbcCard({ ticker }: { ticker: string }) {
  return (
    <Card icon={<Tv className="h-4 w-4" />} title="CNBC Recommendations" subtitle={`Recent picks made for ${ticker} stock on CNBC`}>
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-mute text-left" style={{ background: "var(--bg-2)" }}>
              <th className="font-bold px-2.5 py-1.5">Personality</th>
              <th className="font-bold px-2.5 py-1.5">Type</th>
              <th className="font-bold px-2.5 py-1.5 text-right">Date</th>
            </tr>
          </thead>
        </table>
      </div>
      <Empty text="No CNBC pick data connected — this dataset has no free public source." />
    </Card>
  );
}

/** Top ETF Holders — estimated from each fund's disclosed top holdings × AUM. */
export function EtfHoldersCard({ ticker }: { ticker: string }) {
  const { data, isLoading } = useSWR<{ rows: { etf: string; name: string; est: number | null; pct: number }[] }>(
    `${API_BASE}/market-stats/etf-holders?symbol=${encodeURIComponent(ticker)}`, fetcher, { revalidateOnFocus: false, dedupingInterval: 60 * 60_000 });
  const rows = data?.rows || [];
  return (
    <Card icon={<PieChart className="h-4 w-4" />} title="Top ETF Holders" subtitle={`ETFs with the largest estimated holdings in ${ticker}`}>
      {isLoading ? (
        <div className="h-full flex items-center justify-center text-[12.5px] text-mute py-8">Scanning major ETF holdings…</div>
      ) : rows.length === 0 ? (
        <Empty text={`${ticker} isn't in the disclosed top holdings of the major ETFs we track.`} />
      ) : (
        <div className="overflow-auto scrollbar-visible" style={{ maxHeight: 300 }}>
          <table className="w-full text-[12.5px]">
            <thead className="sticky top-0 z-10" style={{ background: "var(--bg-2)" }}>
              <tr className="text-[10px] uppercase tracking-wider text-mute text-left">
                <th className="font-bold px-2.5 py-1.5">ETF</th>
                <th className="font-bold px-2.5 py-1.5 text-right">Est. Holding Size</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.etf} style={{ borderTop: "1px solid var(--border)" }}>
                  <td className="px-2.5 py-2">
                    <span className="font-mono font-bold text-accent">{r.etf}</span>
                    <span className="block text-[11px] text-mute truncate max-w-[220px]">{r.name}</span>
                  </td>
                  <td className="px-2.5 py-2 text-right tabular font-semibold">
                    {r.est != null ? formatCurrency(r.est) : `${r.pct}% of fund`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[10px] text-faint mt-2">Estimated from each fund&rsquo;s disclosed top holdings × AUM</p>
    </Card>
  );
}

/** Smart-Score slot — our REAL Insider Score (no fake sign-up gate). */
export function ScoreCardQQ({ ticker, iqs, iqsV1 }: { ticker: string; iqs: number | null; iqsV1?: number | null }) {
  const tier = iqs == null ? null : iqs >= 80 ? "Strong" : iqs >= 60 ? "Positive" : iqs >= 40 ? "Neutral" : "Weak";
  const color = iqs == null ? "var(--text-mute)" : iqs >= 80 ? "var(--good)" : iqs >= 60 ? "var(--accent)" : iqs >= 40 ? "var(--gold)" : "var(--bad)";
  return (
    <Card icon={<Gauge className="h-4 w-4" />} title={`${ticker} Insider Score`} subtitle="Our composite score: insider buying, sector, volume, tone & dilution">
      {iqs == null ? (
        <Empty text={`No Insider Score for ${ticker} yet — it needs recent open-market insider buying.`} />
      ) : (
        <div className="flex items-center gap-5 py-4">
          <div className="h-24 w-24 rounded-xl flex items-center justify-center text-[34px] font-extrabold flex-shrink-0"
            style={{ background: "color-mix(in srgb, currentColor 12%, transparent)", color, border: `2px solid ${color}` }}>
            {Math.round(iqs)}
          </div>
          <div className="min-w-0">
            <div className="text-[17px] font-bold" style={{ color }}>{tier}</div>
            {iqsV1 != null && <div className="text-[12px] text-mute mt-0.5">v1 score: {Math.round(iqsV1)}</div>}
            <Link href="/stocks" className="text-[12.5px] font-bold text-accent hover:underline mt-1.5 inline-block">
              Score Breakdown & Rankings →
            </Link>
          </div>
        </div>
      )}
    </Card>
  );
}

/** About — full-width block: paragraph + 4-column meta row. */
export function AboutQQ({ ticker, name, description, address, marketCap, employees, industry }: {
  ticker: string; name: string; description: string | null; address: string | null;
  marketCap: number | null; employees: number | null; industry: string | null;
}) {
  if (!description) return null;
  return (
    <section className="pt-2">
      <h2 className="text-[24px] font-bold tracking-tight mb-3">About {ticker}</h2>
      <p className="text-[14.5px] text-soft leading-[1.85] max-w-4xl">{description}</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 max-w-4xl">
        {[
          { label: "Address", val: address || "—" },
          {
            label: "Market Cap",
            val: marketCap == null ? "—"
              : marketCap >= 1e12 ? `${(marketCap / 1e12).toFixed(2)} trillion`
              : marketCap >= 1e9 ? `${(marketCap / 1e9).toFixed(2)} billion`
              : `${(marketCap / 1e6).toFixed(0)} million`,
          },
          { label: "Employees", val: employees != null ? formatNumber(employees) : "—" },
          { label: "Industrial Classification", val: industry || "—" },
        ].map((m) => (
          <div key={m.label}>
            <div className="text-[13px] font-bold mb-1">{m.label}</div>
            <div className="text-[13.5px] text-soft">{m.val}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Financials tab
 * ──────────────────────────────────────────────────────────────────────── */

interface StmtPeriod { date: string; values: Record<string, number | null> }
type LineItem = { label: string; key: string; bold?: boolean; growth?: boolean; eps?: boolean };

const INCOME_ITEMS: LineItem[] = [
  { label: "Revenue", key: "TotalRevenue", bold: true },
  { label: "Revenue Growth (YoY)", key: "TotalRevenue", growth: true },
  { label: "Cost of Revenue", key: "CostOfRevenue" },
  { label: "Gross Profit", key: "GrossProfit", bold: true },
  { label: "SG&A Expense", key: "SellingGeneralAndAdministration" },
  { label: "R&D Expense", key: "ResearchAndDevelopment" },
  { label: "Operating Expenses", key: "OperatingExpense" },
  { label: "Operating Income", key: "OperatingIncome", bold: true },
  { label: "Pretax Income", key: "PretaxIncome" },
  { label: "Tax Provision", key: "TaxProvision" },
  { label: "Net Income", key: "NetIncome", bold: true },
  { label: "EPS (Basic)", key: "BasicEPS", eps: true },
  { label: "EPS (Diluted)", key: "DilutedEPS", eps: true },
  { label: "Shares Outstanding", key: "BasicAverageShares" },
];
const BALANCE_ITEMS: LineItem[] = [
  { label: "Total Assets", key: "TotalAssets", bold: true },
  { label: "Current Assets", key: "CurrentAssets" },
  { label: "Cash & Equivalents", key: "CashAndCashEquivalents" },
  { label: "Total Liabilities", key: "TotalLiabilitiesNetMinorityInterest", bold: true },
  { label: "Current Liabilities", key: "CurrentLiabilities" },
  { label: "Total Debt", key: "TotalDebt" },
  { label: "Long-Term Debt", key: "LongTermDebt" },
  { label: "Shareholders' Equity", key: "StockholdersEquity", bold: true },
  { label: "Retained Earnings", key: "RetainedEarnings" },
];
const CASH_ITEMS: LineItem[] = [
  { label: "Operating Cash Flow", key: "OperatingCashFlow", bold: true },
  { label: "Capital Expenditure", key: "CapitalExpenditure" },
  { label: "Free Cash Flow", key: "FreeCashFlow", bold: true },
  { label: "Investing Cash Flow", key: "InvestingCashFlow" },
  { label: "Financing Cash Flow", key: "FinancingCashFlow" },
  { label: "Share Buybacks", key: "RepurchaseOfCapitalStock" },
  { label: "End Cash Position", key: "EndCashPosition", bold: true },
];

export function FinancialsTab({ sym }: { sym: string }) {
  const [pill, setPill] = useState<"income" | "balance" | "cashflow" | "revbreak">("income");
  const { data, isLoading } = useSWR<{ income: StmtPeriod[]; balance: StmtPeriod[]; cashflow: StmtPeriod[] }>(
    `${API_BASE}/market-stats/statements?symbol=${encodeURIComponent(sym)}`, fetcher, { revalidateOnFocus: false, dedupingInterval: 60 * 60_000 });
  const PILLS = [
    ["income", "Income"], ["balance", "Balance Sheet"], ["cashflow", "Cash Flow"], ["revbreak", "Revenue Breakdown"],
  ] as const;
  const periods = (pill === "balance" ? data?.balance : pill === "cashflow" ? data?.cashflow : data?.income) || [];
  const shown = periods.slice(0, 6);
  const items = pill === "balance" ? BALANCE_ITEMS : pill === "cashflow" ? CASH_ITEMS : INCOME_ITEMS;
  const yoy = (key: string, i: number): number | null => {
    const cur = shown[i]?.values?.[key];
    // Same quarter a year earlier = 4 periods later in the newest-first list.
    const prev = periods[i + 4]?.values?.[key];
    if (cur == null || prev == null || prev === 0) return null;
    return +(((cur - prev) / Math.abs(prev)) * 100).toFixed(2);
  };
  return (
    <div className="space-y-5">
      <div className="flex gap-2 flex-wrap">
        {PILLS.map(([k, label]) => (
          <button key={k} onClick={() => setPill(k)}
            className="px-3.5 py-1.5 rounded-full text-[13px] font-bold transition"
            style={pill === k ? { background: "var(--accent)", color: "var(--on-accent, #fff)" } : { background: "var(--bg-2)", color: "var(--text-mute)", border: "1px solid var(--border)" }}>
            {label}
          </button>
        ))}
      </div>
      {pill === "revbreak" ? (
        <RevenueBreakdownCard ticker={sym} />
      ) : (
        <>
          <h2 className="text-[26px] font-bold tracking-tight">
            {sym} {pill === "income" ? "Income Statement" : pill === "balance" ? "Balance Sheet" : "Cash Flow"}
          </h2>
          <div className="card overflow-x-auto">
            {isLoading ? (
              <div className="p-12 text-center text-[13px] text-mute">Loading statements…</div>
            ) : shown.length === 0 ? (
              <div className="p-12 text-center text-[13px] text-mute">No quarterly statements available for {sym}.</div>
            ) : (
              <table className="w-full text-[13px]" style={{ minWidth: 760 }}>
                <tbody>
                  <tr style={{ borderBottom: "1px solid var(--border)" }}>
                    <th className="sticky left-0 text-left px-3.5 py-2.5 font-bold text-[12.5px]" style={{ background: "var(--bg-1)" }}>Fiscal Period</th>
                    {shown.map((p) => <th key={p.date} className="px-3.5 py-2.5 text-right font-bold whitespace-nowrap">{fyQuarter(p.date)}</th>)}
                  </tr>
                  <tr style={{ borderBottom: "1px solid var(--border)" }}>
                    <th className="sticky left-0 text-left px-3.5 py-2.5 font-bold text-[12.5px]" style={{ background: "var(--bg-1)" }}>Period Ending</th>
                    {shown.map((p) => (
                      <td key={p.date} className="px-3.5 py-2.5 text-right text-mute whitespace-nowrap">
                        {new Date(p.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </td>
                    ))}
                  </tr>
                  {items.map((it) => (
                    <tr key={it.label} style={{ borderBottom: "1px solid var(--border)" }}>
                      <th className={`sticky left-0 text-left px-3.5 py-2.5 text-[12.5px] ${it.bold ? "font-bold" : it.growth ? "font-normal pl-7 text-mute" : "font-medium"}`}
                        style={{ background: "var(--bg-1)" }}>
                        {it.label}
                      </th>
                      {shown.map((p, i) => {
                        if (it.growth) {
                          const g = yoy(it.key, i);
                          return (
                            <td key={p.date} className="px-3.5 py-2.5 text-right tabular whitespace-nowrap"
                              style={{ color: g == null ? "var(--text-faint)" : g >= 0 ? "var(--good)" : "var(--bad)" }}>
                              {g == null ? "—" : `${g.toFixed(2)} %`}
                            </td>
                          );
                        }
                        const v = p.values?.[it.key];
                        return (
                          <td key={p.date} className={`px-3.5 py-2.5 text-right tabular whitespace-nowrap ${it.bold ? "font-bold" : ""}`}>
                            {v == null ? "—" : it.eps ? (+v).toFixed(2) : abbr(v)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <p className="text-[11px] text-faint">Quarterly figures; YoY compares the same fiscal quarter a year earlier. Source: public market data.</p>
        </>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Forecast tab
 * ──────────────────────────────────────────────────────────────────────── */

interface Forecast {
  lastPrice: number | null; targetMean: number | null; targetHigh: number | null;
  targetLow: number | null; targetMedian: number | null; analysts: number | null;
  recommendationKey: string | null;
  trend: { strongBuy: number; buy: number; hold: number; sell: number; strongSell: number };
}

function ConsensusDonut({ buy, neutral, sell, word }: { buy: number; neutral: number; sell: number; word: string }) {
  const total = Math.max(1, buy + neutral + sell);
  const R = 62, C = 75, sw = 10, circ = 2 * Math.PI * R;
  const segs = [
    { v: buy, color: "var(--good)" },
    { v: neutral, color: "var(--text-mute)" },
    { v: sell, color: "var(--bad)" },
  ];
  let acc = 0;
  return (
    <svg viewBox="0 0 150 150" width="180" height="180" className="-rotate-90 mx-auto">
      {segs.map((s, i) => {
        const frac = s.v / total;
        const el = frac > 0 ? (
          <circle key={i} cx={C} cy={C} r={R} fill="none" stroke={s.color} strokeWidth={sw}
            strokeDasharray={`${Math.max(0.0001, frac * circ - 3)} ${circ}`} strokeDashoffset={-acc * circ} strokeLinecap="round" />
        ) : null;
        acc += frac;
        return el;
      })}
      <text x={C} y={C + 7} textAnchor="middle" fontSize="21" fontWeight="700" fill="var(--text)" transform={`rotate(90 ${C} ${C})`}>{word}</text>
    </svg>
  );
}

export function ForecastTab({ sym, coverage }: { sym: string; coverage: React.ReactNode }) {
  const { data } = useSWR<Forecast>(`${API_BASE}/market-stats/forecast?symbol=${encodeURIComponent(sym)}`, fetcher, { revalidateOnFocus: false, dedupingInterval: 30 * 60_000 });
  const t = data?.trend;
  const buy = (t?.strongBuy || 0) + (t?.buy || 0);
  const neutral = t?.hold || 0;
  const sell = (t?.sell || 0) + (t?.strongSell || 0);
  const totalRatings = buy + neutral + sell;
  const word = !data?.recommendationKey ? "—"
    : /buy/.test(data.recommendationKey) ? "Buy"
    : /sell|underperform/.test(data.recommendationKey) ? "Sell" : "Neutral";
  const median = data?.targetMedian ?? data?.targetMean ?? null;
  const updown = median != null && data?.lastPrice ? +(((median - data.lastPrice) / data.lastPrice) * 100).toFixed(2) : null;
  const money = (v: number | null) => (v == null ? "—" : `$${v.toFixed(2)}`);
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.4fr] gap-5 items-stretch">
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-accent"><Users className="h-4 w-4" /></span>
            <h3 className="text-[16px] font-bold">{sym} Analyst Ratings</h3>
          </div>
          <ConsensusDonut buy={buy} neutral={neutral} sell={sell} word={word} />
          <div className="flex items-center justify-center gap-5 text-[13px] mt-1">
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: "var(--good)" }} /> Buy <b>{buy}</b></span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: "var(--text-mute)" }} /> Neutral <b>{neutral}</b></span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: "var(--bad)" }} /> Sell <b>{sell}</b></span>
          </div>
          <p className="text-[12px] text-mute text-center mt-3">Based on <b>{totalRatings}</b> analyst ratings for <b>{sym}</b> stock.</p>
        </div>
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-accent"><BadgeDollarSign className="h-4 w-4" /></span>
            <h3 className="text-[16px] font-bold">{sym} Stock Forecasts</h3>
          </div>
          <div className="flex flex-col sm:flex-row gap-6 items-start">
            <div className="flex-shrink-0">
              <div className="text-[38px] font-extrabold tabular leading-none">{money(median)}</div>
              {updown != null && (
                <div className="text-[13px] font-bold mt-1" style={{ color: updown >= 0 ? "var(--good)" : "var(--bad)" }}>
                  ({updown >= 0 ? "+" : ""}{updown}% {updown >= 0 ? "Upside" : "Downside"})
                </div>
              )}
            </div>
            <p className="text-[13.5px] leading-relaxed text-soft">
              Based on <b>{data?.analysts ?? "—"}</b> Wall Street analysts offering price targets for <b>{sym}</b>.
              The median price target is <b>{money(median)}</b> with a high estimate of{" "}
              <b style={{ color: "var(--good)" }}>{money(data?.targetHigh ?? null)}</b> and a low estimate of{" "}
              <b style={{ color: "var(--bad)" }}>{money(data?.targetLow ?? null)}</b>.
              {updown != null && data?.lastPrice != null && (
                <> The median price target is a <b style={{ color: updown >= 0 ? "var(--good)" : "var(--bad)" }}>{updown}%</b> change from the last price of <b>${data.lastPrice.toFixed(2)}</b>.</>
              )}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3 mt-6">
            {[
              { label: "Highest Price Target", v: data?.targetHigh, color: "var(--good)" },
              { label: "Median Price Target", v: median, color: "var(--text)" },
              { label: "Lowest Price Target", v: data?.targetLow, color: "var(--bad)" },
            ].map((x) => (
              <div key={x.label} className="text-center">
                <div className="text-[24px] font-extrabold tabular" style={{ color: x.color }}>{money(x.v ?? null)}</div>
                <div className="text-[11.5px] text-mute mt-1">{x.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <h2 className="text-[26px] font-bold tracking-tight">{sym} Analyst Forecasts</h2>
      {coverage}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Insiders tab intro (summary sentence + bubble chart)
 * ──────────────────────────────────────────────────────────────────────── */

export function InsidersIntro({ sym, transactions }: { sym: string; transactions: Tx[] }) {
  const { data: hist } = useSWR<{ history: { bars: { date: string; close: number }[] } }>(
    `${API_BASE}/market-stats/history?symbol=${encodeURIComponent(sym)}&range=5y`, fetcher, { revalidateOnFocus: false, dedupingInterval: 60 * 60_000 });
  const bars = hist?.history?.bars || [];
  const sixMo = Date.now() - 183 * 24 * 60 * 60_000;
  const recent = transactions.filter((t) => new Date(t.transactionDate).getTime() >= sixMo);
  const sales = recent.filter((t) => t.transactionCode === "S");
  const buys = recent.filter((t) => t.transactionCode === "P");
  const salesTotal = sales.reduce((s, t) => s + Number(t.totalValue || 0), 0);
  const buysTotal = buys.reduce((s, t) => s + Number(t.totalValue || 0), 0);
  const trades = transactions
    .filter((t) => t.transactionCode === "P" || t.transactionCode === "S")
    .map((t) => ({
      date: t.transactionDate,
      value: Number(t.totalValue) || 0,
      isBuy: t.transactionCode === "P",
      insider: t.insiderName,
      shares: Number(t.sharesBought) || 0,
      price: Number(t.pricePerShare) || 0,
    }));
  return (
    <div className="space-y-4">
      <h2 className="text-[26px] font-bold tracking-tight">{sym} Stock Insider Trading Activity</h2>
      <p className="text-[14px] text-soft leading-relaxed max-w-4xl">
        {sym} stock&rsquo;s insider trading shows{" "}
        {buys.length > 0 && (<><b style={{ color: "var(--good)" }}>{buys.length} purchase{buys.length === 1 ? "" : "s"}</b> for an estimated <b style={{ color: "var(--good)" }}>{formatCurrency(buysTotal)}</b>{sales.length > 0 ? " and " : ""}</>)}
        {sales.length > 0 && (<><b style={{ color: "var(--bad)" }}>{sales.length} sale{sales.length === 1 ? "" : "s"}</b> on the open market for an estimated <b style={{ color: "var(--bad)" }}>{formatCurrency(salesTotal)}</b></>)}
        {buys.length === 0 && sales.length === 0 && <b>no open-market insider trades</b>}
        {" "}by company insiders over the last 6 months.
      </p>
      <div className="card p-5">
        <PriceBubbleChart history={bars} trades={trades} />
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Institutions tab
 * ──────────────────────────────────────────────────────────────────────── */

interface Holding13F { institution: string; shares: number; value: number; change: number | null; pctChange: number | null; isNew: boolean; reported: string }
interface Deriv13F { institution: string; type: "PUT" | "CALL"; shares: number; value: number; reported: string }

export function InstitutionsTab({ sym, name }: { sym: string; name: string }) {
  const { data, isLoading } = useSWR<{ holdings: Holding13F[]; derivatives: Deriv13F[] }>(
    `${API_BASE}/company-civic/institutions?ticker=${encodeURIComponent(sym)}&name=${encodeURIComponent(name)}`,
    fetcher, { revalidateOnFocus: false, dedupingInterval: 60 * 60_000 });
  const holdings = data?.holdings || [];
  const derivatives = data?.derivatives || [];
  const th = "font-bold px-3.5 py-2.5";
  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-2">
        <h2 className="text-[26px] font-bold tracking-tight">{sym} Stock Institutional Owners</h2>
        <Link href={`/companies/${encodeURIComponent(sym)}/institutions`} className="text-[13px] font-bold text-accent hover:underline">
          Full institutional ownership page →
        </Link>
      </div>
      {isLoading ? (
        <div className="card p-14 text-center text-[13px] text-mute">Scanning latest 13F filings on SEC EDGAR…</div>
      ) : holdings.length === 0 ? (
        <div className="card p-14 text-center text-[13px] text-mute">No recent 13F filings reporting {sym} positions found.</div>
      ) : (
        <>
          <div className="card p-4">
            <InstitutionsTreemap rows={holdings} />
            <p className="text-[11px] text-faint mt-2">Tile size = shares held · color = quarterly change (green added, red trimmed, gray held)</p>
          </div>
          <div className="card overflow-x-auto">
            <table className="w-full text-[13px]" style={{ minWidth: 680 }}>
              <thead>
                <tr className="text-[10.5px] uppercase tracking-wider text-mute text-left" style={{ background: "var(--bg-2)" }}>
                  <th className={th}>Investor</th>
                  <th className={`${th} text-right`}>Shares</th>
                  <th className={`${th} text-right`}>Change in Shares</th>
                  <th className={`${th} text-right`}>Market Value</th>
                  <th className={`${th} text-right`}>Date Reported</th>
                </tr>
              </thead>
              <tbody>
                {holdings.map((h, i) => (
                  <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
                    <td className="px-3.5 py-2.5 font-semibold">{h.institution}</td>
                    <td className="px-3.5 py-2.5 text-right tabular">{h.shares.toLocaleString()}</td>
                    <td className="px-3.5 py-2.5 text-right tabular font-semibold whitespace-nowrap">
                      {h.isNew ? <span style={{ color: "var(--good)" }}>NEW</span>
                        : h.change == null ? <span className="text-mute">—</span>
                        : (
                          <span style={{ color: h.change >= 0 ? "var(--good)" : "var(--bad)" }}>
                            {h.change >= 0 ? "+" : ""}{h.change.toLocaleString()}
                            <span className="block text-[11px] opacity-80">{h.pctChange != null ? `${h.pctChange >= 0 ? "+" : ""}${h.pctChange}%` : ""}</span>
                          </span>
                        )}
                    </td>
                    <td className="px-3.5 py-2.5 text-right tabular whitespace-nowrap">{formatCurrency(h.value)}</td>
                    <td className="px-3.5 py-2.5 text-right text-mute whitespace-nowrap">{formatDate(h.reported)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h2 className="text-[22px] font-bold tracking-tight">{sym} Derivatives Institutional Owners</h2>
          <div className="card overflow-x-auto">
            <table className="w-full text-[13px]" style={{ minWidth: 620 }}>
              <thead>
                <tr className="text-[10.5px] uppercase tracking-wider text-mute text-left" style={{ background: "var(--bg-2)" }}>
                  <th className={th}>Investor</th>
                  <th className={`${th} text-center`}>Type</th>
                  <th className={`${th} text-right`}>Underlying Shares</th>
                  <th className={`${th} text-right`}>Market Value</th>
                  <th className={`${th} text-right`}>Date Reported</th>
                </tr>
              </thead>
              <tbody>
                {derivatives.length === 0 ? (
                  <tr><td colSpan={5} className="px-3.5 py-8 text-center text-mute">No derivative positions on {sym} in these filings.</td></tr>
                ) : derivatives.map((d, i) => (
                  <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
                    <td className="px-3.5 py-2.5 font-semibold">{d.institution}</td>
                    <td className="px-3.5 py-2.5 text-center">
                      <span className="inline-block rounded px-2 py-0.5 text-[10px] font-bold"
                        style={{ background: d.type === "CALL" ? "color-mix(in srgb, var(--good) 15%, transparent)" : "color-mix(in srgb, var(--bad) 15%, transparent)", color: d.type === "CALL" ? "var(--good)" : "var(--bad)" }}>
                        {d.type}
                      </span>
                    </td>
                    <td className="px-3.5 py-2.5 text-right tabular">{d.shares.toLocaleString()}</td>
                    <td className="px-3.5 py-2.5 text-right tabular whitespace-nowrap">{formatCurrency(d.value)}</td>
                    <td className="px-3.5 py-2.5 text-right text-mute whitespace-nowrap">{formatDate(d.reported)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <p className="text-[11px] text-faint">Source: SEC EDGAR Form 13F filings (institutions filing within the last ~4 months).</p>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Compensation tab
 * ──────────────────────────────────────────────────────────────────────── */

export function CompensationTab({ sym, name }: { sym: string; name: string }) {
  const { data, isLoading } = useSWR<{ rows: { year: number; peoTotal: number | null; avgNeoTotal: number | null }[]; source: string | null }>(
    `${API_BASE}/company-civic/compensation?ticker=${encodeURIComponent(sym)}`, fetcher, { revalidateOnFocus: false, dedupingInterval: 60 * 60_000 });
  const rows = data?.rows || [];
  const latest = rows[0];
  const yoy = (i: number, key: "peoTotal" | "avgNeoTotal") => {
    const cur = rows[i]?.[key], prev = rows[i + 1]?.[key];
    if (cur == null || prev == null || prev === 0) return null;
    return +(((cur - prev) / Math.abs(prev)) * 100).toFixed(2);
  };
  return (
    <div className="space-y-4">
      <h2 className="text-[26px] font-bold tracking-tight">
        {name} {latest ? latest.year : ""} Executive Compensation
      </h2>
      {isLoading ? (
        <div className="card p-14 text-center text-[13px] text-mute">Reading the latest SEC DEF 14A proxy…</div>
      ) : !latest ? (
        <div className="card p-14 text-center text-[13px] text-mute">
          No parseable executive-compensation disclosure found for {sym}. Compensation lives in SEC DEF 14A proxy filings —
          some layouts can&rsquo;t be read automatically yet.
        </div>
      ) : (
        <>
          <p className="text-[14px] text-soft leading-relaxed max-w-4xl">
            Per {name}&rsquo;s SEC DEF 14A proxy filing, the principal executive officer&rsquo;s Summary-Compensation-Table total was{" "}
            <b>{latest.peoTotal != null ? formatCurrency(latest.peoTotal) : "—"}</b> in <b>{latest.year}</b>
            {latest.avgNeoTotal != null && (
              <>, while the other named executive officers averaged <b>{formatCurrency(latest.avgNeoTotal)}</b></>
            )}.
          </p>
          <div className="card overflow-x-auto">
            <table className="w-full text-[13px]" style={{ minWidth: 560 }}>
              <thead>
                <tr className="text-[10.5px] uppercase tracking-wider text-mute text-left" style={{ background: "var(--bg-2)" }}>
                  <th className="font-bold px-3.5 py-2.5">Fiscal Year</th>
                  <th className="font-bold px-3.5 py-2.5 text-right">CEO (PEO) Total Compensation</th>
                  <th className="font-bold px-3.5 py-2.5 text-right">Avg. Other NEO Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.year} style={{ borderTop: "1px solid var(--border)" }}>
                    <td className="px-3.5 py-2.5 font-bold">{r.year}</td>
                    {(["peoTotal", "avgNeoTotal"] as const).map((k) => {
                      const g = yoy(i, k);
                      return (
                        <td key={k} className="px-3.5 py-2.5 text-right tabular font-semibold">
                          {r[k] != null ? `$${(r[k] as number).toLocaleString()}` : "—"}
                          <span className="block text-[11px] font-normal" style={{ color: g == null ? "var(--text-faint)" : g >= 0 ? "var(--good)" : "var(--bad)" }}>
                            {g == null ? "-" : `${g >= 0 ? "+" : ""}${g}%`}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-faint">Source: {data?.source}. Per-executive salary/bonus breakdowns require parsing each proxy&rsquo;s Summary Compensation Table layout.</p>
        </>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Government tab
 * ──────────────────────────────────────────────────────────────────────── */

function LobbyingInstancesCard({ sym, name }: { sym: string; name: string }) {
  const { data, isLoading } = useSWR<{ items: { amount: number; date: string | null; period: string; issues: string }[]; enabled: boolean }>(
    `${API_BASE}/company-civic/lobbying-instances?name=${encodeURIComponent(name)}`, fetcher, { revalidateOnFocus: false, dedupingInterval: 60 * 60_000 });
  const items = data?.items || [];
  return (
    <Card icon={<Scale className="h-4 w-4" />} title="Corporate Lobbying" subtitle="Government lobbying spending instances">
      {isLoading ? (
        <div className="h-full flex items-center justify-center text-[12.5px] text-mute py-8">Loading filings…</div>
      ) : items.length === 0 ? (
        <Empty text={data && !data.enabled ? "Lobbying data activates once an LDA_API_KEY is set." : `No lobbying filings found for ${sym}.`} />
      ) : (
        <div className="overflow-auto scrollbar-visible space-y-2.5 pr-1" style={{ maxHeight: 420 }}>
          {items.map((f, i) => (
            <div key={i} className="rounded-lg px-3.5 py-3" style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}>
              <div className="flex items-center justify-between gap-3">
                <span className="text-[15px] font-extrabold tabular">${f.amount.toLocaleString()}</span>
                <span className="text-[12px] font-bold text-accent whitespace-nowrap">{f.date ? formatDate(f.date) : f.period}</span>
              </div>
              {f.issues && (
                <p className="text-[12px] text-mute leading-relaxed mt-1.5">
                  <span className="font-bold text-soft">Issue:</span> {f.issues}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
      <p className="text-[10px] text-faint mt-2">Source: U.S. Senate LDA</p>
    </Card>
  );
}

export function GovernmentTab({ sym, name }: { sym: string; name: string }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
      <CongressTradingCard ticker={sym} />
      <LobbyingInstancesCard sym={sym} name={name} />
      <LobbyingStackedCard ticker={sym} companyName={name} />
      <PatentsCard ticker={sym} companyName={name} />
      <ContractsStackedCard ticker={sym} companyName={name} />
      <WhaleActivityCard ticker={sym} companyName={name} />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Ownership tab
 * ──────────────────────────────────────────────────────────────────────── */

export function OwnershipTab({ sym, name }: { sym: string; name: string }) {
  const { data, isLoading } = useSWR<{ holdings: Holding13F[]; derivatives: Deriv13F[] }>(
    `${API_BASE}/company-civic/institutions?ticker=${encodeURIComponent(sym)}&name=${encodeURIComponent(name)}`,
    fetcher, { revalidateOnFocus: false, dedupingInterval: 60 * 60_000 });
  const holdings = (data?.holdings || []).slice().sort((a, b) => b.shares - a.shares);
  const derivatives = data?.derivatives || [];
  const th = "font-bold px-3.5 py-2.5";
  const Track = () => (
    <Link href="/alerts" className="inline-block rounded px-3 py-1 text-[12px] font-bold transition"
      style={{ background: "var(--bg-2)", border: "1px solid var(--border-strong)" }}>
      Track
    </Link>
  );
  return (
    <div className="space-y-6">
      <h2 className="text-[26px] font-bold tracking-tight">{sym} Top Shareholders</h2>
      <div className="card overflow-auto scrollbar-visible" style={{ maxHeight: 520 }}>
        <table className="w-full text-[13px]" style={{ minWidth: 560 }}>
          <thead className="sticky top-0 z-10" style={{ background: "var(--bg-2)" }}>
            <tr className="text-[10.5px] uppercase tracking-wider text-mute text-left">
              <th className={th}>Shareholder</th>
              <th className={`${th} text-right`}>Shares Held</th>
              <th className={`${th} text-right`}></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={3} className="px-3.5 py-12 text-center text-mute">Scanning latest 13F filings…</td></tr>
            ) : holdings.length === 0 ? (
              <tr><td colSpan={3} className="px-3.5 py-12 text-center text-mute">No institutional shareholders found in recent 13F filings.</td></tr>
            ) : holdings.map((h, i) => (
              <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
                <td className="px-3.5 py-2.5">
                  <span className="font-semibold block">{h.institution}</span>
                  <span className="text-[11px] text-mute">Institution</span>
                </td>
                <td className="px-3.5 py-2.5 text-right tabular font-semibold">{h.shares.toLocaleString()}</td>
                <td className="px-3.5 py-2.5 text-right"><Track /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2 className="text-[22px] font-bold tracking-tight">{sym} Options Owners</h2>
      <div className="card overflow-x-auto">
        <table className="w-full text-[13px]" style={{ minWidth: 560 }}>
          <thead>
            <tr className="text-[10.5px] uppercase tracking-wider text-mute text-left" style={{ background: "var(--bg-2)" }}>
              <th className={th}>Shareholder</th>
              <th className={`${th} text-center`}>Security</th>
              <th className={`${th} text-right`}>Underlying Shares</th>
              <th className={`${th} text-right`}></th>
            </tr>
          </thead>
          <tbody>
            {derivatives.length === 0 ? (
              <tr><td colSpan={4} className="px-3.5 py-10 text-center text-mute">No option positions on {sym} in recent 13F filings.</td></tr>
            ) : derivatives.map((d, i) => (
              <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
                <td className="px-3.5 py-2.5">
                  <span className="font-semibold block">{d.institution}</span>
                  <span className="text-[11px] text-mute">Institution</span>
                </td>
                <td className="px-3.5 py-2.5 text-center font-bold" style={{ color: d.type === "CALL" ? "var(--good)" : "var(--bad)" }}>
                  {d.type === "CALL" ? "Call" : "Put"}
                </td>
                <td className="px-3.5 py-2.5 text-right tabular">{d.shares.toLocaleString()}</td>
                <td className="px-3.5 py-2.5 text-right"><Track /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-faint">Source: SEC EDGAR Form 13F filings.</p>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * News tab
 * ──────────────────────────────────────────────────────────────────────── */

export function NewsTab({ sym, name }: { sym: string; name: string }) {
  return (
    <div className="max-w-3xl">
      <NewsCard ticker={sym} name={name} tall />
    </div>
  );
}
