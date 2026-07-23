"use client";
import { use, useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, ArrowDownRight, Lock } from "lucide-react";
import { API_BASE, fetcher, formatCurrency, formatDate } from "@/lib/api";
import { CompanyLogo } from "@/components/CompanyLogo";
import { DataTable, Column } from "@/components/DataTable";

interface PolTrade {
  ticker: string | null;
  company: string;
  action: "Buy" | "Sell";
  amountMin: number | null;
  amountMax: number | null;
  transactionDate: string;
  reportedDate: string | null;
  excessReturn: number | null;
}
interface YearVol { year: number; buyValue: number; sellValue: number }
interface SectorAgg { sector: string; trades: number; estValue: number }
interface Holding { ticker: string; company: string; estValue: number; allocation: number }
interface Profile {
  name: string;
  chamber: string;
  party: string | null;
  photoUrl: string | null;
  stats: {
    totalTrades: number; buyCount: number; sellCount: number;
    buyValue: number; sellValue: number; estTotalVolume: number;
    estPortfolioValue: number | null;
    distinctTickers: number; firstTraded: string; lastTraded: string;
  };
  topTickers: { ticker: string; company: string; buys: number; sells: number; estValue: number; trades: number }[];
  volumeByYear: YearVol[];
  topSectors: SectorAgg[];
  portfolio: Holding[];
  portfolioSeries: { date: string; value: number }[];
  trades: PolTrade[];
  legislation: Legislation[];
  fundraising: Fundraising | null;
}
interface Legislation {
  title: string; number: string | null;
  introducedDate: string | null; latestActionDate: string | null;
  latestAction: string | null; url: string | null;
}
interface Fundraising {
  cycle: number | null; totalReceipts: number | null;
  totalDisbursements: number | null; cashOnHand: number | null;
  topContributors: { name: string; amount: number }[];
}

const SECTIONS = [
  { id: "trades", label: "Trades" },
  { id: "portfolio", label: "Live Stock Portfolio" },
  { id: "networth", label: "Net Worth" },
  { id: "disclosed", label: "Disclosed Holdings" },
  { id: "fundraising", label: "Fundraising" },
  { id: "legislation", label: "Proposed Legislation" },
];

function amountRange(min: number | null, max: number | null): string {
  if (min == null && max == null) return "—";
  if (min != null && max != null && max !== min) return `${formatCurrency(min)} – ${formatCurrency(max)}`;
  return formatCurrency(min ?? max);
}

