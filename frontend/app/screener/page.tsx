"use client";
import useSWR from "swr";
import { useState } from "react";
import { Lock, Search } from "lucide-react";
import Link from "next/link";
import { API_BASE, fetcher, formatCurrency, formatNumber } from "@/lib/api";
import { CompanyLogo } from "@/components/CompanyLogo";
import { IqsScoreCell } from "@/components/IqsScoreCell";
import { WatchlistButton } from "@/components/WatchlistButton";
import { SUBSCRIBE_HREF } from "@/lib/funnel";
import { ToolIntro } from "@/components/ToolIntro";
import { usePremium } from "@/components/premium/PremiumContext";
import { PremiumValue } from "@/components/premium/PremiumValue";
import { PRODUCT_NAME } from "@/components/premium/PaywallCta";

interface ScreenerRow {
  symbol: string;
  name: string;
  sector: string | null;
  industry: string | null;
  marketCap: number | null;
  price: number | null;
  volume: number | null;
  exchange: string | null;
  iqs: number | null;
  buyers: number;
  buyValue: number;
  lastBuyDate: string | null;
  hasCeoBuyer: boolean;
  hasFundBuyer: boolean;
  hasRepeatBuyer: boolean;
  eai: number | null;
  reportsOn: string | null;
}

interface ScreenerResponse {
  total: number;
  universe: number;
  rows: ScreenerRow[];
  sectors: string[];
  updatedAt: string | null;
}

/** The setups the page promises, each backed by a rule the API applies. */
const SETUPS: { value: string; label: string }[] = [
  { value: "", label: "All stocks" },
  { value: "insider-buying", label: "Insider buying" },
  { value: "cluster-buy", label: "Cluster buys" },
  { value: "small-cap-cluster", label: "Small-cap cluster buys" },
  { value: "ceo-buy", label: "CEO buys" },
  { value: "pre-earnings", label: "Pre-earnings activity" },
];

const CAPS: { value: string; label: string }[] = [
  { value: "", label: "Any" },
  { value: "50000000", label: "$50M+" },
  { value: "300000000", label: "$300M+" },
  { value: "2000000000", label: "$2B+" },
  { value: "10000000000", label: "$10B+" },
  { value: "100000000000", label: "$100B+" },
];

const SCORES: { value: string; label: string }[] = [
  { value: "", label: "Any" },
  { value: "30", label: "30+" },
  { value: "40", label: "40+" },
  { value: "50", label: "50+" },
  { value: "60", label: "60+" },
  { value: "70", label: "70+" },
];

const SORTS: { value: string; label: string }[] = [
  { value: "iqs", label: "Insider Score" },
  { value: "buyValue", label: "Insider $ bought" },
  { value: "buyers", label: "Number of buyers" },
  { value: "marketCap", label: "Market cap" },
  { value: "price", label: "Price" },
  { value: "symbol", label: "Ticker (A–Z)" },
];

const PAGE = 50;

/**
 * Client 2026-09-08 ("Paygate the premium data on this page"): the Insider
 * Score is the premium data here. Locked visitors get the same treatment as
 * every scored table — <PremiumValue> blurs a decoy, never the real number —
 * and the "Min Insider Score" filter is locked too, because filtering on 70+
 * would reveal which stocks score high without ever printing a score. The
 * list still sorts by score, highest first, exactly like the rankings pages.
 */
