"use client";
import { use, useMemo, useState } from "react";
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
  corporateDonors: { name: string; amount: number }[];
  supporters: { name: string; amount: number }[];
  opponents: { name: string; amount: number }[];
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
  { id: "supporters", label: "Supporters" },
  { id: "opponents", label: "Opponents" },
  { id: "donors", label: "Corporate Donors" },
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

        {/* ── RIGHT: content (tab-switched) ───────────────────────────── */}
        <div className="min-w-0 space-y-5">
          {/* Tab bar — click switches the panel below (not scroll) */}
          <div className="flex flex-wrap gap-2">
            {SECTIONS.map((sec) => (
              <button key={sec.id} onClick={() => setActive(sec.id)}
                className="px-4 py-2 rounded-lg text-[13px] font-semibold transition"
                style={{
                  background: active === sec.id ? "var(--accent)" : "var(--bg-2)",
                  color: active === sec.id ? "#fff" : "var(--text-soft)",
                  border: `1px solid ${active === sec.id ? "var(--accent)" : "var(--border)"}`,
                }}>
                {sec.label}
              </button>
            ))}
          </div>

          {/* ── TRADES ── */}
          {active === "trades" && (
            <div className="space-y-5">
              <section className="card p-4 sm:p-5">
                <div className="grid grid-cols-1 xl:grid-cols-[1.5fr_1fr] gap-6">
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h2 className="text-[15px] font-bold">Trade Volume by Year</h2>
                      <div className="flex items-center gap-3 text-[11px] text-mute">
                        <Legend color="#10B981" label="Buy" /><Legend color="#EF4444" label="Sell" />
                      </div>
                    </div>
                    <VolumeByYear data={p.volumeByYear} />
                  </div>
                  <div className="xl:border-l xl:pl-6" style={{ borderColor: "var(--border)" }}>
                    <div className="flex gap-8 mb-4">
                      <div>
                        <div className="text-[22px] font-bold tracking-tight tabular">{formatCurrency(s.estTotalVolume)}</div>
                        <div className="text-[11px] uppercase tracking-wider text-mute font-semibold mt-0.5">Trade Volume</div>
                      </div>
                      <div>
                        <div className="text-[22px] font-bold tracking-tight tabular">{s.totalTrades}</div>
                        <div className="text-[11px] uppercase tracking-wider text-mute font-semibold mt-0.5">Total Trades</div>
                      </div>
                    </div>
                    <div className="text-[13px] font-bold mb-2">Top Traded Sectors</div>
                    {p.topSectors.length === 0 ? <p className="text-mute text-sm">No sector data.</p> : <SectorDonut data={p.topSectors} />}
                  </div>
                </div>
              </section>

              <section>
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-[15px] font-bold uppercase tracking-wide">Trades</h2>
                  <span className="text-[11px] text-mute">Click a stock for details</span>
                </div>
                <div className="card overflow-hidden">
                  <DataTable<PolTrade> rows={p.trades} rowKey={(r, i) => `${r.ticker}-${r.transactionDate}-${i}`} columns={tradeCols} />
                </div>
              </section>
            </div>
          )}

          {/* ── LIVE STOCK PORTFOLIO ── */}
          {active === "portfolio" && (
            <section>
              <h2 className="text-[15px] font-bold uppercase tracking-wide mb-2">Estimated Live Stock Portfolio</h2>
              <div className="card overflow-hidden">
                {p.portfolio.length ? (
                  <DataTable<Holding> rows={p.portfolio} rowKey={(r) => r.ticker} columns={portCols} />
                ) : (<div className="p-8 text-center text-mute text-sm">No net long positions from disclosed trades.</div>)}
              </div>
              <p className="text-[11px] text-faint mt-2">Holdings estimated from disclosed buy/sell ranges valued at current prices — not live balances.</p>
            </section>
          )}

          {/* ── NET WORTH (estimated portfolio value) ── */}
          {active === "networth" && (
            <section>
              <h2 className="text-[15px] font-bold uppercase tracking-wide mb-2">Estimated Portfolio Value</h2>
              <div className="card p-4 sm:p-5">
                <div className="grid grid-cols-1 xl:grid-cols-[1.6fr_1fr] gap-6">
                  {/* Left: value chart with axes */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-[15px] font-bold">Portfolio Value</span>
                    </div>
                    {p.portfolioSeries.length > 1 ? (
                      <AreaChart data={p.portfolioSeries} />
                    ) : (<p className="text-mute text-sm py-8 text-center">Not enough trade history to chart.</p>)}
                  </div>
                  {/* Right: current value + Top Holdings donut */}
                  <div className="xl:border-l xl:pl-6" style={{ borderColor: "var(--border)" }}>
                    <div className="text-[26px] sm:text-[30px] font-bold tracking-tight tabular">
                      {s.estPortfolioValue != null ? formatCurrency(s.estPortfolioValue) : "—"}
                    </div>
                    <div className="text-[11px] uppercase tracking-wider text-mute font-semibold mt-0.5 mb-4">Current Est. (stock)</div>
                    <div className="text-[13px] font-bold mb-2">Top Holdings</div>
                    {p.portfolio.length ? <HoldingsDonut data={p.portfolio} /> : <p className="text-mute text-sm">No holdings.</p>}
                  </div>
                </div>
                <p className="text-[11px] text-faint mt-4">
                  Estimated from disclosed trades (STOCK Act dollar ranges) valued at historical market prices —
                  this is a stock-portfolio estimate, <strong>not total net worth</strong> (which would require annual
                  financial-disclosure asset filings we don&rsquo;t yet ingest).
                </p>
              </div>
            </section>
          )}

          {/* ── SUPPORTERS (FEC independent expenditures — support) ── */}
          {active === "supporters" && (
            p.supporters && p.supporters.length > 0 ? (
              <section>
                <h2 className="text-[15px] font-bold uppercase tracking-wide mb-1">Supporters</h2>
                <p className="text-[12px] text-mute mb-3">Outside groups that spent money <span style={{ color: "#10B981" }} className="font-semibold">supporting</span> this member (FEC independent expenditures).</p>
                <div className="card p-4"><AmountBars rows={p.supporters} color="#10B981" /></div>
                <p className="text-[11px] text-faint mt-2">Source: FEC (OpenFEC) — Schedule E independent expenditures, by spending committee.</p>
              </section>
            ) : (
              <NeedsData title="Supporters"
                note="No outside groups have filed independent expenditures supporting this member (FEC Schedule E), or no FEC match. Nothing to show." />
            )
          )}

          {/* ── OPPONENTS (FEC independent expenditures — oppose) ── */}
          {active === "opponents" && (
            p.opponents && p.opponents.length > 0 ? (
              <section>
                <h2 className="text-[15px] font-bold uppercase tracking-wide mb-1">Opponents</h2>
                <p className="text-[12px] text-mute mb-3">Outside groups that spent money <span style={{ color: "#EF4444" }} className="font-semibold">opposing</span> this member (FEC independent expenditures).</p>
                <div className="card p-4"><AmountBars rows={p.opponents} color="#EF4444" /></div>
                <p className="text-[11px] text-faint mt-2">Source: FEC (OpenFEC) — Schedule E independent expenditures, by spending committee.</p>
              </section>
            ) : (
              <NeedsData title="Opponents"
                note="No outside groups have filed independent expenditures opposing this member (FEC Schedule E), or no FEC match. Nothing to show." />
            )
          )}

          {/* ── CORPORATE DONORS (FEC — real) + fundraising totals ── */}
          {active === "donors" && (
            <section>
              <h2 className="text-[15px] font-bold uppercase tracking-wide mb-2">Corporate Donors &amp; Fundraising</h2>
              {p.fundraising && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                  <div className="card p-4"><div className="text-[10.5px] uppercase tracking-wider text-mute font-bold">Total Receipts</div><div className="text-[20px] font-bold tabular mt-1">{p.fundraising.totalReceipts != null ? formatCurrency(p.fundraising.totalReceipts) : "—"}</div></div>
                  <div className="card p-4"><div className="text-[10.5px] uppercase tracking-wider text-mute font-bold">Total Spending</div><div className="text-[20px] font-bold tabular mt-1">{p.fundraising.totalDisbursements != null ? formatCurrency(p.fundraising.totalDisbursements) : "—"}</div></div>
                  <div className="card p-4"><div className="text-[10.5px] uppercase tracking-wider text-mute font-bold">Cash on Hand</div><div className="text-[20px] font-bold tabular mt-1">{p.fundraising.cashOnHand != null ? formatCurrency(p.fundraising.cashOnHand) : "—"}</div></div>
                </div>
              )}
              {p.corporateDonors && p.corporateDonors.length > 0 ? (
                <div className="card p-4">
                  <div className="text-[13px] font-bold mb-3">Top PAC / Committee Donors</div>
                  <div className="space-y-2.5">
                    {p.corporateDonors.map((c) => {
                      const max = p.corporateDonors[0].amount || 1;
                      return (
                        <div key={c.name}>
                          <div className="flex justify-between text-[12.5px] mb-1"><span className="truncate pr-2">{c.name}</span><span className="font-mono text-mute flex-shrink-0">{formatCurrency(c.amount)}</span></div>
                          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bg-2)" }}><div style={{ width: `${(c.amount / max) * 100}%`, height: "100%", background: "var(--accent)" }} /></div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : p.fundraising ? (
                <p className="text-[12.5px] text-mute">No itemized PAC/committee contributions found for this committee.</p>
              ) : (
                <NeedsData title="Corporate Donors"
                  note="Live FEC campaign-finance data activates once an FEC_API_KEY (free, from api.data.gov) is set. No match / no key yet." />
              )}
              <p className="text-[11px] text-faint mt-2">Source: FEC (OpenFEC) — committee totals + itemized non-individual (PAC/committee) contributions.</p>
            </section>
          )}

          {/* ── PROPOSED LEGISLATION (Congress.gov) ── */}
          {active === "legislation" && (
            p.legislation && p.legislation.length > 0 ? (
              <section>
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-[15px] font-bold uppercase tracking-wide">Proposed Legislation</h2>
                  <span className="text-[11px] text-mute">Click a row for details</span>
                </div>
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
              <NeedsData title="Proposed Legislation"
                note="Live Congress.gov sponsored-legislation activates once a CONGRESS_API_KEY (free, from api.congress.gov) is set. No match / no key yet." />
            )
          )}
        </div>
      </div>
    </div>
  );
}

function NeedsData({ title, note }: { title: string; note: string }) {
  return (
    <section>
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

/** Ranked name → $amount bars (donors / supporters / opponents). */
function AmountBars({ rows, color = "var(--accent)" }: { rows: { name: string; amount: number }[]; color?: string }) {
  const max = rows[0]?.amount || 1;
  return (
    <div className="space-y-2.5">
      {rows.map((r) => (
        <div key={r.name}>
          <div className="flex justify-between text-[12.5px] mb-1">
            <span className="truncate pr-2">{r.name}</span>
            <span className="font-mono text-mute flex-shrink-0">{formatCurrency(r.amount)}</span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bg-2)" }}>
            <div style={{ width: `${(r.amount / max) * 100}%`, height: "100%", background: color }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Compact $ axis label (e.g. 40M, 1.2M, 250K). */
function axisMoney(n: number): string {
  if (n >= 1e9) return `${+(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${+(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`;
  if (n >= 1e3) return `${Math.round(n / 1e3)}K`;
  return `${Math.round(n)}`;
}

function VolumeByYear({ data }: { data: YearVol[] }) {
  const [hover, setHover] = useState<number | null>(null);
  if (!data.length) return <p className="text-mute text-sm">No trade history.</p>;
  const rawMax = Math.max(1, ...data.map((d) => Math.max(d.buyValue, d.sellValue)));
  // Round the axis max up to a "nice" number and build 4 evenly-spaced ticks.
  const pow = Math.pow(10, Math.floor(Math.log10(rawMax)));
  const max = Math.ceil(rawMax / pow) * pow;
  const ticks = [1, 0.75, 0.5, 0.25, 0].map((f) => max * f);
  const H = 170;
  return (
    <div className="flex gap-2">
      {/* Y-axis */}
      <div className="flex flex-col justify-between text-[10px] text-mute font-mono text-right" style={{ height: H, paddingBottom: 18 }}>
        {ticks.map((t) => <span key={t}>{axisMoney(t)}</span>)}
      </div>
      {/* Bars */}
      <div className="flex-1 relative" style={{ minWidth: 0 }}>
        {/* gridlines */}
        <div className="absolute inset-0 flex flex-col justify-between" style={{ height: H }} aria-hidden>
          {ticks.map((t) => <div key={t} style={{ borderTop: "1px solid var(--border)", opacity: 0.5 }} />)}
        </div>
        <div className="flex items-end gap-2 relative" style={{ height: H, overflowX: "auto" }}>
          {data.map((d) => (
            <div key={d.year} className="flex flex-col items-center flex-1 min-w-[34px] relative h-full justify-end"
              onMouseEnter={() => setHover(d.year)} onMouseLeave={() => setHover(null)}>
              {hover === d.year && (
                <div className="absolute -top-1 z-10 text-[11px] rounded px-2 py-1 whitespace-nowrap"
                  style={{ background: "var(--text)", color: "var(--bg-1)", transform: "translateY(-100%)" }}>
                  Buy {formatCurrency(d.buyValue)} · Sell {formatCurrency(d.sellValue)}
                </div>
              )}
              <div className="flex items-end gap-0.5 w-full justify-center h-full">
                <div style={{ width: 12, height: `${(d.buyValue / max) * 100}%`, background: "#10B981", borderRadius: "2px 2px 0 0", minHeight: d.buyValue > 0 ? 2 : 0 }} />
                <div style={{ width: 12, height: `${(d.sellValue / max) * 100}%`, background: "#EF4444", borderRadius: "2px 2px 0 0", minHeight: d.sellValue > 0 ? 2 : 0 }} />
              </div>
            </div>
          ))}
        </div>
        {/* X-axis year labels */}
        <div className="flex gap-2 mt-1">
          {data.map((d) => (
            <span key={d.year} className="flex-1 min-w-[34px] text-center text-[10px] text-mute font-mono">{d.year}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

/** SPDR-style categorical palette for the sector donut. */
const DONUT_COLORS = ["#6366F1", "#EC4899", "#F97316", "#22C55E", "#EAB308", "#06B6D4", "#A855F7", "#F43F5E"];

/** Donut/pie of top traded sectors (by trade count) + legend. */
function SectorDonut({ data }: { data: SectorAgg[] }) {
  const slices = data.slice(0, 8);
  const total = slices.reduce((a, s) => a + s.trades, 0) || 1;
  let acc = 0;
  const R = 42, C = 50, sw = 16;
  const circ = 2 * Math.PI * R;
  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 100 100" width="104" height="104" className="flex-shrink-0 -rotate-90">
        {slices.map((s, i) => {
          const frac = s.trades / total;
          const dash = frac * circ;
          const el = (
            <circle key={s.sector} cx={C} cy={C} r={R} fill="none"
              stroke={DONUT_COLORS[i % DONUT_COLORS.length]} strokeWidth={sw}
              strokeDasharray={`${dash} ${circ - dash}`} strokeDashoffset={-acc * circ} />
          );
          acc += frac;
          return el;
        })}
      </svg>
      <div className="min-w-0 flex-1 space-y-1">
        {slices.map((s, i) => (
          <div key={s.sector} className="flex items-center gap-2 text-[12px]">
            <span className="h-2.5 w-2.5 rounded-sm flex-shrink-0" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
            <span className="truncate flex-1" style={{ color: DONUT_COLORS[i % DONUT_COLORS.length] }}>{s.sector}</span>
            <span className="font-mono font-semibold tabular flex-shrink-0">{s.trades}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Area/line chart of the estimated portfolio value over time, with a Y-axis
 *  (nice-rounded ticks + gridlines) and x-axis date labels — QuiverQuant style. */
function AreaChart({ data }: { data: { date: string; value: number }[] }) {
  const W = 900, H = 220, pad = 8;
  const { path, area, axisMax } = useMemo(() => {
    const rawMax = Math.max(1, ...data.map((d) => d.value));
    const pow = Math.pow(10, Math.floor(Math.log10(rawMax)));
    const axisMax = Math.ceil(rawMax / pow) * pow;
    const n = data.length;
    const x = (i: number) => pad + (i / Math.max(1, n - 1)) * (W - pad * 2);
    const y = (v: number) => H - pad - (v / axisMax) * (H - pad * 2);
    const pts = data.map((d, i) => `${x(i).toFixed(1)},${y(d.value).toFixed(1)}`);
    return {
      path: `M ${pts.join(" L ")}`,
      area: `M ${x(0).toFixed(1)},${(H - pad).toFixed(1)} L ${pts.join(" L ")} L ${x(n - 1).toFixed(1)},${(H - pad).toFixed(1)} Z`,
      axisMax,
    };
  }, [data]);
  const ticks = [1, 0.75, 0.5, 0.25, 0].map((f) => axisMax * f);
  // Up to ~6 evenly-spaced date labels along the x-axis.
  const step = Math.max(1, Math.ceil(data.length / 6));
  const xLabels = data.filter((_, i) => i % step === 0 || i === data.length - 1);
  return (
    <div className="flex gap-2">
      <div className="flex flex-col justify-between text-[10px] text-mute font-mono text-right" style={{ height: H, paddingBottom: 16 }}>
        {ticks.map((t) => <span key={t}>{axisMoney(t)}</span>)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="relative">
          <div className="absolute inset-0 flex flex-col justify-between" aria-hidden>
            {ticks.map((t) => <div key={t} style={{ borderTop: "1px solid var(--border)", opacity: 0.5 }} />)}
          </div>
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" className="relative" role="img" aria-label="Estimated portfolio value over time">
            <defs>
              <linearGradient id="pv" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor="var(--accent)" stopOpacity="0.35" />
                <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={area} fill="url(#pv)" />
            <path d={path} fill="none" stroke="var(--accent)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
          </svg>
        </div>
        <div className="flex justify-between text-[10px] text-mute font-mono mt-1">
          {xLabels.map((d) => <span key={d.date}>{formatDate(d.date)}</span>)}
        </div>
      </div>
    </div>
  );
}

/** Donut of top stock holdings (by $ value) + legend — the honest, stock-only
 *  analogue of QuiverQuant's asset-type "Top Holdings" pie. */
function HoldingsDonut({ data }: { data: Holding[] }) {
  const slices = data.slice(0, 8);
  const total = slices.reduce((a, h) => a + h.estValue, 0) || 1;
  let acc = 0;
  const R = 42, C = 50, sw = 16, circ = 2 * Math.PI * R;
  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 100 100" width="104" height="104" className="flex-shrink-0 -rotate-90">
        {slices.map((h, i) => {
          const frac = h.estValue / total;
          const dash = frac * circ;
          const el = (
            <circle key={h.ticker} cx={C} cy={C} r={R} fill="none"
              stroke={DONUT_COLORS[i % DONUT_COLORS.length]} strokeWidth={sw}
              strokeDasharray={`${dash} ${circ - dash}`} strokeDashoffset={-acc * circ} />
          );
          acc += frac;
          return el;
        })}
      </svg>
      <div className="min-w-0 flex-1 space-y-1">
        {slices.map((h, i) => (
          <div key={h.ticker} className="flex items-center gap-2 text-[12px]">
            <span className="h-2.5 w-2.5 rounded-sm flex-shrink-0" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
            <span className="font-mono font-semibold flex-1 truncate" style={{ color: DONUT_COLORS[i % DONUT_COLORS.length] }}>{h.ticker}</span>
            <span className="font-mono tabular flex-shrink-0 text-mute">{formatCurrency(h.estValue)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function initials(name: string): string {
  const parts = name.replace(/[^A-Za-z ]/g, "").trim().split(/\s+/);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts[parts.length - 1][0] || "")).toUpperCase();
}