export default function PoliticianProfilePage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = use(params);
  const decoded = decodeURIComponent(name);
  const { data, isLoading } = useSWR<{ profile: Profile | null }>(
    `${API_BASE}/congressional-trades/profile?name=${encodeURIComponent(decoded)}`,
    fetcher,
    { revalidateOnFocus: false },
  );
  const p = data?.profile || null;
  const [active, setActive] = useState("trades");
  const refs = useRef<Record<string, HTMLElement | null>>({});

  useEffect(() => {
    if (!p) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (vis[0]) setActive(vis[0].target.id);
      },
      { rootMargin: "-30% 0px -60% 0px", threshold: [0, 0.25, 0.5] },
    );
    SECTIONS.forEach((s) => { const el = refs.current[s.id]; if (el) obs.observe(el); });
    return () => obs.disconnect();
  }, [p]);

  const scrollTo = (id: string) => {
    refs.current[id]?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  if (isLoading) {
    return (
      <div className="w-full space-y-6">
        <div className="shimmer rounded-lg h-44" />
        <div className="shimmer rounded-lg h-72" />
        <div className="shimmer rounded-lg h-96" />
      </div>
    );
  }
  if (!p) {
    return (
      <div className="w-full">
        <Link href="/congressional-trades" className="text-accent text-sm inline-flex items-center gap-1 mb-6">
          <ArrowLeft className="h-4 w-4" /> Back to Congress Trading
        </Link>
        <div className="card p-12 text-center text-mute">No disclosures found for &ldquo;{decoded}&rdquo;.</div>
      </div>
    );
  }

  const s = p.stats;
  const partyWord = p.party?.startsWith("R") ? "Republican" : p.party?.startsWith("D") ? "Democratic" : null;
  const subtitle = [partyWord, p.chamber].filter(Boolean).join(" / ");
  // Real "strategy" signal from actual excess returns (no fabricated +900%).
  const withEx = p.trades.filter((t) => t.excessReturn != null);
  const avgExcess = withEx.length
    ? +(withEx.reduce((a, t) => a + (t.excessReturn as number), 0) / withEx.length).toFixed(2)
    : null;
  const winRate = withEx.length
    ? Math.round((withEx.filter((t) => (t.excessReturn as number) > 0).length / withEx.length) * 100)
    : null;

  const tradeCols: Column<PolTrade>[] = [
    {
      key: "stock",
      label: "Stock",
      render: (r) =>
        r.ticker ? (
          <Link href={`/companies/${r.ticker}`} className="flex items-center gap-2 group">
            <CompanyLogo ticker={r.ticker} name={r.company} size={22} />
            <span className="min-w-0">
              <span className="font-mono font-semibold group-hover:text-accent transition">{r.ticker}</span>
              <span className="block text-[11px] text-mute truncate max-w-[150px]">{r.company}</span>
            </span>
          </Link>
        ) : (<span className="text-mute">{r.company}</span>),
    },
    {
      key: "transaction", label: "Transaction", align: "center",
      render: (r) => (
        <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10.5px] font-bold uppercase"
          style={{ background: r.action === "Buy" ? "rgba(16,185,129,0.14)" : "rgba(239,68,68,0.14)", color: r.action === "Buy" ? "#10B981" : "#EF4444" }}>
          {r.action === "Buy" ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
          {r.action === "Buy" ? "Purchase" : "Sale"}
        </span>
      ),
    },
    { key: "filed", label: "Filed", align: "right", render: (r) => (r.reportedDate ? formatDate(r.reportedDate) : "—") },
    { key: "traded", label: "Traded", align: "right", sortValue: (r) => new Date(r.transactionDate).getTime(), render: (r) => formatDate(r.transactionDate) },
    { key: "amount", label: "Amount", align: "right", render: (r) => amountRange(r.amountMin, r.amountMax) },
    {
      key: "excess", label: "Excess Return", align: "right",
      sortValue: (r) => r.excessReturn ?? -9999,
      render: (r) =>
        r.excessReturn == null ? <span className="text-faint">—</span> : (
          <span title="Estimated excess return of the underlying stock vs. the S&P 500 since the transaction"
            className="font-semibold tabular" style={{ color: r.excessReturn >= 0 ? "#10B981" : "#EF4444" }}>
            {r.excessReturn >= 0 ? "+" : ""}{r.excessReturn.toFixed(1)}%
          </span>
        ),
    },
  ];

  const portCols: Column<Holding>[] = [
    {
      key: "ticker", label: "Ticker",
      render: (r) => (
        <Link href={`/companies/${r.ticker}`} className="flex items-center gap-2 group">
          <CompanyLogo ticker={r.ticker} name={r.company} size={22} />
          <span className="font-mono font-bold group-hover:text-accent transition">{r.ticker}</span>
        </Link>
      ),
    },
    { key: "holding", label: "Current Holding", align: "right", sortValue: (r) => r.estValue, render: (r) => formatCurrency(r.estValue) },
    {
      key: "alloc", label: "Portfolio Allocation", align: "right", sortValue: (r) => r.allocation,
      render: (r) => (
        <span className="inline-flex items-center gap-2 justify-end">
          <span className="hidden sm:block h-1.5 w-16 rounded-full overflow-hidden" style={{ background: "var(--bg-2)" }}>
            <span className="block h-full" style={{ width: `${Math.min(100, r.allocation)}%`, background: "var(--accent)" }} />
          </span>
          <span className="font-mono tabular">{r.allocation.toFixed(1)}%</span>
        </span>
      ),
    },
  ];

  return (
    <div className="w-full">
      <Link href="/congressional-trades" className="text-accent text-[13px] inline-flex items-center gap-1 mb-4">
        <ArrowLeft className="h-4 w-4" /> Congress Trading
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6 items-start">
        {/* ── LEFT: sticky profile sidebar ─────────────────────────────── */}
        <aside className="lg:sticky lg:top-4 space-y-5">
          <div className="card p-5 text-center">
            {p.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.photoUrl} alt={p.name} className="rounded-full object-cover mx-auto"
                style={{ width: 120, height: 120, border: "3px solid var(--accent-soft)" }} />
            ) : (
              <div className="flex items-center justify-center rounded-full mx-auto text-[38px] font-bold"
                style={{ width: 120, height: 120, background: "var(--accent-soft)", color: "var(--accent)" }}>
                {initials(p.name)}
              </div>
            )}
            <h1 className="text-[24px] font-bold tracking-tight leading-tight mt-4">{p.name}</h1>
            {subtitle && <div className="text-[13px] text-mute mt-1">{subtitle}</div>}

            {/* 2×2 stat grid */}
            <div className="grid grid-cols-2 gap-y-5 gap-x-3 mt-6 mb-2 text-center">
              <SideStat label="Est. Portfolio Value" value={s.estPortfolioValue != null ? formatCurrency(s.estPortfolioValue) : "—"} />
              <SideStat label="Trade Volume" value={formatCurrency(s.estTotalVolume)} />
              <SideStat label="Total Trades" value={String(s.totalTrades)} />
              <SideStat label="Last Traded" value={formatDate(s.lastTraded)} />
            </div>

            {/* Facts list — only what we actually have */}
            <div className="mt-4 pt-4 text-left divide-y" style={{ borderTop: "1px solid var(--border)" }}>
              <FactRow label="Current Member" value="Yes" valueColor="var(--accent)" />
              <FactRow label="Chamber" value={p.chamber} />
              {partyWord && <FactRow label="Party" value={partyWord} />}
            </div>
          </div>

          {/* Copy-trades / performance card (real excess-return metrics) */}
          <div className="card p-5">
            <h3 className="text-[16px] font-bold text-center mb-3">{firstName(p.name)}&rsquo;s Trade Performance</h3>
            {avgExcess != null ? (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between text-[13px]">
                  <span className="text-mute">Avg. excess return / trade</span>
                  <span className="font-bold tabular" style={{ color: avgExcess >= 0 ? "#10B981" : "#EF4444" }}>
                    {avgExcess >= 0 ? "+" : ""}{avgExcess}%
                  </span>
                </div>
                <div className="flex items-center justify-between text-[13px]">
                  <span className="text-mute">Win rate (beat S&amp;P)</span>
                  <span className="font-bold tabular">{winRate}%</span>
                </div>
                <p className="text-[10.5px] text-faint pt-1">
                  Excess return vs. the S&amp;P 500 since each trade, averaged across {withEx.length} disclosed trades.
                </p>
              </div>
            ) : (
              <p className="text-[12px] text-mute">Not enough priced trades to compute performance yet.</p>
            )}
            <Link href="/premium" className="btn-primary w-full justify-center mt-4 text-[13px]">
              Track {firstName(p.name)}&rsquo;s trades
            </Link>
          </div>
        </aside>

        {/* ── RIGHT: content ──────────────────────────────────────────── */}
        <div className="min-w-0 space-y-6">
          {/* Section tab bar (sticky) */}
          <div className="sticky top-2 z-20">
            <div className="flex gap-1 overflow-x-auto scrollbar-visible rounded-lg p-1" style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}>
              {SECTIONS.map((sec) => (
                <button key={sec.id} onClick={() => scrollTo(sec.id)}
                  className="px-3 py-1.5 rounded-md text-[12.5px] font-semibold whitespace-nowrap transition"
                  style={{ background: active === sec.id ? "var(--accent)" : "transparent", color: active === sec.id ? "#fff" : "var(--text-soft)" }}>
                  {sec.label}
                </button>
              ))}
            </div>
          </div>

          {/* Trade Volume by Year + Top Sectors */}
          <div className="grid grid-cols-1 xl:grid-cols-[1.4fr_1fr] gap-5">
            <section className="card p-4 sm:p-5">
              <h2 className="text-[15px] font-bold mb-3">Trade Volume by Year</h2>
              <VolumeByYear data={p.volumeByYear} />
              <div className="flex items-center gap-4 mt-3 text-[11px] text-mute">
                <Legend color="#10B981" label="Purchases" /><Legend color="#EF4444" label="Sales" />
              </div>
            </section>
            <section className="card p-4 sm:p-5">
              <h2 className="text-[15px] font-bold mb-3">Top Traded Sectors</h2>
              {p.topSectors.length === 0 ? <p className="text-mute text-sm">No sector data.</p> : (
                <div className="space-y-2.5">
                  {p.topSectors.map((sec) => {
                    const max = p.topSectors[0].estValue || 1;
                    return (
                      <div key={sec.sector}>
                        <div className="flex justify-between text-[12.5px] mb-1">
                          <span className="font-medium truncate">{sec.sector}</span>
                          <span className="text-mute font-mono">{formatCurrency(sec.estValue)}</span>
                        </div>
                        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bg-2)" }}>
                          <div style={{ width: `${(sec.estValue / max) * 100}%`, height: "100%", background: "var(--accent)" }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>

      {/* Trades */}
      <section id="trades" ref={(el) => { refs.current.trades = el; }}>
        <h2 className="text-[15px] font-bold uppercase tracking-wide mb-1">Trades</h2>
        <p className="text-[12px] text-mute mb-2">Click a stock for more details.</p>
        <div className="card overflow-hidden">
          <DataTable<PolTrade> rows={p.trades} rowKey={(r, i) => `${r.ticker}-${r.transactionDate}-${i}`} columns={tradeCols} />
        </div>
      </section>

      {/* Live Stock Portfolio */}
      <section id="portfolio" ref={(el) => { refs.current.portfolio = el; }}>
        <h2 className="text-[15px] font-bold uppercase tracking-wide mb-2">Estimated Live Stock Portfolio</h2>
        <div className="card overflow-hidden">
          {p.portfolio.length ? (
            <DataTable<Holding> rows={p.portfolio} rowKey={(r) => r.ticker} columns={portCols} />
          ) : (<div className="p-8 text-center text-mute text-sm">No net long positions from disclosed trades.</div>)}
        </div>
        <p className="text-[11px] text-faint mt-2">Holdings estimated from disclosed buy/sell ranges valued at current prices — not live balances.</p>
      </section>

      {/* Net Worth = estimated portfolio value over time (honestly labelled) */}
      <section id="networth" ref={(el) => { refs.current.networth = el; }}>
        <h2 className="text-[15px] font-bold uppercase tracking-wide mb-2">Estimated Portfolio Value</h2>
        <div className="card p-4 sm:p-5">
          <div className="text-[28px] sm:text-[34px] font-bold tracking-tight tabular">
            {s.estPortfolioValue != null ? formatCurrency(s.estPortfolioValue) : "—"}
          </div>
          <div className="text-[12px] text-mute mb-3">Estimated value of disclosed-stock holdings (live)</div>
          {p.portfolioSeries.length > 1 ? (
            <AreaChart data={p.portfolioSeries} />
          ) : (<p className="text-mute text-sm py-8 text-center">Not enough trade history to chart.</p>)}
          <p className="text-[11px] text-faint mt-3">
            Estimated from disclosed trades (STOCK Act dollar ranges) valued at historical market prices —
            this is a stock-portfolio estimate, <strong>not total net worth</strong> (which would require annual
            financial-disclosure asset filings we don&rsquo;t yet ingest).
          </p>
        </div>
      </section>

      {/* Honest "needs data source" sections */}
      <NeedsData id="disclosed" refs={refs} title="Disclosed Holdings"
        note="Requires annual House/Senate Financial Disclosure statements (assets, real property, options with valuation ranges). No free machine-readable source is wired yet." />
      {/* Fundraising (FEC) */}
      {p.fundraising ? (
        <section id="fundraising" ref={(el) => { refs.current.fundraising = el; }}>
          <h2 className="text-[15px] font-bold uppercase tracking-wide mb-2">
            Fundraising{p.fundraising.cycle ? ` · ${p.fundraising.cycle} cycle` : ""}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
            <div className="card p-4"><div className="text-[10.5px] uppercase tracking-wider text-mute font-bold">Total Receipts</div><div className="text-[20px] font-bold tabular mt-1">{p.fundraising.totalReceipts != null ? formatCurrency(p.fundraising.totalReceipts) : "—"}</div></div>
            <div className="card p-4"><div className="text-[10.5px] uppercase tracking-wider text-mute font-bold">Total Spending</div><div className="text-[20px] font-bold tabular mt-1">{p.fundraising.totalDisbursements != null ? formatCurrency(p.fundraising.totalDisbursements) : "—"}</div></div>
            <div className="card p-4"><div className="text-[10.5px] uppercase tracking-wider text-mute font-bold">Cash on Hand</div><div className="text-[20px] font-bold tabular mt-1">{p.fundraising.cashOnHand != null ? formatCurrency(p.fundraising.cashOnHand) : "—"}</div></div>
          </div>
          {p.fundraising.topContributors.length > 0 && (
            <div className="card p-4">
              <div className="text-[13px] font-bold mb-2">Top Contributors (by employer)</div>
              <div className="space-y-2">
                {p.fundraising.topContributors.map((c) => {
                  const max = p.fundraising!.topContributors[0].amount || 1;
                  return (
                    <div key={c.name}>
                      <div className="flex justify-between text-[12.5px] mb-1"><span className="truncate">{c.name}</span><span className="font-mono text-mute">{formatCurrency(c.amount)}</span></div>
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bg-2)" }}><div style={{ width: `${(c.amount / max) * 100}%`, height: "100%", background: "var(--accent)" }} /></div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          <p className="text-[11px] text-faint mt-2">Source: FEC (OpenFEC). Campaign-committee totals for the most recent cycle.</p>
        </section>
      ) : (
        <NeedsData id="fundraising" refs={refs} title="Fundraising"
          note="Live FEC campaign-finance data activates once an FEC_API_KEY (free, from api.data.gov) is set. No match / no key yet." />
      )}

      {/* Proposed Legislation (Congress.gov) */}
      {p.legislation && p.legislation.length > 0 ? (
        <section id="legislation" ref={(el) => { refs.current.legislation = el; }}>
          <h2 className="text-[15px] font-bold uppercase tracking-wide mb-2">Proposed Legislation</h2>
          <div className="card overflow-hidden divide-y" style={{ borderColor: "var(--border)" }}>
            {p.legislation.map((b, i) => (
              <a key={i} href={b.url || "#"} target="_blank" rel="noopener noreferrer"
                className="block p-3.5 hover:bg-[var(--accent-soft)] transition">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[13.5px] font-semibold leading-snug">{b.title}</div>
                    <div className="text-[11px] text-mute mt-0.5">
                      {b.number && <span className="font-mono">{b.number}</span>}
                      {b.introducedDate && <span> · Introduced {formatDate(b.introducedDate)}</span>}
                    </div>
                  </div>
                  {b.latestActionDate && (
                    <span className="text-[11px] text-mute whitespace-nowrap flex-shrink-0">{formatDate(b.latestActionDate)}</span>
                  )}
                </div>
                {b.latestAction && <div className="text-[11.5px] text-soft mt-1 line-clamp-1">{b.latestAction}</div>}
              </a>
            ))}
          </div>
          <p className="text-[11px] text-faint mt-2">Source: Congress.gov — sponsored legislation.</p>
        </section>
      ) : (
        <NeedsData id="legislation" refs={refs} title="Proposed Legislation"
          note="Live Congress.gov sponsored-legislation activates once a CONGRESS_API_KEY (free, from api.congress.gov) is set. No match / no key yet." />
      )}
        </div>
      </div>
    </div>
  );
}

function NeedsData({ id, refs, title, note }: { id: string; refs: React.MutableRefObject<Record<string, HTMLElement | null>>; title: string; note: string }) {
  return (
    <section id={id} ref={(el) => { refs.current[id] = el; }}>
      <h2 className="text-[15px] font-bold uppercase tracking-wide mb-2">{title}</h2>
      <div className="card p-6 flex items-start gap-3" style={{ borderStyle: "dashed" }}>
        <Lock className="h-5 w-5 flex-shrink-0 mt-0.5 text-mute" />
        <div>
          <div className="font-semibold text-[14px]">Data source not yet connected</div>
          <p className="text-[12.5px] text-mute mt-1 leading-relaxed">{note}</p>
        </div>
      </div>
    </section>
  );
}

function SideStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[18px] font-bold tracking-tight tabular leading-none">{value}</div>
      <div className="text-[10.5px] uppercase tracking-wider text-mute font-semibold mt-1.5">{label}</div>
    </div>
  );
}

function FactRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div className="flex items-center justify-between py-2.5 text-[13px]">
      <span className="text-mute">{label}</span>
      <span className="font-semibold" style={valueColor ? { color: valueColor } : undefined}>{value}</span>
    </div>
  );
}

function firstName(name: string): string {
  return (name || "").trim().split(/\s+/)[0] || name;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-3" style={{ background: "var(--bg-1)" }}>
      <div className="text-[10.5px] uppercase tracking-wider text-mute font-bold">{label}</div>
      <div className="text-[17px] font-bold tracking-tight mt-1 tabular">{value}</div>
    </div>
  );
}
function Legend({ color, label }: { color: string; label: string }) {
  return <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: color }} />{label}</span>;
}

function VolumeByYear({ data }: { data: YearVol[] }) {
  const [hover, setHover] = useState<number | null>(null);
  if (!data.length) return <p className="text-mute text-sm">No trade history.</p>;
  const max = Math.max(1, ...data.map((d) => Math.max(d.buyValue, d.sellValue)));
  return (
    <div className="flex items-end gap-3 h-48 pt-4" style={{ overflowX: "auto" }}>
      {data.map((d) => (
        <div key={d.year} className="flex flex-col items-center gap-1.5 flex-1 min-w-[44px] relative"
          onMouseEnter={() => setHover(d.year)} onMouseLeave={() => setHover(null)}>
          {hover === d.year && (
            <div className="absolute -top-1 z-10 text-[11px] rounded px-2 py-1 whitespace-nowrap"
              style={{ background: "var(--text)", color: "var(--bg-1)", transform: "translateY(-100%)" }}>
              Buy {formatCurrency(d.buyValue)} · Sell {formatCurrency(d.sellValue)}
            </div>
          )}
          <div className="flex items-end gap-1 w-full justify-center" style={{ height: 150 }}>
            <div style={{ width: 14, height: `${(d.buyValue / max) * 100}%`, background: "#10B981", borderRadius: "3px 3px 0 0", minHeight: d.buyValue > 0 ? 3 : 0 }} />
            <div style={{ width: 14, height: `${(d.sellValue / max) * 100}%`, background: "#EF4444", borderRadius: "3px 3px 0 0", minHeight: d.sellValue > 0 ? 3 : 0 }} />
          </div>
          <span className="text-[11px] text-mute font-mono">{d.year}</span>
        </div>
      ))}
    </div>
  );
}

/** Full-width area/line chart of the estimated portfolio value over time. */
function AreaChart({ data }: { data: { date: string; value: number }[] }) {
  const W = 900, H = 220, pad = 8;
  const { path, area, max } = useMemo(() => {
    const vals = data.map((d) => d.value);
    const max = Math.max(1, ...vals);
    const n = data.length;
    const x = (i: number) => pad + (i / (n - 1)) * (W - pad * 2);
    const y = (v: number) => H - pad - (v / max) * (H - pad * 2);
    const pts = data.map((d, i) => `${x(i).toFixed(1)},${y(d.value).toFixed(1)}`);
    return {
      path: `M ${pts.join(" L ")}`,
      area: `M ${x(0).toFixed(1)},${(H - pad).toFixed(1)} L ${pts.join(" L ")} L ${x(n - 1).toFixed(1)},${(H - pad).toFixed(1)} Z`,
      max,
    };
  }, [data]);
  const first = data[0], last = data[data.length - 1];
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" role="img" aria-label="Estimated portfolio value over time">
        <defs>
          <linearGradient id="pv" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="var(--accent)" stopOpacity="0.35" />
            <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#pv)" />
        <path d={path} fill="none" stroke="var(--accent)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="flex justify-between text-[11px] text-mute mt-1">
        <span>{formatDate(first.date)}</span>
        <span className="font-mono">peak {formatCurrency(max)}</span>
        <span>{formatDate(last.date)}</span>
      </div>
    </div>
  );
}

function initials(name: string): string {
  const parts = name.replace(/[^A-Za-z ]/g, "").trim().split(/\s+/);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts[parts.length - 1][0] || "")).toUpperCase();
}