export default function ScreenerPage() {
  const { unlocked } = usePremium();
  const locked = !unlocked;
  const [setup, setSetup] = useState("");
  const [sector, setSector] = useState("");
  const [exchange, setExchange] = useState("");
  const [minMarketCap, setMinMarketCap] = useState("");
  const [maxMarketCap, setMaxMarketCap] = useState("");
  const [minIqs, setMinIqs] = useState("");
  const [sort, setSort] = useState("iqs");
  const [dir, setDir] = useState("desc");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);

  const params = new URLSearchParams();
  if (setup) params.set("setup", setup);
  if (sector) params.set("sector", sector);
  if (exchange) params.set("exchange", exchange);
  if (minMarketCap) params.set("minMarketCap", minMarketCap);
  if (maxMarketCap) params.set("maxMarketCap", maxMarketCap);
  // A lapsed entitlement must not keep filtering on the paid score.
  if (minIqs && !locked) params.set("minIqs", minIqs);
  if (q.trim()) params.set("q", q.trim());
  params.set("sort", sort);
  params.set("dir", dir);
  params.set("limit", String(PAGE));
  params.set("offset", String(page * PAGE));

  const { data, isLoading } = useSWR<ScreenerResponse>(
    `${API_BASE}/screener?${params.toString()}`,
    fetcher,
    { keepPreviousData: true, revalidateOnFocus: false },
  );

  const rows = data?.rows || [];
  const total = data?.total ?? 0;
  // Any control change invalidates the current page offset.
  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    setPage(0);
    set(v);
  };

  return (
    <div className="space-y-6 w-full">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-bold tracking-tight">Screener</h1>
        <ToolIntro tagline="Filter 8,000+ stocks by insider conviction score, sector, market cap, and more.">
          The IQS Screener lets you find stocks where insiders are buying with real conviction — not just routine filings. Combine filters to surface the setups that match your investment style: small-cap cluster buys, CEO new positions, pre-earnings activity, and more.
        </ToolIntro>
        </div>
        <Link href={SUBSCRIBE_HREF} className="btn-secondary self-start sm:self-auto">
          <Lock className="h-3.5 w-3.5" />
          Save filter
        </Link>
      </header>

      <div className="card p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Field label="Setup">
            <select value={setup} onChange={(e) => reset(setSetup)(e.target.value)} className="input-base">
              {SETUPS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Sector">
            <select value={sector} onChange={(e) => reset(setSector)(e.target.value)} className="input-base">
              <option value="">Any sector</option>
              {(data?.sectors || []).map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </Field>
          <Field label="Market cap (min)">
            <select value={minMarketCap} onChange={(e) => reset(setMinMarketCap)(e.target.value)} className="input-base">
              {CAPS.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Market cap (max)">
            <select value={maxMarketCap} onChange={(e) => reset(setMaxMarketCap)(e.target.value)} className="input-base">
              {CAPS.map((c) => (
                <option key={c.value} value={c.value}>{c.label === "Any" ? "Any" : c.label.replace("+", " or less")}</option>
              ))}
            </select>
          </Field>
          <Field label="Min Insider Score">
            {locked ? (
              <Link
                href={SUBSCRIBE_HREF}
                className="input-base flex items-center gap-2 hover:border-[var(--premium)]"
                title={`Filter by Insider Score — included with ${PRODUCT_NAME}`}
                aria-label="Unlock the Insider Score filter"
              >
                <Lock className="h-3.5 w-3.5 flex-shrink-0" style={{ color: "var(--premium)" }} />
                <span className="text-[13px] text-mute truncate">Unlock to filter by score</span>
              </Link>
            ) : (
              <select value={minIqs} onChange={(e) => reset(setMinIqs)(e.target.value)} className="input-base">
                {SCORES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Exchange">
            <select value={exchange} onChange={(e) => reset(setExchange)(e.target.value)} className="input-base">
              <option value="">Any</option>
              <option value="NASDAQ">NASDAQ</option>
              <option value="NYSE">NYSE</option>
              <option value="AMEX">AMEX</option>
              <option value="OTC">OTC</option>
            </select>
          </Field>
          <Field label="Sort by">
            <select value={sort} onChange={(e) => reset(setSort)(e.target.value)} className="input-base">
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Search">
            <div className="input-base flex items-center gap-2">
              <Search className="h-3.5 w-3.5 text-mute flex-shrink-0" />
              <input
                value={q}
                onChange={(e) => reset(setQ)(e.target.value)}
                placeholder="Ticker or company"
                className="bg-transparent outline-none w-full text-[13px]"
                style={{ color: "var(--text)" }}
              />
            </div>
          </Field>
        </div>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="text-xs text-mute">
            {isLoading && !data
              ? "Loading…"
              : `${formatNumber(total)} match${total === 1 ? "" : "es"} from ${formatNumber(data?.universe ?? 0)} stocks`}
          </div>
          <button
            onClick={() => setDir(dir === "desc" ? "asc" : "desc")}
            className="text-xs font-semibold text-accent hover:underline"
          >
            {dir === "desc" ? "Highest first" : "Lowest first"}
          </button>
        </div>
      </div>

      {isLoading && !data ? (
        <div className="card p-12 text-center text-mute">Loading the universe…</div>
      ) : rows.length === 0 ? (
        <div className="card p-12 text-center text-mute">No stocks match these filters.</div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <Th>Company</Th>
                <Th>
                  <span className="inline-flex items-center gap-1.5">
                    {locked && <Lock className="h-3 w-3" style={{ color: "var(--premium)" }} />}
                    Insider Score
                  </span>
                </Th>
                <Th align="right">Buyers</Th>
                <Th align="right">Insider $ bought</Th>
                <Th align="right">Market cap</Th>
                <Th align="right">Price</Th>
                <Th>Sector</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.symbol} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td className="px-3 py-2.5">
                    <span className="inline-flex items-center gap-2">
                      <WatchlistButton ticker={r.symbol} variant="icon" size="sm" />
                      <Link href={`/companies/${encodeURIComponent(r.symbol)}`} className="flex items-center gap-2">
                        <CompanyLogo ticker={r.symbol} name={r.name} size={22} />
                        <span className="min-w-0">
                          <span className="block font-mono text-[14px] font-bold text-accent hover:underline">
                            {r.symbol}
                          </span>
                          <span className="block text-[12px] truncate max-w-[200px]" style={{ color: "var(--text)" }}>
                            {r.name}
                          </span>
                        </span>
                      </Link>
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    {typeof r.iqs === "number" ? (
                      <PremiumValue label="Insider Score">
                        <IqsScoreCell iqs={r.iqs} />
                      </PremiumValue>
                    ) : (
                      <IqsScoreCell iqs={r.iqs} />
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular font-bold">
                    {r.buyers || "—"}
                    {r.hasCeoBuyer && (
                      <span
                        className="ml-1.5 rounded px-1 py-0.5 text-[10px] font-bold align-middle"
                        style={{ background: "var(--bg-3)", color: "var(--text-soft)" }}
                        title="A CEO is among the buyers"
                      >
                        CEO
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular font-bold text-good">
                    {r.buyValue ? formatCurrency(r.buyValue) : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular text-mute font-bold">
                    {r.marketCap ? formatCurrency(r.marketCap) : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular font-bold">
                    {r.price != null ? `$${r.price.toFixed(2)}` : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-[12px] text-mute">
                    {r.sector || "—"}
                    {r.reportsOn && (
                      <span className="block text-[11px] text-faint">Reports {r.reportsOn}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {total > PAGE && (
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="btn-secondary disabled:opacity-40"
          >
            Previous
          </button>
          <span className="text-xs text-mute tabular">
            {page * PAGE + 1}–{Math.min((page + 1) * PAGE, total)} of {formatNumber(total)}
          </span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={(page + 1) * PAGE >= total}
            className="btn-secondary disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

function Th({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <th
      className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider whitespace-nowrap"
      style={{ color: "var(--text-mute)", textAlign: align }}
    >
      {children}
    </th>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label-mini block mb-1.5">{label}</span>
      {children}
    </label>
  );
}
